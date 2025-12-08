import {
  KinesisVideoClient,
  GetSignalingChannelEndpointCommand,
  ChannelProtocol,
  ChannelRole,
} from "@aws-sdk/client-kinesis-video";
import type { SignalingClientConfig } from "amazon-kinesis-video-streams-webrtc/lib/SignalingClient";
import { getKinesisVideoWebSocketRequest } from "./awsRequest";
import {
  GetIceServerConfigCommand,
  KinesisVideoSignalingClient,
} from "@aws-sdk/client-kinesis-video-signaling";

export type AwsCredentialsType = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

/**
 * シグナリングサーバーのエンドポイントを取得する。
 */
export async function getSignalingChannelEndpoint(
  region: string,
  channelArn: string,
  role: ChannelRole,
  credentials?: AwsCredentialsType,
) {
  console.log("getSignalingChannelEndpoint", { credentials });
  const client = new KinesisVideoClient({ credentials, region });
  const command = new GetSignalingChannelEndpointCommand({
    ChannelARN: channelArn,
    SingleMasterChannelEndpointConfiguration: {
      Protocols: ["WSS", "HTTPS"],
      Role: role,
    },
  });
  try {
    const result = await client.send(command);
    const endpoints: Record<ChannelProtocol, string | undefined> = {
      HTTPS: undefined,
      WSS: undefined,
      WEBRTC: undefined,
    };
    if (result.ResourceEndpointList) {
      for (const e of result.ResourceEndpointList) {
        if (e.Protocol && e.ResourceEndpoint) {
          endpoints[e.Protocol] = e.ResourceEndpoint;
        }
      }
    }
    return endpoints;
  } catch (e) {
    throw new Error("failed to signaling channel endpoint", { cause: e });
  }
}

/**
 * ICEサーバーの接続情報を取得する
 */
export async function getIceServerConfig(
  region: string,
  channelArn: string,
  credentials?: AwsCredentialsType,
): Promise<RTCIceServer[]> {
  const client = new KinesisVideoSignalingClient({ credentials, region });
  const command = new GetIceServerConfigCommand({
    ChannelARN: channelArn,
  });
  try {
    const result = await client.send(command);
    const iceServers: Array<RTCIceServer> = [
      { urls: `stun:stun.kinesisvideo.${region}.amazonaws.com:443` },
    ];
    result.IceServerList?.forEach(
      (iceServer) =>
        iceServer.Uris &&
        iceServers.push({
          urls: iceServer.Uris,
          username: iceServer.Username,
          credential: iceServer.Password,
        }),
    );
    return iceServers;
  } catch (e) {
    throw new Error("failed to get ice server config", { cause: e });
  }
}

// https://github.com/awslabs/amazon-kinesis-video-streams-webrtc-sdk-js/blob/e0f18ce6f5522a5daaba32cdd8dc57f75ddc4c75/src/SignalingClient.ts
enum MessageType {
  SDP_ANSWER = "SDP_ANSWER",
  SDP_OFFER = "SDP_OFFER",
  ICE_CANDIDATE = "ICE_CANDIDATE",
  STATUS_RESPONSE = "STATUS_RESPONSE",
}

export class SignalingWebSocketClient {
  private webSocket: WebSocket | null;

  constructor(
    private region: string,
    private channelArn: string,
    private role: ChannelRole,
    private credentials?: SignalingClientConfig["credentials"],
    private clientId?: string,
    private callbacks?: {
      onOpen?: (ev: Event) => void;
      onSdpAnswer?: (answer: RTCSessionDescriptionInit) => void;
      onIceCandidate?: (candidate: RTCIceCandidate) => void;
      onClose?: () => void;
      onError?: () => void;
    },
  ) {
    this.webSocket = null;
    if (role === "VIEWER" && clientId === undefined) {
      throw new Error("Viewer is required clientId");
    }
  }

  async connectViewer() {
    if (this.webSocket) {
      throw new Error("this client already connected via viewer");
    }
    const { WSS } = await getSignalingChannelEndpoint(
      this.region,
      this.channelArn,
      "VIEWER",
      this.credentials,
    );
    if (!WSS) {
      throw new Error("not found signaling client by web socket");
    }
    const { endPointUrl } = await getKinesisVideoWebSocketRequest(
      this.region,
      {
        accessKeyId: this.credentials?.accessKeyId || "",
        secretAccessKey: this.credentials?.secretAccessKey || "",
      },
      WSS,
      {
        channelArn: this.channelArn,
        clientId: crypto.randomUUID(),
      },
    );
    try {
      const ws = new WebSocket(endPointUrl);
      ws.addEventListener("open", (ev) => {
        console.log("### open", { ev });
        this.callbacks?.onOpen?.(ev);
      });
      ws.addEventListener("message", (ev) => {
        console.log("### message", { ev });
      });
      ws.addEventListener("close", (ev) => {
        console.log("### close", { ev });
      });
      ws.addEventListener("error", (ev) => {
        console.log("### error", { ev });
      });
      this.webSocket = ws;
      return ws;
    } catch (e) {
      console.error("failed to connect web socket", { cause: e });
      throw e;
    }
  }

  async connectMaster() {
    if (this.webSocket) {
      throw new Error("this client already connected via master");
    }
    const { WSS } = await getSignalingChannelEndpoint(
      this.region,
      this.channelArn,
      "MASTER",
      this.credentials,
    );
    if (!WSS) {
      throw new Error("not found signaling client by web socket");
    }
    const { endPointUrl } = await getKinesisVideoWebSocketRequest(
      this.region,
      {
        accessKeyId: this.credentials?.accessKeyId || "",
        secretAccessKey: this.credentials?.secretAccessKey || "",
      },
      WSS,
      {
        channelArn: this.channelArn,
      },
    );
    try {
      const ws = new WebSocket(endPointUrl);
      ws.addEventListener("open", (ev) => {
        console.log("### open", { ev });
        this.callbacks?.onOpen?.(ev);
      });
      ws.addEventListener("message", (ev) => {
        console.log("### message", { ev });
      });
      ws.addEventListener("close", (ev) => {
        console.log("### close", { ev });
      });
      ws.addEventListener("error", (ev) => {
        console.log("### error", { ev });
      });
      this.webSocket = ws;
      return ws;
    } catch (e) {
      console.error("failed to connect web socket", { cause: e });
      throw e;
    }
  }
}
