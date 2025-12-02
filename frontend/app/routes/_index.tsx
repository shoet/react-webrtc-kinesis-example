import type { Route } from "./+types/_index";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Recorder" }, { name: "description", content: "Recorder" }];
}

export default function Home() {
  return <div>recorder</div>;
}
