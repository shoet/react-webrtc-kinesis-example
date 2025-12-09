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
  const viewerPeerRef = useRef<Record<string, RTCPeerConnection>>({});

  async function prepare() {
    console.log("### start setup", { kinesisInfo });
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
        "MASTER",
        props.kinesisInfo.credentials,
        crypto.randomUUID(),
        {
          onOpen: async () => {
            // Web カメラからのストリームを保持
            try {
              streamRef.current = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: true,
              });
            } catch (e) {
              // Could not find webcam
              return;
            }
          },
          onSdpOffer: async (
            senderClientId: string,
            offer: RTCSessionDescriptionInit,
          ) => {
            console.log(
              `[Master - ${senderClientId}] SDPオファーコールバックの実行`,
              {
                senderClientId,
                offer,
              },
            );

            console.log(`[Master - ${senderClientId}] ピア接続の作成`);
            const clientPeerConnection = await createNewPeerConnection(
              senderClientId,
              iceServers,
            );
            clientPeerConnection.addEventListener("icecandidate", (ev) => {
              console.log(`[Master - ${senderClientId}] ICE Candidate発生`, {
                ev,
              });
            });

            console.log(`[Master - ${senderClientId}] SDPアンサーを返送する`);
            await clientPeerConnection.setRemoteDescription(offer);
            await sendAnswer(senderClientId, clientPeerConnection);

            viewerPeerRef.current[senderClientId] = clientPeerConnection;
          },
          onIceCandidate: (candidate: RTCIceCandidate) => {
            console.log("[Master] ICE候補コールバックの実行", { candidate });
            // ビューアーから ICE 候補を受信したら、それをピア接続に追加します。
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
    console.log("[Master] SDPアンサーの返送");
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

  async function createNewPeerConnection(
    clientId: string,
    iceServers: RTCIceServer[],
  ) {
    const peerConnection = new RTCPeerConnection({
      iceServers: iceServers,
    });
    peerConnection.addEventListener("icecandidate", async (ev) => {
      console.log(`[Master] ICE Candidate発生: ${clientId}`, { ev });
      if (ev.candidate) {
        console.log(`[Master] ICE Candidate送信: ${clientId}`, {
          candidate: ev.candidate,
        });
        await signalingClientRef.current?.sendIceCandidate(
          clientId,
          ev.candidate,
        );
      }
    });
    return peerConnection;
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
