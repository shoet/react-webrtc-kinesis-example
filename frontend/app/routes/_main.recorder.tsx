import type { Route } from "./+types/_main.recorder";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Recorder" }, { name: "description", content: "Recorder" }];
}

export default function Page() {
  return <div>main recorder</div>;
}
