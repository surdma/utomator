# Utomator frontend

The Next.js App Router frontend is the product UI in the Utomator workspace. The landing page is
`app/page.tsx`. The former `/_automate` routes are now first-level segments of `app/`, with the
operator canvas at `/workspace` and the allowlisted backend proxy at `/api/[...path]`.

The removed public portfolio routes (`about`, `projects`, `articles`, `resume`) are intentionally
not part of this application.

Run from the workspace root using `pnpm dev:automate` to launch both the UI and the local automation
engine. Avoid exposing private routes publicly: the app's server pages and API enforce loopback host
restrictions.
