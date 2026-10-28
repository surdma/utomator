import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AutomateWorkspace from "@/components/automate/automate-workspace";

export const metadata: Metadata = {
  title: "Craft source | Utomator",
  robots: { index: false, follow: false },
};

export default async function CraftSourcePage() {
  const host = (await headers()).get("host") || "";
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) notFound();
  return <AutomateWorkspace initialPane="crafts" />;
}
