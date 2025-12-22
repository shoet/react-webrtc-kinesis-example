import type { MediaStorageConfiguration } from "@aws-sdk/client-kinesis-video";
import clsx from "clsx";
import { Button } from "components/Button";
import {
  describeMediaStorageConfiguration,
  getIceServerConfig,
  joinStorageSession,
  SignalingWebSocketClient,
  updateMediaStorageConfiguration,
  type AwsCredentialsType,
} from "libs/kinesisWebRTC";
import { useRef, useState } from "react";

type ClientPeer = {
  peer: RTCPeerConnection;
  clientId: string;
  stream: MediaStream | null;
};
type Props = {
  region: string;
  signalingChannelArn: string;
  videoStreamArn: string;
  credentials: AwsCredentialsType;
};
export const RecordAsMaster = (props: Props) => {
  const { region, signalingChannelArn, credentials } = props;
  const signalingClientRef = useRef<SignalingWebSocketClient | null>(null);
  const clientPeers = useRef(new Map<string, ClientPeer>());
  const [connectedClientIds, setConnectedClientIds] = useState<string[]>([]);

  const onConnect = async () => {
    const iceServers = await getIceServerConfig(
      region,
      signalingChannelArn,
      "MASTER",
      credentials,
    );
    signalingClientRef.current = new SignalingWebSocketClient(
      region,
      signalingChannelArn,
      "MASTER",
      credentials,
      undefined,
      {
        onSdpOffer: async ({ offer, client, senderClientId }) => {
          if (!senderClientId) {
            console.error("viewer is required sender client id");
            return;
          }
          const peer = new RTCPeerConnection({ iceServers });
          const clientPeer: ClientPeer = {
            clientId: senderClientId,
            peer: peer,
            stream: null,
          };
          clientPeers.current.set(senderClientId, clientPeer);
          peer.addEventListener("icecandidate", async ({ candidate }) => {
            if (candidate) {
              await client.sendIceCandidate(senderClientId, candidate);
            }
          });
          peer.addEventListener("track", ({ streams }) => {
            console.log("[Viewer] トラック受信");
            const clientPeer = clientPeers.current.get(senderClientId);
            console.log({ clientPeer });
            if (clientPeer) {
              clientPeer.stream = streams[0];
              setConnectedClientIds((prev) => {
                if (prev.includes(senderClientId)) {
                  return prev;
                }
                return [...prev, senderClientId];
              });
            }
          });
          await peer.setRemoteDescription(offer);
          const answer = await peer.createAnswer(offer);
          await peer.setLocalDescription(answer);
          if (peer.localDescription) {
            await client.sendSDPAnswer(senderClientId, peer.localDescription);
          }
        },
        onIceCandidate: async ({ senderClientId, candidate }) => {
          if (senderClientId) {
            const clientPeer = clientPeers.current.get(senderClientId);
            await clientPeer?.peer.addIceCandidate(candidate);
          }
        },
      },
    );
    await signalingClientRef.current.connect();
  };

  const onRecord = async () => {
    let configuration: MediaStorageConfiguration;
    try {
      const result = await describeMediaStorageConfiguration(
        props.region,
        props.signalingChannelArn,
        props.credentials,
      );
      console.log({ result });
      if (result.MediaStorageConfiguration) {
        configuration = result.MediaStorageConfiguration;
      } else {
        throw new Error("configuration not found");
      }
    } catch (e) {
      throw new Error("failed to describeMediaStorageConfiguration", {
        cause: e,
      });
    }
    if (configuration.Status === "DISABLED") {
      try {
        await updateMediaStorageConfiguration(
          "ENABLED",
          props.signalingChannelArn,
          props.videoStreamArn,
          props.region,
          props.credentials,
        );
      } catch (e) {
        throw new Error("failed to update media storage configuration", {
          cause: e,
        });
      }
    }
    try {
      await joinStorageSession(
        props.region,
        props.signalingChannelArn,
        props.credentials,
      );
    } catch (e) {
      throw new Error("failed to updateMediaStorageConfiguration", {
        cause: e,
      });
    }
  };

  const onStopRecord = async () => {
    let configuration: MediaStorageConfiguration;
    try {
      const result = await describeMediaStorageConfiguration(
        props.region,
        props.signalingChannelArn,
        props.credentials,
      );
      if (result.MediaStorageConfiguration) {
        configuration = result.MediaStorageConfiguration;
      } else {
        throw new Error("configuration not found");
      }
    } catch (e) {
      throw new Error("failed to describeMediaStorageConfiguration", {
        cause: e,
      });
    }
    if (configuration.Status === "DISABLED") {
      console.log("status already disabled");
      return;
    }
    try {
      await updateMediaStorageConfiguration(
        "DISABLED",
        props.signalingChannelArn,
        props.videoStreamArn,
        region,
        credentials,
      );
    } catch (e) {
      throw new Error("failed to updateMediaStorageConfiguration", {
        cause: e,
      });
    }
  };

  return (
    <div>
      <h1>RecordAsMaster</h1>
      <Button onClick={onConnect}>Connect</Button>
      <Button onClick={onRecord}>Record</Button>
      <Button onClick={onStopRecord}>Stop</Button>
      <div className={clsx("grid grid-cols-2")}>
        {connectedClientIds.map((clientId) => (
          <div>
            <div>{clientId}</div>
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
                  const peer = clientPeers.current?.get(clientId);
                  if (el && peer?.stream) {
                    el.srcObject = peer.stream;
                  }
                }}
                muted
                autoPlay
                playsInline
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
