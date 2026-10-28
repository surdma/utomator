import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

export default async function LegacyCraftPage() {
  const host = (await headers()).get("host") || "";
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) notFound();
  redirect("/dashboard/growth");
}
