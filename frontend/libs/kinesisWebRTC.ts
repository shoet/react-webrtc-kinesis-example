import {
  KinesisVideoClient,
  GetSignalingChannelEndpointCommand,
  ChannelProtocol,
  ChannelRole,
  UpdateMediaStorageConfigurationCommand,
  DescribeMediaStorageConfigurationCommand,
  MediaStorageConfigurationStatus,
} from "@aws-sdk/client-kinesis-video";
import type { SignalingClientConfig } from "amazon-kinesis-video-streams-webrtc/lib/SignalingClient";
import { getKinesisVideoWebSocketRequest } from "./awsRequest";
import {
  GetIceServerConfigCommand,
  KinesisVideoSignalingClient,
} from "@aws-sdk/client-kinesis-video-signaling";
import {
  JoinStorageSessionCommand,
  KinesisVideoWebRTCStorageClient,
} from "@aws-sdk/client-kinesis-video-webrtc-storage";
import z from "zod";

export type AwsCredentialsType = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

/**
 * 1 つのシグナリング チャネルには、1 つのマスターと1 つ以上のビューアのみを接続できます。
 */

/**
 * シグナリングサーバーのエンドポイントを取得する。
 */
export async function getSignalingChannelEndpoint(
  region: string,
  channelArn: string,
  role: ChannelRole,
  credentials?: AwsCredentialsType,
  channelProtocols: ChannelProtocol[] = ["WSS", "HTTPS"],
) {
  const client = new KinesisVideoClient({ credentials, region });
  const command = new GetSignalingChannelEndpointCommand({
    ChannelARN: channelArn,
    SingleMasterChannelEndpointConfiguration: {
      Protocols: channelProtocols,
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
  role: ChannelRole,
  credentials?: AwsCredentialsType,
): Promise<RTCIceServer[]> {
  /**
   * 場合によってはAPIエンドポイントを取得してClientに設定する必要がある
   * https://github.com/boto/boto3/issues/2909
   */
  const { HTTPS } = await getSignalingChannelEndpoint(
    region,
    channelArn,
    role,
    credentials,
  );
  const client = new KinesisVideoSignalingClient({
    credentials,
    region,
    endpoint: HTTPS,
  });
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

/**
 * シグナリングチャネルとKinesisVideoStreamとの紐づけ
 */
export async function updateMediaStorageConfiguration(
  status: MediaStorageConfigurationStatus,
  channelArn: string,
  streamArn: string,
  region: string,
  credentials?: AwsCredentialsType,
) {
  const client = new KinesisVideoClient({
    credentials,
    region: region,
  });
  const command = new UpdateMediaStorageConfigurationCommand({
    ChannelARN: channelArn,
    MediaStorageConfiguration: {
      Status: status,
      StreamARN: streamArn,
    },
  });
  try {
    await client.send(command);
  } catch (e) {
    throw new Error("failed to update media storage configuration", {
      cause: e,
    });
  }
}

/**
 * シグナリングチャネルとKinesisVideoStreamとの紐づけ解除
 *
 * シグナリングチャネル削除前に実施が必要
 */
export async function releaseMediaStorageConfiguration(
  channelArn: string,
  credentials?: AwsCredentialsType,
  region?: string,
) {
  const client = new KinesisVideoClient({ credentials, region });
  const command = new UpdateMediaStorageConfigurationCommand({
    ChannelARN: channelArn,
    MediaStorageConfiguration: {
      Status: "DISABLED",
    },
  });
  try {
    await client.send(command);
  } catch (e) {
    throw new Error("failed to update media storage configuration", {
      cause: e,
    });
  }
}

// https://github.com/awslabs/amazon-kinesis-video-streams-webrtc-sdk-js/blob/e0f18ce6f5522a5daaba32cdd8dc57f75ddc4c75/src/SignalingClient.ts
enum MessageType {
  SDP_ANSWER = "SDP_ANSWER",
  SDP_OFFER = "SDP_OFFER",
  ICE_CANDIDATE = "ICE_CANDIDATE",
  STATUS_RESPONSE = "STATUS_RESPONSE",
}

/**
 * https://docs.aws.amazon.com//kinesisvideostreams-webrtc-dg/latest/devguide/async-message-reception-api.html
 */
const ReceiveMessageSchema = z.object({
  senderClientId: z.string().optional(),
  messageType: z.enum(MessageType),
  messagePayload: z.string().optional(),
  correlationId: z.string().optional(),
  errorType: z.string().optional(),
  description: z.string().optional(),
});

export class SDPOffer {
  static schema = z.object({});

  static fromMessagePayload(messagePayload: string) {
    let payload: any;
    try {
      const parsed = JSON.parse(messagePayload);
      payload = parsed;
    } catch (e) {
      throw new Error("failed to parse JSON", { cause: e });
    }
    const { success, data, error } = this.schema.safeParse(payload);
    if (!success) {
      throw new Error("failed to parse messagePayload", { cause: error });
    }
    return new SDPOffer();
  }
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
      onOpen?: (args: { client: SignalingWebSocketClient; ev: Event }) => void;
      onSdpOffer?: (args: {
        client: SignalingWebSocketClient;
        offer: RTCSessionDescriptionInit;
        senderClientId?: string;
      }) => void;
      onSdpAnswer?: (args: {
        client: SignalingWebSocketClient;
        answer: RTCSessionDescriptionInit;
      }) => void;
      onIceCandidate?: (args: {
        client: SignalingWebSocketClient;
        candidate: RTCIceCandidate;
        senderClientId?: string;
      }) => void;
      onClose?: () => void;
      onError?: () => void;
    },
  ) {
    this.webSocket = null;
    if (role === "VIEWER" && clientId === undefined) {
      throw new Error("Viewer is required clientId");
    }
  }

  /**
   * connectMaster は、`role`としてシグナリングサーバーに接続し、WebSocketの接続を取得する
   */
  async connect() {
    if (this.webSocket) {
      throw new Error("this client already connected via viewer");
    }
    const { WSS } = await getSignalingChannelEndpoint(
      this.region,
      this.channelArn,
      this.role,
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
        clientId: this.clientId,
      },
    );
    try {
      const ws = new WebSocket(endPointUrl);
      this.webSocket = this.setupCallback(ws);
      return ws;
    } catch (e) {
      console.error("failed to connect web socket", { cause: e });
      throw e;
    }
  }

  setupCallback(socket: WebSocket): WebSocket {
    socket.addEventListener("open", (ev) => {
      this.callbacks?.onOpen?.({ ev, client: this });
    });
    socket.addEventListener("message", (ev: MessageEvent) => {
      console.log("handle message", { ev });
      if (ev.data === "") {
        return;
      }
      let payload: any;
      try {
        payload = JSON.parse(ev.data);
      } catch (e) {
        console.log("data", { data: ev.data });
        throw new Error("failed to parse JSON", { cause: e });
      }
      const { success, data, error } = ReceiveMessageSchema.safeParse(payload);
      if (!success) {
        throw new Error("failed to parse receive message", { cause: error });
      }
      switch (data.messageType) {
        case MessageType.SDP_OFFER: {
          console.log("SDPオファーの受信", { data });
          const senderClientId = data.senderClientId;
          const messagePayload = data.messagePayload;
          let sdpOffer: RTCSessionDescription;
          if (!senderClientId) {
            console.error("senderClientId is required for sdp offer");
            return;
          }
          if (!messagePayload) {
            console.error("sdp offer is required messagePayload");
            return;
          }
          try {
            const payload = JSON.parse(messagePayload);
            sdpOffer = new RTCSessionDescription(payload);
          } catch (e) {
            throw new Error("failed to parse payload", { cause: e });
          }
          this.callbacks?.onSdpOffer?.({
            client: this,
            offer: sdpOffer,
            senderClientId,
          });
          break;
        }
        case MessageType.SDP_ANSWER: {
          console.log("SDPアンサーの受信", { data });
          const messagePayload = data.messagePayload;
          let sdpAnswer: RTCSessionDescription;
          if (!messagePayload) {
            console.error("sdp answer is required messagePayload");
            return;
          }
          try {
            const payload = JSON.parse(messagePayload);
            sdpAnswer = new RTCSessionDescription(payload);
          } catch (e) {
            throw new Error("failed to parse payload", { cause: e });
          }
          this.callbacks?.onSdpAnswer?.({
            client: this,
            answer: sdpAnswer,
          });
          break;
        }
        case MessageType.ICE_CANDIDATE: {
          console.log("ICE候補の受信", { data });
          const messagePayload = data.messagePayload;
          let iceCandidate: RTCIceCandidate;
          if (!messagePayload) {
            console.error("ice candidate is required messagePayload");
            return;
          }
          try {
            const payload = JSON.parse(messagePayload);
            iceCandidate = new RTCIceCandidate(payload);
          } catch (e) {
            throw new Error("failed to parse payload", { cause: e });
          }
          this.callbacks?.onIceCandidate?.({
            client: this,
            candidate: iceCandidate,
            senderClientId: data.senderClientId,
          });
          break;
        }
        // case MessageType.STATUS_RESPONSE: {
        //   break;
        // }
      }
    });
    socket.addEventListener("close", (ev) => {
      console.log("### close", { ev });
    });
    socket.addEventListener("error", (ev) => {
      console.log("### error", { ev });
    });

    return socket;
  }

  /**
   * https://docs.aws.amazon.com//kinesisvideostreams-webrtc-dg/latest/devguide/SendSdpOffer.html
   */
  async sendSDPOffer(offer: RTCSessionDescription) {
    try {
      this.webSocket?.send(
        JSON.stringify({
          action: MessageType.SDP_OFFER,
          recipientClientId: this.clientId,
          messagePayload: JSON.stringify(offer.toJSON()),
        }),
      );
    } catch (e) {
      throw new Error("failed to send sdp offer", { cause: e });
    }
  }

  /**
   * https://docs.aws.amazon.com//kinesisvideostreams-webrtc-dg/latest/devguide/SendSdpAnswer.html
   *
   * Viewerからの送信の場合、Masterに送信される。
   * Masterの場合のみ、RecipientClientIdに指定したClientId宛(ターゲットビューア)に送信される。
   */
  async sendSDPAnswer(
    offerSenderClientId: string,
    answer: RTCSessionDescription,
  ) {
    try {
      this.webSocket?.send(
        JSON.stringify({
          action: MessageType.SDP_ANSWER,
          recipientClientId: offerSenderClientId,
          messagePayload: JSON.stringify(answer.toJSON()),
        }),
      );
    } catch (e) {
      throw new Error("failed to send sdp answer", { cause: e });
    }
  }

  /**
   * https://docs.aws.amazon.com//kinesisvideostreams-webrtc-dg/latest/devguide/SendIceCandidate.html
   *
   * Masterの場合のみ、RecipientClientIdに指定したClientId宛(ターゲットビューア)に送信される。
   */
  async sendIceCandidate(
    targetClientId: string,
    iceCandidate: RTCIceCandidate,
  ) {
    try {
      this.webSocket?.send(
        JSON.stringify({
          action: MessageType.ICE_CANDIDATE,
          recipientClientId: targetClientId,
          messagePayload: JSON.stringify(iceCandidate.toJSON()),
        }),
      );
    } catch (e) {
      throw new Error("failed to send sdp answer", { cause: e });
    }
  }
}

export async function describeMediaStorageConfiguration(
  region: string,
  signalingChannelArn: string,
  credentials?: AwsCredentialsType,
) {
  const client = new KinesisVideoClient({ credentials, region });
  const command = new DescribeMediaStorageConfigurationCommand({
    ChannelARN: signalingChannelArn,
  });
  try {
    const result = await client.send(command);
    return result;
  } catch (e) {
    throw new Error("failed to describe media storage configuration", {
      cause: e,
    });
  }
}

export async function joinStorageSession(
  region: string,
  signalingChannelArn: string,
  credentials?: AwsCredentialsType,
) {
  const { WEBRTC } = await getSignalingChannelEndpoint(
    region,
    signalingChannelArn,
    "MASTER",
    credentials,
    ["WEBRTC"],
  );
  const client = new KinesisVideoWebRTCStorageClient({
    credentials,
    region,
    endpoint: WEBRTC,
  });
  const command = new JoinStorageSessionCommand({
    channelArn: signalingChannelArn,
  });
  try {
    const result = await client.send(command);
  } catch (e) {
    throw new Error("failed to join storage session", {
      cause: e,
    });
  }
}
