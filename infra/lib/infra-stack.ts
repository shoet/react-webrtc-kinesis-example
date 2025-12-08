import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { CfnStream, CfnSignalingChannel } from "aws-cdk-lib/aws-kinesisvideo";

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * https://dev.classmethod.jp/articles/kinesis-video-streams-webrtc-ingest/
     */

    const signalingChannel = new CfnSignalingChannel(
      this,
      "KinesisVideoSignalingChannel",
      {
        name: "MyKinesisVideoSignalingChannel",
        type: "SINGLE_MASTER",
        messageTtlSeconds: 60,
      },
    );
    new cdk.CfnOutput(this, "SignalingChannelArn", {
      value: signalingChannel.attrArn,
    });
    // const videoStream = new CfnStream(this, "KinesisVideoStream", {
    //   name: "MyKinesisVideoStream",
    //   dataRetentionInHours: 24,
    //   mediaType: "video/h264",
    // })
  }
}
