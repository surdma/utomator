import type { ComponentType } from "react";
import { DevtoIcon, GithubIcon, InstagramIcon, LinkedInIcon, XIcon } from "@/components/svgs";

export type ProviderKey = "linkedin" | "x" | "instagram" | "github" | "devto";

export type ProviderMeta = {
  key: ProviderKey;
  /** Human provider name used in status lines and feedback. */
  name: string;
  icon: ComponentType<{ className: string }>;
  /** Brand tile classes (background + foreground). */
  tile: string;
  /** Context-free guidance shown under each provider section. */
  blurb: string;
};

export const providerMeta: Record<ProviderKey, ProviderMeta> = {
  linkedin: {
    key: "linkedin",
    name: "LinkedIn",
    icon: LinkedInIcon,
    tile: "bg-[#0a66c2]/10 text-[#0a66c2]",
    blurb: "Browser-session connector. Sign in inside the isolated Chrome window; MFA stays in that window.",
  },
  x: {
    key: "x",
    name: "X",
    icon: XIcon,
    tile: "bg-slate-950/5 text-slate-950",
    blurb: "Browser-session connector. Sign in directly with X; passwords are never collected.",
  },
  instagram: {
    key: "instagram",
    name: "Instagram",
    icon: InstagramIcon,
    tile: "bg-pink-500/10 text-pink-600",
    blurb: "Official API connector is required. Browser login is not offered for this network yet.",
  },
  github: {
    key: "github",
    name: "GitHub",
    icon: GithubIcon,
    tile: "bg-slate-100 text-slate-900",
    blurb: "Official API connector is required. Browser login is not offered for this network yet.",
  },
  devto: {
    key: "devto",
    name: "Dev.to",
    icon: DevtoIcon,
    tile: "bg-slate-950 text-slate-50",
    blurb: "Official API connector is required. Browser login is not offered for this network yet.",
  },
};

/** One action per provider state, exactly as the connector contract defines it. */
export type ProviderOperation = "connect" | "sync" | "disconnect";

export function primaryOperation(
  status: "connected" | "disconnected" | "sign-in-open" | "api-required",
  verifiedAt: string | null,
): ProviderOperation {
  if (status === "connected") {
    const verified = verifiedAt ? Date.parse(verifiedAt) : 0;
    // A day-old verification is treated as stale: the session may have been
    // revoked or expired upstream, so the primary action becomes a sync.
    if (Date.now() - verified > 24 * 60 * 60 * 1000) return "sync";
    return "disconnect";
  }
  if (status === "disconnected") return "connect";
  // sign-in-open / reconnect-required / anything unknown needs synchronization.
  return "sync";
}

/** Labels for each context-aware primary action. */
export const operationLabels: Record<ProviderOperation, string> = {
  connect: "Connect",
  sync: "Sync",
  disconnect: "Disconnect",
};
