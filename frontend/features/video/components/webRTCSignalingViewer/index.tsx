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

  async function start() {
    console.log("### start setup", { kinesisInfo });
    const clientId = crypto.randomUUID();
    try {
      // ICEサーバー構成情報取得
      const iceServers = await getIceServerConfig(
        props.kinesisInfo.region,
        props.kinesisInfo.signalingChannelArn,
        props.kinesisInfo.credentials,
      );
      // シグナリングチャネルに接続するクライアントを作成する
      const signalingClient = new SignalingWebSocketClient(
        props.kinesisInfo.region,
        props.kinesisInfo.signalingChannelArn,
        "VIEWER",
        props.kinesisInfo.credentials,
        clientId,
        {
          // シグナリングサーバーと接続が確立
          onOpen: async () => {
            // Peerを生成
            peerConnectionRef.current = new RTCPeerConnection({
              iceServers: iceServers,
            });
            peerConnectionRef.current.onicecandidate = async (ev) => {
              console.log("[Viewer] ICE Candidate発生", { ev });
              if (ev.candidate) {
                console.log("[Viewer] ICE候補送信");
                // ICE候補をマスターに送信
                await signalingClientRef.current?.sendIceCandidate(
                  clientId,
                  ev.candidate,
                );
              }
            };

            // ストリームを取得してPeerに接続
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
              if (videoRef.current) {
                videoRef.current.srcObject = streamRef.current;
              }
            } catch (e) {
              // Could not find webcam
              return;
            }
            // SDPオファーを送信
            if (peerConnectionRef.current) {
              await sendOffer(peerConnectionRef.current);
            }
          },
          onSdpAnswer: async (answer: RTCSessionDescriptionInit) => {
            console.log("[Viewer] SDPアンサーコールバックの実行", { answer });
            // SDPアンサーをPeerに設定
            if (peerConnectionRef.current) {
              await peerConnectionRef.current.setRemoteDescription(answer);
            }
          },
          onIceCandidate: async (
            candidate: RTCIceCandidate,
            senderClientId?: string,
          ) => {
            console.log("[Viewer] ICE候補コールバックの実行", { candidate });
            // マスターから返送されたICE候補をPeerに設定
            await peerConnectionRef.current?.addIceCandidate(candidate);
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
          await start();
        }}
      >
        prepare
      </button>
      <div
        className={clsx(
          "h-flex-col flex items-center justify-center",
          "rounded-xl",
          "relative",
        )}
      >
        <video
          className={clsx("aspect-video h-full w-full rounded-xl object-cover")}
          ref={videoRef}
          muted
          autoPlay
          playsInline
        />
      </div>
    </div>
  );
};
