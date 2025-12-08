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

export const WebRTCSignalingViewer = (props: Props) => {
  const { kinesisInfo } = props;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const signalingClientRef = useRef<SignalingWebSocketClient | null>(null);

  async function setup() {
    console.log("### start setup", { kinesisInfo });
    try {
      // ICEサーバー構成情報取得
      const iceServers = await getIceServerConfig(
        props.kinesisInfo.region,
        props.kinesisInfo.signalingChannelArn,
        props.kinesisInfo.credentials,
      );
      const peerConnection = new RTCPeerConnection({ iceServers: iceServers });

      // シグナリングチャネルに接続するクライアントを作成する
      const signalingClient = new SignalingWebSocketClient(
        props.kinesisInfo.region,
        props.kinesisInfo.signalingChannelArn,
        "VIEWER",
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
                  peerConnection.addTrack(track, localStream),
                );
              streamRef.current = localStream;
              // SDP オファーを作成し、マスターに送信します
              // ブラウザの互換性を気にしない場合は、`addTransceiver` を使用する方が良いでしょう
              const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
              });
              await peerConnection.setLocalDescription(offer);
              if (peerConnection.localDescription) {
                // signalingClient.sendSdpOffer(peerConnection.localDescription);
              }
            } catch (e) {
              // Could not find webcam
              return;
            }
          },
          onSdpAnswer: async (answer: RTCSessionDescriptionInit) => {
            // シグナリング チャネル接続が開いたら、Web カメラに接続し、マスターに送信するオファーを作成します。
            // SDP 応答をマスターから受信したら、それをピア接続に追加します。
            await peerConnection.setRemoteDescription(answer);
          },
          onIceCandidate: (candidate: RTCIceCandidate) => {
            // マスターから ICE 候補を受信したら、それをピア接続に追加します。
            peerConnection.addIceCandidate(candidate);
          },
          onClose: () => {
            // Clean up
          },
          onError: () => {
            // Handle client errors
          },
        },
      );
      await signalingClient.connectViewer();
      signalingClientRef.current = signalingClient;
    } catch (e) {
      throw new Error("failed to setup webrtc", { cause: e });
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
          await setup();
        }}
      >
        start view
      </button>
      <div>
        <div>video</div>
        <video ref={videoRef} />
      </div>
    </div>
  );
};
