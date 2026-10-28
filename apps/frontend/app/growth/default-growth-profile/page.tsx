import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AutomationPipeline from "@/components/automate/pipeline";

export const metadata: Metadata = {
  title: "Profile Growth workflow | Utomator",
  description: "Six dependent profile evidence pipelines using the existing Runner.",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const host = (await headers()).get("host") || "";
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) notFound();
  return <AutomationPipeline initialPane="growth" />;
}
