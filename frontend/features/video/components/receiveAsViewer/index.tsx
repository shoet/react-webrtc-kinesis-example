import clsx from "clsx";
import {
  getIceServerConfig,
  SignalingWebSocketClient,
  type AwsCredentialsType,
} from "libs/kinesisWebRTC";
import { useRef, useState } from "react";

type Props = {
  region: string;
  signalingChannelArn: string;
  credentials: AwsCredentialsType;
};
export const ReceiveAsViewer = (props: Props) => {
  const connectionPeerRef = useRef<RTCPeerConnection | null>(null);
  const signalingClientRef = useRef<SignalingWebSocketClient | null>(null);
  const clientId = crypto.randomUUID();
  const masterStreamRef = useRef<MediaStream | null>(null);
  const [connectedMaster, setConnectedMaster] = useState(false);

  const start = async () => {
    console.log("props", { props });
    const iceServers = await getIceServerConfig(
      props.region,
      props.signalingChannelArn,
      "VIEWER",
      props.credentials,
    );
    signalingClientRef.current = new SignalingWebSocketClient(
      props.region,
      props.signalingChannelArn,
      "VIEWER",
      props.credentials,
      clientId,
      {
        onOpen: async ({ client }) => {
          // ViewerのPeerを生成
          const peer = new RTCPeerConnection({
            iceServers,
          });
          // Ice候補を送信
          peer.addEventListener("icecandidate", async ({ candidate }) => {
            if (candidate) {
              await client.sendIceCandidate(clientId, candidate);
            }
          });
          // MasterのStreamを取得
          peer.addEventListener("track", ({ streams }) => {
            masterStreamRef.current = streams[0];
          });
          // SDPオファーの送信
          const offer = await peer.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
          });
          if (peer.localDescription) {
            await peer.setLocalDescription(offer);
            await client.sendSDPOffer(peer.localDescription);
          }
          connectionPeerRef.current = peer;
        },
        onSdpAnswer: async ({ client, answer }) => {
          // SDPアンサーの受領
          await connectionPeerRef.current?.setRemoteDescription(answer);
        },
        onIceCandidate: async ({ candidate }) => {
          // Ice候補の受領
          await connectionPeerRef.current?.addIceCandidate(candidate);
        },
      },
    );
    await signalingClientRef.current.connect();
  };

  return (
    <div>
      <button
        type="button"
        className={clsx(
          "bg-gradient-to-br from-blue-800 to-cyan-800 p-4 rounded-xl",
          "hover:from-blue-900 hover:to-cyan-900 p-4 rounded-xl",
          "cursor-pointer",
        )}
        onClick={start}
      >
        start viewer receive
      </button>
      <div className={clsx("grid grid-cols-2")}>
        {connectedMaster && (
          <div
            key={clientId}
            className={clsx(
              "max-w-xl w-full border border-slate-500 rounded-xl mt-4",
            )}
          >
            <video
              className={clsx(
                "aspect-video h-full w-full rounded-xl object-cover",
              )}
              ref={(el) => {
                if (el && masterStreamRef.current) {
                  el.srcObject = masterStreamRef.current;
                }
              }}
              muted
              autoPlay
              playsInline
            />
          </div>
        )}
      </div>
    </div>
  );
};
