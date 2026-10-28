"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Settings2, ShieldCheck, LogOut } from "lucide-react";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/automate-card";

export function AutomationSettingsPage({ available, platform, selectedAccount }: {
  available: "checking" | "ready" | "offline";
  platform: "linkedin" | "x";
  selectedAccount: {
    platform: string; label: string; handle: string; profileUrl: string;
    status: string; verifiedAt: string | null;
  } | null;
}) {
  const selected = selectedAccount?.platform === platform ? selectedAccount : null;
  const [hosted, setHosted] = useState(false);
  useEffect(() => {
    // The original local-only Next app has no application-auth endpoint.
    if (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) return;
    let current = true;
    fetch("/auth/me", { cache: "no-store" })
      .then(response => { if (current && response.ok) setHosted(true); })
      .catch(() => undefined);
    return () => { current = false; };
  }, []);
  return <div data-testid="automation-settings-page" className="flex flex-col gap-4">
    <Card>
      <CardHeader>
        <CardTitle><span className="flex items-center gap-2"><Settings2 className="size-4" />{hosted ? "Hosted account settings" : "Local automation settings"}</span></CardTitle>
        <CardDescription>Each run uses the currently selected social account rather than the portfolio owner's handle.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex justify-between gap-3 border-b border-slate-100 pb-3"><span>Engine</span><strong className="capitalize">{available}</strong></div>
        <div className="flex justify-between gap-3 border-b border-slate-100 pb-3"><span>Selected platform</span><strong className="capitalize">{platform}</strong></div>
        <div className="flex justify-between gap-3 border-b border-slate-100 pb-3"><span>Social account</span><strong>{selected ? selected.label : "Not selected"}</strong></div>
        <div className="flex justify-between gap-3 border-b border-slate-100 pb-3"><span>Session</span><strong className="capitalize">{selected?.status.replaceAll("-", " ") || "Not connected"}</strong></div>
        <div className="flex justify-between gap-3"><span>Mutation policy</span><strong className="flex items-center gap-1 text-teal-800"><ShieldCheck className="size-4" />Human approval</strong></div>
        <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Browser credentials and session cookies stay outside the account database. A saved URL alone does not authorize a workflow.</p>
      </CardContent>
    </Card>
    {hosted && <Card>
      <CardHeader>
        <CardTitle>Application session</CardTitle>
        <CardDescription>Sign out from Utomator without confusing social-account sessions with application identity.</CardDescription>
      </CardHeader>
      <CardContent>
        <form method="post" action="/auth/logout">
          <button type="submit" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-100">
            <LogOut className="size-4" />Sign out
          </button>
        </form>
      </CardContent>
    </Card>}
    <Card>
      <CardHeader>
        <CardTitle>Selected social identity</CardTitle>
        <CardDescription>Only account details explicitly saved in your social profile directory are shown here.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {selected ? <>
          <p className="text-sm font-semibold">@{selected.handle}</p>
          <p className="break-all text-xs text-slate-600">{selected.profileUrl}</p>
          <p className="text-xs text-slate-500">{selected.verifiedAt ? "Last verified: " + new Date(selected.verifiedAt).toLocaleString() : "Not verified yet"}</p>
        </> : <p className="text-sm text-slate-500">No social account selected. Add a profile and verify its session before running connected workflows.</p>}
        <a href="/dashboard/profile/connections" className="inline-flex items-center gap-2 text-xs font-bold text-teal-700 hover:underline">Manage social accounts <ArrowRight className="size-3.5" /></a>
      </CardContent>
    </Card>
  </div>;
}
