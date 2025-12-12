import { ReceiveAsViewer } from "features/video/components/receiveAsViewer";

export async function clientLoader() {
  return {};
}

export default function Page() {
  return (
    <div>
      <h1>Receive as Viewer</h1>
      <ReceiveAsViewer
        region={import.meta.env.VITE_AWS_REGION || ""}
        signalingChannelArn={import.meta.env.VITE_KINESIS_SIGNALING_CHANNEL_ARN}
        credentials={{
          accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
          secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
        }}
      />
    </div>
  );
}
