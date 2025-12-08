import { SignatureV4 } from "@smithy/signature-v4";
import type { AwsCredentialsType } from "./kinesisWebRTC";
import { Sha256 } from "@aws-crypto/sha256-universal";
import { HttpRequest } from "@smithy/protocol-http";

export async function signSigV4Request(
  region: string,
  credentials: AwsCredentialsType,
  service: string,
  request: HttpRequest,
) {
  const signer = new SignatureV4({
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
    region: region,
    service: service,
    sha256: Sha256,
  });
  const signed = await signer.presign(request, { expiresIn: 299 });
  return signed;
}

export async function getKinesisVideoWebSocketRequest(
  region: string,
  credentials: AwsCredentialsType,
  webSocketEndpointUrl: string,
  param: {
    channelArn: string;
    clientId?: string;
  },
) {
  const url = new URL(webSocketEndpointUrl);
  const host = url.hostname;
  const path = url.pathname;
  const query: Record<string, any> = {
    "X-Amz-ChannelARN": param.channelArn,
  };
  if (param.clientId) {
    query["X-Amz-ClientId"] = param.clientId;
  }
  const request = new HttpRequest({
    method: "GET",
    hostname: host,
    path: path,
    query: query,
    protocol: "wss:",
    headers: {
      host: host,
    },
  });
  const signed = await signSigV4Request(
    region,
    credentials,
    "kinesisvideo",
    request,
  );
  const queryParams = new URLSearchParams(
    signed.query as Record<string, string>,
  );
  return {
    endPointUrl: `wss://${host}${path}?${queryParams.toString()}`,
  };
}
