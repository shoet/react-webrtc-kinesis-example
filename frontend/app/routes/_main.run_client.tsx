import type { Route } from "./+types/_main.run_client";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  console.log("client loader", params);
  console.log("### これはクライアントで実行される");
  return {};
}

export default function Page() {
  console.log("### これはクライアントで実行される", { from: "run_client" });
  return <div>main recorder</div>;
}
