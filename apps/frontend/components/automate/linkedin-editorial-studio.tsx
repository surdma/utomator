"use client";
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, FileText, Plus, RotateCcw, Trash2 } from "lucide-react";

type Account = { id: string; platform: string; label: string; handle: string };
type Research = {
  id: string;
  input: { niche: string };
  sources: Array<{ url: string }>;
  output: { gaps: Array<{ topic: string; examples: string[] }> };
};
type Content = {
  goal: string;
  pillar: string;
  body: string;
  sourceUrls: string[];
  researchRunId: string | null;
};
type Draft = {
  id: string;
  accountId: string;
  version: number;
  status:
    | "draft"
    | "approved"
    | "archived"
    | "deleted"
    | "publishing"
    | "published"
    | "publish-failed"
    | "publication-uncertain";
  publication?: { status: string; postUrn?: string };
  content: Content;
  updatedAt: string;
  history: Array<{ version: number; event: string; timestamp: string }>;
};
const blank = (): Content => ({
  goal: "",
  pillar: "",
  body: "",
  sourceUrls: [],
  researchRunId: null,
});
const input =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-offset-2 focus-visible:outline-teal-700";
const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-xs font-bold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
export default function LinkedInEditorialStudio() {
  const [accounts, setAccounts] = useState<Account[]>([]),
    [accountId, setAccountId] = useState("");
  const [research, setResearch] = useState<Research[]>([]),
    [drafts, setDrafts] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<Draft | null>(null),
    [content, setContent] = useState<Content>(blank());
  const [error, setError] = useState(""),
    [feedback, setFeedback] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [sourcesText, setSourcesText] = useState("");
  const [oauth, setOauth] = useState<{
    connected: boolean;
    configured: boolean;
    subject?: string;
    expiresAt?: string;
  } | null>(null);
  const refresh = async () => {
    const response = await fetch("/api/linkedin/drafts", { cache: "no-store" });
    if (!response.ok) throw Error("Editorial drafts are unavailable");
    const rows = (await response.json()) as Draft[];
    setDrafts(rows);
    return rows;
  };
  useEffect(() => {
    let alive = true;
    void Promise.all([
      fetch("/api/account", { cache: "no-store" }),
      fetch("/api/linkedin/research", { cache: "no-store" }),
      fetch("/api/linkedin/drafts", { cache: "no-store" }),
    ])
      .then(async (responses) => {
        if (responses.some((item) => !item.ok))
          throw Error("Unable to load account, research or editorial records");
        const [account, report, items] = (await Promise.all(
          responses.map((r) => r.json()),
        )) as [{ socialAccounts: Account[] }, Research[], Draft[]];
        if (!alive) return;
        const linkedIn = account.socialAccounts.filter(
          (row) => row.platform === "linkedin",
        );
        setAccounts(linkedIn);
        setAccountId(linkedIn[0]?.id ?? "");
        setResearch(report);
        setDrafts(items);
      })
      .catch((e) => {
        if (alive)
          setError(
            e instanceof Error ? e.message : "Unable to load editorial studio",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  async function checkPublishingStatus(id: string) {
    const response = await fetch(
      "/api/linkedin/oauth/status?accountId=" + encodeURIComponent(id),
      { cache: "no-store" },
    );
    const result = (await response.json()) as {
      connected: boolean;
      configured: boolean;
      subject?: string;
      expiresAt?: string;
      error?: string;
    };
    if (!response.ok) throw Error(result.error || "OAuth status unavailable");
    setOauth(result);
  }
  useEffect(() => {
    if (!accountId) {
      setOauth(null);
      return;
    }
    void checkPublishingStatus(accountId).catch((e) =>
      setError(
        e instanceof Error ? e.message : "Unable to read publishing status",
      ),
    );
  }, [accountId]);
  async function connectPublishing() {
    if (!accountId) return;
    setError("");
    setFeedback("");
    try {
      const response = await fetch("/api/linkedin/oauth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const result = (await response.json()) as {
        authorizationUrl?: string;
        error?: string;
      };
      if (!response.ok || !result.authorizationUrl)
        throw Error(result.error || "LinkedIn OAuth unavailable");
      window.location.assign(result.authorizationUrl);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not start LinkedIn authorization",
      );
    }
  }
  async function disconnectPublishing() {
    if (
      !accountId ||
      !window.confirm(
        "Disconnect LinkedIn publishing authorization? Saved drafts will remain.",
      )
    )
      return;
    setBusy(true);
    try {
      const response = await fetch("/api/linkedin/oauth/disconnect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      if (!response.ok)
        throw Error(
          ((await response.json()) as { error: string }).error ||
            "Disconnect failed",
        );
      await checkPublishingStatus(accountId);
      setFeedback("Publishing authorization disconnected.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (
      !selected ||
      selected.status !== "approved" ||
      unsaved ||
      !oauth?.connected
    )
      return;
    if (
      !window.confirm(
        "Publish this approved text-only draft as LinkedIn member " +
          (oauth?.subject || "unknown") +
          "? This creates a real public post, not a preview.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch(
        "/api/linkedin/drafts/" + selected.id + "/publish",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedVersion: selected.version,
            confirmed: true,
          }),
        },
      );
      const result = (await response.json()) as Draft & { error?: string };
      if (!response.ok)
        throw Error(result.error || "LinkedIn publication failed");
      choose(result);
      await refresh();
      setFeedback(
        "LinkedIn accepted this post. The provider ID is stored in your publication receipt.",
      );
    } catch (e) {
      const reason =
        e instanceof Error ? e.message : "LinkedIn publication failed";
      await refresh()
        .then((rows) => {
          const newest = rows.find((item) => item.id === selected.id);
          if (newest) choose(newest);
        })
        .catch(() => undefined);
      setError(reason);
    } finally {
      setBusy(false);
    }
  }
  function choose(draft: Draft | null) {
    setSelected(draft);
    setContent(draft ? { ...draft.content } : blank());
    setSourcesText(draft?.content.sourceUrls.join("\n") ?? "");
    if (draft) setAccountId(draft.accountId);
    setError("");
    setFeedback("");
  }
  function useResearch(id: string) {
    const run = research.find((item) => item.id === id);
    if (!run) {
      setContent((old) => ({ ...old, researchRunId: null, sourceUrls: [] }));
      setSourcesText("");
      return;
    }
    const gap = run.output.gaps[0];
    const sourceUrls = (
      gap?.examples.length ? gap.examples : run.sources.map((s) => s.url)
    ).slice(0, 5);
    setContent((old) => ({
      ...old,
      researchRunId: run.id,
      pillar: gap?.topic ?? old.pillar,
      goal:
        old.goal || "Share an evidence-backed insight in " + run.input.niche,
      sourceUrls,
    }));
    setSourcesText(sourceUrls.join("\n"));
  }
  function payload(): Content {
    return {
      ...content,
      sourceUrls: sourcesText
        .split("\n")
        .map((row) => row.trim())
        .filter(Boolean),
    };
  }
  const unsaved = Boolean(
    selected && JSON.stringify(payload()) !== JSON.stringify(selected.content),
  );
  async function command(
    url: string,
    method: "POST" | "PUT",
    body: unknown,
  ): Promise<Draft> {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as Draft & { error?: string };
    if (!response.ok) throw Error(result.error || "Editorial action failed");
    return result;
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      if (!accountId)
        throw Error(
          "Save a LinkedIn account in Profile before creating a draft",
        );
      const result = selected
        ? await command("/api/linkedin/drafts/" + selected.id, "PUT", {
            expectedVersion: selected.version,
            content: payload(),
          })
        : await command("/api/linkedin/drafts", "POST", {
            accountId,
            content: payload(),
          });
      choose(result);
      await refresh();
      setFeedback(
        "Draft saved to your private workspace. No LinkedIn post was published.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save draft");
    } finally {
      setBusy(false);
    }
  }
  async function transition(
    action: "approve" | "reopen" | "archive" | "delete" | "restore",
  ) {
    if (!selected) return;
    if (
      action === "delete" &&
      !window.confirm(
        "Remove this internal draft from the list? It will not delete any LinkedIn post.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const updated = await command(
        "/api/linkedin/drafts/" + selected.id + "/transition",
        "POST",
        {
          expectedVersion: selected.version,
          action,
          confirm: action === "delete",
        },
      );
      if (action === "delete") {
        choose(null);
        setFeedback("Draft removed from your workspace list.");
      } else {
        choose(updated);
        setFeedback(
          "Draft is now " +
            updated.status +
            ". No LinkedIn post was published.",
        );
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change draft state");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      data-testid="linkedin-editorial-studio"
      className="mx-auto max-w-5xl space-y-5 pb-16"
    >
      <header className="rounded-3xl bg-[#111e2b] px-6 py-7 text-white">
        <p className="text-xs font-bold uppercase tracking-widest text-teal-300">
          LinkedIn / Editorial workflow
        </p>
        <h1 className="mt-3 font-serif text-3xl">Draft, review and refine.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          Prepare posts for your own account, cite research evidence, maintain
          revision history, approve content and archive old drafts. This is
          private draft management, not LinkedIn publishing.
        </p>
      </header>
      {loading && (
        <p role="status" className="text-sm text-slate-600">
          Loading editorial records…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
        >
          {error}
        </p>
      )}
      {feedback && (
        <p
          role="status"
          className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900"
        >
          {feedback}
        </p>
      )}
      {!loading && accounts.length === 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          Add your LinkedIn profile in{" "}
          <a
            className="font-bold underline"
            href="/dashboard/profile/connections"
          >
            Profile / Connections
          </a>{" "}
          to associate drafts with the correct account. No LinkedIn login is
          required for private draft preparation.
        </p>
      )}
      {accountId && (
        <section
          data-testid="linkedin-publishing-connection"
          className="rounded-2xl border border-slate-200 bg-white p-4"
        >
          <h2 className="text-sm font-bold">
            LinkedIn API publishing authorization
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            An authorized OAuth grant is required in addition to a saved
            profile. Review which LinkedIn member is signed in before
            publishing.
          </p>
          <p className="mt-2 text-xs font-semibold">
            {oauth?.connected
              ? "Authorized member: " + oauth.subject
              : "Not authorized for publishing"}
            {oauth?.expiresAt
              ? " · Expires " + new Date(oauth.expiresAt).toLocaleDateString()
              : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              onClick={() => void connectPublishing()}
              disabled={busy || !oauth?.configured}
            >
              Authorize with LinkedIn
            </button>
            <button
              type="button"
              className={button}
              onClick={() =>
                void checkPublishingStatus(accountId).catch((e) =>
                  setError(String(e)),
                )
              }
            >
              Refresh authorization
            </button>
            {oauth?.connected && (
              <button
                type="button"
                className={button}
                onClick={() => void disconnectPublishing()}
              >
                Disconnect
              </button>
            )}
          </div>
          {!oauth?.configured && (
            <p className="mt-2 text-xs text-amber-700">
              Publishing is unavailable until LinkedIn developer credentials, an
              HTTPS callback and an encryption key are configured on the server.
            </p>
          )}
        </section>
      )}
      <form
        aria-label="LinkedIn editorial draft"
        onSubmit={(e) => void save(e)}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold">
            {selected
              ? "Edit draft v" + selected.version
              : "New evidence-backed post"}
          </h2>
          <button type="button" className={button} onClick={() => choose(null)}>
            <Plus className="size-4" />
            New draft
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-bold">
            Saved LinkedIn account
            <select
              className={input}
              required
              disabled={Boolean(selected)}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label} (@{account.handle})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-bold">
            Evidence from Creator Research (optional)
            <select
              className={input}
              disabled={selected?.status === "archived"}
              value={content.researchRunId ?? ""}
              onChange={(e) => useResearch(e.target.value)}
            >
              <option value="">No linked research</option>
              {research.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.input.niche} · {item.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-bold">
            Post goal
            <input
              className={input}
              minLength={8}
              maxLength={220}
              required
              value={content.goal}
              onChange={(e) =>
                setContent((old) => ({ ...old, goal: e.target.value }))
              }
            />
          </label>
          <label className="space-y-1 text-xs font-bold">
            Content pillar
            <input
              className={input}
              minLength={3}
              maxLength={100}
              required
              value={content.pillar}
              onChange={(e) =>
                setContent((old) => ({ ...old, pillar: e.target.value }))
              }
            />
          </label>
        </div>
        <label className="block space-y-1 text-xs font-bold">
          Post draft
          <textarea
            rows={8}
            className={input + " resize-y leading-6"}
            minLength={20}
            maxLength={3000}
            required
            value={content.body}
            onChange={(e) =>
              setContent((old) => ({ ...old, body: e.target.value }))
            }
            placeholder="Write an original, factual LinkedIn post. Confirm your claims and dates."
          />
          <span className="block text-right text-[11px] font-normal text-slate-500">
            {content.body.length}/3000
          </span>
        </label>
        <label className="block space-y-1 text-xs font-bold">
          Evidence links (one clean HTTPS URL per line; up to eight)
          <textarea
            rows={3}
            className={input + " resize-y"}
            value={sourcesText}
            onChange={(e) => setSourcesText(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={
              busy ||
              !accountId ||
              Boolean(
                selected &&
                  !["draft", "approved", "publish-failed"].includes(
                    selected.status,
                  ),
              )
            }
            className={
              button +
              " border-teal-700 bg-teal-700 text-white hover:bg-teal-800"
            }
          >
            <FileText className="size-4" />
            {busy
              ? "Saving…"
              : selected
                ? "Save revision"
                : "Create private draft"}
          </button>
          {selected?.status === "approved" && (
            <button
              type="button"
              disabled={busy || unsaved || !oauth?.connected}
              className={
                button +
                " border-teal-700 bg-teal-700 text-white hover:bg-teal-800"
              }
              onClick={() => void publish()}
            >
              Publish approved post to LinkedIn
            </button>
          )}
          {selected?.status === "draft" && (
            <button
              type="button"
              disabled={busy || unsaved}
              title={
                unsaved ? "Save the revised draft before approving" : undefined
              }
              className={button}
              onClick={() => void transition("approve")}
            >
              <CheckCircle2 className="size-4" />
              Approve reviewed draft
            </button>
          )}
          {selected?.status === "draft" && unsaved && (
            <span role="status" className="text-xs text-amber-700">
              Save your edits before approving this revision.
            </span>
          )}
          {selected?.status === "approved" && (
            <button
              type="button"
              disabled={busy || unsaved}
              className={button}
              onClick={() => void transition("reopen")}
            >
              <RotateCcw className="size-4" />
              Reopen for edits
            </button>
          )}
          {selected?.status === "archived" && (
            <button
              type="button"
              disabled={busy}
              className={button}
              onClick={() => void transition("restore")}
            >
              Restore draft
            </button>
          )}
          {selected &&
            ["draft", "approved", "publish-failed"].includes(
              selected.status,
            ) && (
              <button
                type="button"
                disabled={busy}
                className={button}
                onClick={() => void transition("archive")}
              >
                Archive
              </button>
            )}
          {selected &&
            ["draft", "approved", "archived", "publish-failed"].includes(
              selected.status,
            ) && (
              <button
                type="button"
                disabled={busy}
                className={button + " border-rose-300 text-rose-700"}
                onClick={() => void transition("delete")}
              >
                <Trash2 className="size-4" />
                Remove
              </button>
            )}
        </div>
        {selected && (
          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
            <p>
              Status: <strong className="capitalize">{selected.status}</strong>{" "}
              · Revision {selected.version} · {selected.history.length}{" "}
              persisted events
            </p>
            {selected.publication?.postUrn && (
              <a
                className="mt-2 block text-teal-800 underline"
                target="_blank"
                rel="noopener noreferrer"
                href={
                  "https://www.linkedin.com/feed/update/" +
                  selected.publication.postUrn +
                  "/"
                }
              >
                View published LinkedIn post
              </a>
            )}
            {selected.status === "publication-uncertain" && (
              <p className="mt-2 text-rose-700">
                Publication outcome unknown. Check LinkedIn before taking any
                further action; automatic resubmission is blocked.
              </p>
            )}
          </div>
        )}
      </form>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold">Saved drafts</h2>
          <span className="text-xs text-slate-500">
            {drafts.length} private items
          </span>
        </div>
        {drafts.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">
            No saved drafts. Create a post above or use research evidence to
            start one.
          </p>
        ) : (
          <div className="mt-4 grid gap-2">
            {drafts.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => choose(item)}
                className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-left hover:border-teal-500"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-bold">
                    {item.content.pillar} · {item.content.goal}
                  </span>
                  <span className="mt-1 block truncate text-xs text-slate-600">
                    {item.content.body.slice(0, 160)}
                  </span>
                </span>
                <span className="text-xs capitalize text-teal-800">
                  {item.status} · v{item.version}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
      <p className="text-xs leading-6 text-slate-600">
        Approval confirms your internal editorial review only. These drafts are
        not automatically posted or scheduled. Source links identify
        user-submitted evidence, not verified LinkedIn analytics.
      </p>
    </div>
  );
}
