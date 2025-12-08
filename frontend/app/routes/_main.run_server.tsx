import type { Route } from "./+types/_main.run_server";

export async function loader({ params }: Route.LoaderArgs) {
  console.log("server loader", params);
  console.log("### これはサーバーで実行される");
  return {};
}

export default function Page() {
  console.log("### これはクライアントで実行される", { from: "rum_server" });
  return <div>main recorder</div>;
}
