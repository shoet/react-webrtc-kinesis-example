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
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  async function prepare() {
    console.log("### start setup", { kinesisInfo });
    const clientId = crypto.randomUUID();
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
      peerConnectionRef.current.onicecandidate = async (ev) => {
        console.log("[Viewer] ICE Candidate発生", { ev });
        if (ev.candidate) {
          console.log("[Viewer] ICE候補送信");
          await signalingClientRef.current?.sendIceCandidate(
            clientId,
            ev.candidate,
          );
        }
      };

      // シグナリングチャネルに接続するクライアントを作成する
      const signalingClient = new SignalingWebSocketClient(
        props.kinesisInfo.region,
        props.kinesisInfo.signalingChannelArn,
        "VIEWER",
        props.kinesisInfo.credentials,
        clientId,
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
            } catch (e) {
              // Could not find webcam
              return;
            }
          },
          onSdpAnswer: async (answer: RTCSessionDescriptionInit) => {
            console.log("[Viewer] SDPアンサーコールバックの実行", { answer });
          },
          onIceCandidate: (candidate: RTCIceCandidate) => {
            console.log("[Viewer] ICE候補コールバックの実行", { candidate });
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
      await signalingClient.connectViewer();
      signalingClientRef.current = signalingClient;
    } catch (e) {
      throw new Error("failed to setup webrtc", { cause: e });
    }
  }

  async function sendOffer(peerConnection: RTCPeerConnection) {
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await peerConnection.setLocalDescription(offer);
    if (peerConnection.localDescription) {
      signalingClientRef.current?.sendSDPOffer(peerConnection.localDescription);
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
          await prepare();
        }}
      >
        prepare
      </button>
      <button
        type="button"
        className={clsx(
          "bg-gradient-to-br from-blue-800 to-cyan-800 p-4 rounded-xl",
          "hover:from-blue-900 hover:to-cyan-900 p-4 rounded-xl",
          "cursor-pointer",
        )}
        onClick={async () => {
          peerConnectionRef.current &&
            (await sendOffer(peerConnectionRef.current));
        }}
      >
        send offer
      </button>
      <div>
        <div>video</div>
        <video ref={videoRef} />
      </div>
    </div>
  );
};
