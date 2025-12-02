import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Recorder" }, { name: "description", content: "Recorder" }];
}

export default function Home() {
  return <div>recorder</div>;
}
