import clsx from "clsx";
import {
  getIceServerConfig,
  SignalingWebSocketClient,
  type AwsCredentialsType,
} from "libs/kinesisWebRTC";
import { useRef } from "react";

type Props = {
  kinesisInfo: {
    signalingChannelArn: string;
    region: string;
    credentials?: AwsCredentialsType;
  };
};

export const WebRTCSignalingMaster = (props: Props) => {
  const { kinesisInfo } = props;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const signalingClientRef = useRef<SignalingWebSocketClient | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  async function prepare() {
    console.log("### start setup", { kinesisInfo });
    try {
      // ICEサーバー構成情報取得
      const iceServers = await getIceServerConfig(
        props.kinesisInfo.region,
        props.kinesisInfo.signalingChannelArn,
        props.kinesisInfo.credentials,
      );
      peerConnectionRef.current = new RTCPeerConnection({
        iceServers: iceServers,
      });

      // シグナリングチャネルに接続するクライアントを作成する
      const signalingClient = new SignalingWebSocketClient(
        props.kinesisInfo.region,
        props.kinesisInfo.signalingChannelArn,
        "MASTER",
        props.kinesisInfo.credentials,
        crypto.randomUUID(),
        {
          onOpen: async () => {
            // Web カメラからストリームを取得し、ピア接続に追加して、ローカル ビューに表示します
            try {
              const localStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: true,
              });
              localStream
                .getTracks()
                .forEach((track) =>
                  peerConnectionRef.current?.addTrack(track, localStream),
                );
              streamRef.current = localStream;
              // SDP オファーを作成し、マスターに送信します
              // ブラウザの互換性を気にしない場合は、`addTransceiver` を使用する方が良いでしょう
              const offer = await peerConnectionRef.current?.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
              });
              await peerConnectionRef.current?.setLocalDescription(offer);
              if (peerConnectionRef.current?.localDescription) {
                // signalingClient.sendSdpOffer(peerConnection.localDescription);
              }
            } catch (e) {
              // Could not find webcam
              return;
            }
          },
          onSdpOffer: async (
            senderClientId: string,
            offer: RTCSessionDescriptionInit,
          ) => {
            console.log("SDPオファーコールバックの実行", {
              senderClientId,
              offer,
            });
            await peerConnectionRef.current?.setRemoteDescription(offer);
            if (peerConnectionRef.current) {
              console.log("SDPアンサーを返送する");
              await sendAnswer(senderClientId, peerConnectionRef.current);
            }
          },
          onIceCandidate: (candidate: RTCIceCandidate) => {
            // マスターから ICE 候補を受信したら、それをピア接続に追加します。
            peerConnectionRef.current?.addIceCandidate(candidate);
          },
          onClose: () => {
            // Clean up
          },
          onError: () => {
            // Handle client errors
          },
        },
      );
      await signalingClient.connectMaster();
      signalingClientRef.current = signalingClient;
    } catch (e) {
      throw new Error("failed to setup webrtc", { cause: e });
    }
  }

  async function sendAnswer(
    offerSenderClientId: string,
    peerConnection: RTCPeerConnection,
  ) {
    console.log("SDPアンサーの返送");
    const offer = await peerConnection.createAnswer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await peerConnection.setLocalDescription(offer);
    if (peerConnection.localDescription) {
      signalingClientRef.current?.sendSDPAnswer(
        offerSenderClientId,
        peerConnection.localDescription,
      );
    }
  }

  return (
    <div>
      <button
        type="button"
        className={clsx(
          "bg-gradient-to-br from-blue-800 to-cyan-800 p-4 rounded-xl",
          "hover:from-blue-900 hover:to-cyan-900 p-4 rounded-xl",
          "cursor-pointer",
        )}
        onClick={async () => {
          console.log("click");
          await prepare();
        }}
      >
        start master
      </button>
      <div>
        <div>video</div>
        <video ref={videoRef} />
      </div>
    </div>
  );
};
