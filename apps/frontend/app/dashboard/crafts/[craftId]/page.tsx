import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

export default async function LegacyCraftPage({
  params,
}: {
  params: Promise<{ craftId: string }>;
}) {
  const host = (await headers()).get("host") || "";
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) notFound();
  const { craftId } = await params;
  redirect("/dashboard/growth/" + encodeURIComponent(craftId));
}
