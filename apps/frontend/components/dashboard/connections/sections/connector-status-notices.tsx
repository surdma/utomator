'use client';

export default function ConnectorStatusNotices({
  error,
  message,
}: {
  error: string;
  message: string;
}) {
  return (
    <>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-900"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm leading-6 text-teal-950"
        >
          {message}
        </p>
      )}
    </>
  );
}
