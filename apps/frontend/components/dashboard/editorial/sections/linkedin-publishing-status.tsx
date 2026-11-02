'use client';

const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-xs font-bold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';

export default function LinkedInPublishingStatus({
  accountId,
  oauth,
  busy,
  connectPublishing,
  checkPublishingStatus,
  disconnectPublishing,
  setError,
}: {
  accountId: string;
  oauth: {
    connected: boolean;
    configured: boolean;
    subject?: string;
    expiresAt?: string;
  } | null;
  busy: boolean;
  connectPublishing: () => void;
  checkPublishingStatus: (id: string) => Promise<void>;
  disconnectPublishing: () => void;
  setError: (value: string) => void;
}) {
  return (
    <section
      data-testid="linkedin-publishing-connection"
      className="rounded-2xl border border-slate-200 bg-white p-4"
    >
      <h2 className="text-sm font-bold">
        LinkedIn API publishing authorization
      </h2>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        An authorized OAuth grant is required in addition to a saved profile.
        Review which LinkedIn member is signed in before publishing.
      </p>
      <p className="mt-2 text-xs font-semibold">
        {oauth?.connected
          ? 'Authorized member: ' + oauth.subject
          : 'Not authorized for publishing'}
        {oauth?.expiresAt
          ? ' · Expires ' + new Date(oauth.expiresAt).toLocaleDateString()
          : ''}
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
              setError(String(e))
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
  );
}
