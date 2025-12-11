import { ReceiveAsMaster } from "features/video/components/receiveAsMaster";
import type { Route } from "./+types/_main.receive-as-master";

export async function clientLoader(props: Route.ClientLoaderArgs) {
  console.log("### master client loader");
  return {};
}

export function HydrateFallback() {
  return <p>Loading...</p>;
}

export default function Page() {
  return (
    <div>
      <ReceiveAsMaster
        kinesisInfo={{
          region: import.meta.env.VITE_AWS_REGION,
          credentials: {
            accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
            secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
          },
          signalingChannelArn: import.meta.env
            .VITE_KINESIS_SIGNALING_CHANNEL_ARN,
        }}
      />
    </div>
  );
}
