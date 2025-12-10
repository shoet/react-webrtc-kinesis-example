import clsx from "clsx";
import {
  getIceServerConfig,
  SignalingWebSocketClient,
  type AwsCredentialsType,
} from "libs/kinesisWebRTC";
import { useRef, useState } from "react";

type Props = {
  kinesisInfo: {
    signalingChannelArn: string;
    region: string;
    credentials?: AwsCredentialsType;
  };
};

type ViewerPeer = {
  peerConnection: RTCPeerConnection | null;
  stream: MediaStream | null;
};

export const WebRTCSignalingMaster = (props: Props) => {
  const { kinesisInfo } = props;
  const streamRef = useRef<MediaStream | null>(null);
  const signalingClientRef = useRef<SignalingWebSocketClient | null>(null);
  const viewerPeerRef = useRef(new Map<string, ViewerPeer>());
  const [clientIds, setClientIds] = useState<string[]>([]);

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
            offer: RTCSessionDescriptionInit,
            senderClientId?: string,
          ) => {
            console.log(
              `[Master - ${senderClientId}] SDPオファーコールバックの実行`,
              {
                offer,
                senderClientId,
              },
            );

            if (!senderClientId) {
              console.error("viewer is required sender client id");
              return;
            }

            console.log(`[Master - ${senderClientId}] ピア接続の作成`);
            const viewerPeer: ViewerPeer = {
              peerConnection: null,
              stream: null,
            };
            const peerConnection = new RTCPeerConnection({
              iceServers: iceServers,
            });
            peerConnection.addEventListener("icecandidate", async (ev) => {
              console.log(`[Master] ICE Candidate発生: ${senderClientId}`, {
                ev,
              });
              if (ev.candidate) {
                console.log(`[Master] ICE Candidate送信: ${senderClientId}`, {
                  candidate: ev.candidate,
                });
                await signalingClientRef.current?.sendIceCandidate(
                  senderClientId,
                  ev.candidate,
                );
              }
            });
            viewerPeerRef.current[senderClientId] = peerConnection;
            setClientIds((prev) => [...prev, senderClientId]);

            console.log(`[Master - ${senderClientId}] SDPアンサーを返送する`);
            await peerConnection.setRemoteDescription(offer);
            console.log("[Master] SDPアンサーの返送");
            const answer = await peerConnection.createAnswer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true,
            });
            await peerConnection.setLocalDescription(answer);
            if (peerConnection.localDescription) {
              signalingClientRef.current?.sendSDPAnswer(
                senderClientId,
                peerConnection.localDescription,
              );
            }
          },
          onIceCandidate: async (
            candidate: RTCIceCandidate,
            senderClientId?: string,
          ) => {
            console.log("[Master] ICE候補コールバックの実行", { candidate });
            // ビューアーから ICE 候補を受信したら、それをピア接続に追加します。
            if (!senderClientId) {
              console.error("viewer is required sender client id");
              return;
            }
            const peer = viewerPeerRef.current.get(senderClientId);
            if (peer?.peerConnection) {
              await peer.peerConnection.addIceCandidate(candidate);
            }
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
      <div className={clsx("grid grid-cols-2")}>
        {clientIds.map((c) => (
          <div
            className={clsx(
              "max-w-xl w-full border border-slate-500 rounded-xl mt-4",
            )}
          >
            <video
              className={clsx(
                "aspect-video h-full w-full rounded-xl object-cover",
              )}
              // ref={}
              muted
              autoPlay
              playsInline
            />
          </div>
        ))}
      </div>
    </div>
  );
};
