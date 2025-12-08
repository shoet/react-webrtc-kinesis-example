import { WebRTCSignalingViewer } from "features/video/components/webRTCSignalingViewer";
import type { Route } from "./+types/_main.viewer";

export async function clientLoader(props: Route.ClientLoaderArgs) {
  console.log("### viewer client loader");
  return {};
}

export function HydrateFallback() {
  return <p>Loading...</p>;
}

export default function Page() {
  console.log("hoge", { region: import.meta.env.VITE_AWS_REGION });
  return (
    <div>
      <WebRTCSignalingViewer
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
