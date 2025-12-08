import type { Route } from "./+types/_main.recorder";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Recorder" }, { name: "description", content: "Recorder" }];
}

export async function clientLoader(props: Route.ClientLoaderArgs) {
  return {};
}

export default function Page() {
  console.log("### recorder");
  return <div>main recorder</div>;
}
