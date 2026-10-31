# Portfolio case-study source ledger

Reviewed on 19 October 2026. This is an internal writing reference, not copy for the public
portfolio. The stories in `lib/data.ts` put product problems and the author's specific role first.
The files below are the basis for the claims; unverified commercial outcomes were intentionally
excluded.

## AEKO Chain

Repository: https://github.com/MilliHub-dev/aeko-chain

- The top-level README distinguishes the AEKO validator/RPC runtime, native SocialFi programs,
  protocol bootstrap, Explorer and indexer, client SDKs, funding controls, operations web and
  Contract Studio.
- `docs/aeko-chain/chain-overview.md` describes AEKO as an independent Layer-1 project built on a
  Solana-derived execution approach. Do **not** imply the author invented proof of history or
  Solana's core consensus.
- [Testnet recovery PR](https://github.com/MilliHub-dev/aeko-chain/pull/4) records the initial
  non-producing chain and the verified recovery to produced slots, transaction confirmations and
  Explorer reads.
- [SocialFi end-to-end integration](https://github.com/MilliHub-dev/aeko-chain/pull/27) covers
  actual social-state reads, treasury/stake custody, rewards, tips, subscriptions and social
  acceptance work.
- [Protocol historical upgrade work](https://github.com/MilliHub-dev/aeko-chain/pull/51) covers
  native program upgrades without wiping prior network history.
- Studio and SDK/CLI paths: `apps/explorer/editor`, `apps/explorer/web`, `apps/explorer/backend`,
  `apps/sdk`, `apps/cli`.

## SabiGo / Sabi Ride

Repository (private): https://github.com/MilliHub-dev/sabi_ride_backend

- The user's supplied first-person history identifies them as a **pioneer/core developer of
  SabiGo**. The record supports significant substantive work in `sabigo/`, including
  [initial ride service](https://github.com/MilliHub-dev/sabi_ride_backend/pull/9),
  [service reorganization](https://github.com/MilliHub-dev/sabi_ride_backend/pull/84),
  [major SabiGo integration](https://github.com/MilliHub-dev/sabi_ride_backend/pull/166) and
  [delivery integration](https://github.com/MilliHub-dev/sabi_ride_backend/pull/170).
- Source paths: `sabigo/services/journey/ride_service.py`, `match_service.py`,
  `dispatch_service.py`, `sabigo/models/ride_models.py`, `delivery_models.py`, `sabigo/consumers`.
- The public [Sabi Ride website](https://www.sabiride.net/) describes hailing, shared/group rides
  and dispatch, but the site alone does not establish which developer authored which components.
- Do not confuse core service ownership with founding the company or personally building every
  client application.

## Laitstyles

Repository: https://github.com/relvorlabs/laitstyles

- Source covers catalogue/products, inventory, checkout, orders, returns, customer accounts and
  finance modules.
- Review [inventory and product cutover](https://github.com/relvorlabs/laitstyles/pull/41),
  [admin business persistence](https://github.com/relvorlabs/laitstyles/pull/43),
  [payment and finance integration](https://github.com/relvorlabs/laitstyles/pull/58), and
  [checkout/account repair](https://github.com/relvorlabs/laitstyles/pull/62).
- A successful merge does not establish more sales or fewer abandoned checkouts without business
  data.

## Festacol

Repository: https://github.com/surdma/festacol

- [Candidate exam lifecycle](https://github.com/surdma/festacol/pull/16) documents answer recovery
  and stable examination sessions.
- [Assessment experience](https://github.com/surdma/festacol/pull/18) documents student UX and
  aligning persisted question/duration limits.
- [Teacher/admin settings](https://github.com/surdma/festacol/pull/14) is grounded in real academic
  data and roles.
- [Results/history](https://github.com/surdma/festacol/pull/21) shows post-exam product journeys.
  These are not proof of school-wide adoption.

## Healthcare Waste Monitoring

Repositories (private): https://github.com/surdma/waste_monitoring_system and
https://github.com/surdma/waste_monitoring_system_backend

- Frontend route: `app/(dashboard)/[locale]/dashboard`; realtime/store contexts and robot/ward
  controls.
- Backend: `src/routes/wards.py`, `robots.py`, `websocket.py`, `robot_controller.py`,
  `hardware/pi/agent.py` and supporting sensor/motor/navigation modules.
- The code includes simulations and experimental hardware behavior. Do not claim a deployed
  autonomous hospital fleet.

## Earlier work

- **USMLE Focus**: The user's existing resume and portfolio identify work at GlobalAcademies and
  question rephrasing. The public [QBank site](https://app.usmlefocus.com/) was retrievable; the
  source repository and attributable customer outcomes were not.
- **One Day With Difabel** (private repo `surdma/Difabel`): `about-us.html` describes the Cahaya
  Mutiara Ubud Foundation; `activities.html`, `reservation.html` and `js/reservation.js` show
  cultural experiences, reservation and Stripe **test** links. This is not proof of donations
  processed.
- **SmartFit** (private repo `surdma/smartfit`): `app/components/sections/OverviewSection.tsx`,
  `FeatureSection.tsx` and `RevolutionSection.tsx` describe virtual clothing try-on, not health or
  fitness tracking.
- **Algorizmy** (private repo `surdma/algorizmy`): `pages/index.tsx`, `constants/index.ts` and
  `container/algorizmi-page/About.tsx` show a studio/agency site, not an algorithm learning tool.
- **Spacar**: historical portfolio entry and supplied preview URL only; no matching source
  repository or verified deployment was available. Keep design claims tentative.
- **OneUp** (private repo `surdma/oneup`): `src/App.jsx`, `src/Components/Hero/Hero.jsx` and the
  service routes describe digital services, hosting and enquiry, not a learning platform.
- **UTME Prep** (private repo `surdma/utme`): Flutter `lib/presentation/screens/` includes aptitude,
  challenge, results, performance and supporting study tools. `surdma/utme_desktop` is related work.
  The originally listed Vercel preview was not independently matched to this Flutter app.
- **FlutterwaveDjango**: `surdma/FlutterWaveDjango/FlutterwaveDjango/main.py` and
  [PyPI](https://pypi.org/project/flutterwavedjango/) confirm the public package and maintainer,
  while parts of the underlying payment workflow are wrappers or incomplete. Do not claim audited
  compliance, transaction volume or unsupported download figures.

## Writing standards

- Lead with the customer, problem, decisions and role before mentioning implementation technologies.
- Do not use test totals, pull-request totals, commit totals or arbitrary numbers as front-facing
  achievement cards.
- Do not convert intended benefits such as higher conversion or reduced returns into achieved
  commercial metrics.
- Preserve original employers and dates only where the owner's history supports them; do not infer
  an employment relationship from a repository.
- Public source links are offered only for public repositories.
