import clsx from "clsx";
import {
  getIceServerConfig,
  SignalingWebSocketClient,
  type AwsCredentialsType,
} from "libs/kinesisWebRTC";
import { useRef, useState } from "react";

type ViewerPeer = {
  clientId: string;
  peer: RTCPeerConnection | null;
};

type Props = {
  region: string;
  signalingChannelArn: string;
  credentials: AwsCredentialsType;
};

/**
 * Masterとして映像を送信する
 *
 * 通信するViewerは一つのみとする。
 */
export const SendAsMaster = (props: Props) => {
  const signalingClientRef = useRef<SignalingWebSocketClient | null>(null);
  const viewerPeerRef = useRef<ViewerPeer | null>(null);
  const [connectClientId, setConnectClientId] = useState<string | undefined>(
    undefined,
  );

  const start = async () => {
    const iceServers = await getIceServerConfig(
      props.region,
      props.signalingChannelArn,
      props.credentials,
    );
    signalingClientRef.current = new SignalingWebSocketClient(
      props.region,
      props.signalingChannelArn,
      "MASTER",
      props.credentials,
      undefined,
      {
        onSdpOffer: async (args) => {
          const { offer, client, senderClientId } = args;
          if (!senderClientId) {
            throw new Error("sender client id not found");
          }
          // ViewerのPeerを生成
          const peer = new RTCPeerConnection({
            iceServers,
          });
          // SDPOfferを受領
          peer.setRemoteDescription(offer);
          // SDPAnswerを返送
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          if (peer.localDescription) {
            await client.sendSDPAnswer(senderClientId, peer.localDescription);
          }
          // Ice候補交換イベントでMasterのIce候補を返送する
          peer.addEventListener("icecandidate", async ({ candidate }) => {
            if (candidate) {
              await client.sendIceCandidate(senderClientId, candidate);
            }
          });
          viewerPeerRef.current = {
            peer,
            clientId: senderClientId,
          };
          setConnectClientId((_prev) => senderClientId);
        },
        // ViewerのIce候補を受領する
        onIceCandidate: async ({ candidate }) => {
          await viewerPeerRef.current?.peer?.addIceCandidate(candidate);
        },
      },
    );
    await signalingClientRef.current.connect();
  };

  return (
    <div>
      <div>接続中のクライアント: {connectClientId}</div>
      <button
        type="button"
        className={clsx(
          "bg-gradient-to-br from-blue-800 to-cyan-800 p-4 rounded-xl",
          "hover:from-blue-900 hover:to-cyan-900 p-4 rounded-xl",
          "cursor-pointer",
        )}
        onClick={start}
      >
        start
      </button>
    </div>
  );
};
