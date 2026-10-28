# LinkedIn profile optimization v2
_Last reviewed: 22 October 2026. Target: https://www.linkedin.com/in/surdma/_

## Read this first: instructions for the execution agent

This is an **execution guide**, not proof that the LinkedIn account has been edited. Its purpose is to make the profile accurate, easy to read, discoverable for relevant engineering work, and recognizably written by a person.

**Scope:** Audit the existing LinkedIn profile, prepare minimal changes, apply authorized updates where possible, verify them on the actual profile, and report what remains unresolved. Do not modify the portfolio application, invent information, or manufacture LinkedIn activity.

**Priority order:** factual accuracy > specific work and ownership > natural writing > relevant search terms > profile completeness. A slightly less polished but truthful sentence is better than a grand claim.

Before acting, refresh the applicable `relvorlabs/agent-controller` skills:
- `skills/using-superpowers` for process.
- `skills/humanizer-ng` for About and experience language.
- `skills/communication-review-ng` to challenge generic or overly smooth copy.
- `skills/seo-audit` for sensible keyword placement. This is **not** a technical website SEO audit; do not transplant rules about title tags, H1s, schemas, or keyword density to LinkedIn.
Only load other skills when the actual task requires them. Follow the current `relvorlabs/personas` lead/handoff approach if working as a repository agent.

**Do not call this task completed from the contents of this file.** Live profile edits must be inspected and verified separately.

## A. Evidence and authority

Read these files from the **current** repository before changing the profile:

| Source | What to use it for |
| --- | --- |
| `lib/data.ts` | `siteConfig`, `socialLinks`, projects, `experiences`, education |
| `lib/resume-data.ts` | Résumé roles and periods, attributed responsibilities, education, courses |
| `lib/about-profile.ts` | Owner-supplied professional roles and areas of work |
| `lib/about-evidence.ts` | Current displayed technology taxonomy |
| `docs/portfolio-evidence.md` | Evidence links and limits on attribution |
| `docs/about-evidence.md` | Source/stack qualifications and prototype distinctions |
| `docs/about-positioning.md` | Positioning and no-inferred-dates rule |
| `app/projects/page.tsx` | Priority of flagship and earlier projects |

Personal facts require the owner's confirmation when sources disagree. Portfolio code and a public project page are not employment records. A merged PR may support an engineering contribution, but does not independently prove customer impact, sole authorship of the whole product, or a management title.

**Confirmed in the current portfolio:**
- Name: **Sodiq Opeyemi Oladejo**. Location: **Lagos, Nigeria**.
- Profile URL: `https://www.linkedin.com/in/surdma/`. Portfolio: `https://founder.relvor.org`.
- Current owner-supplied role: **CAE / VP Engineering, MilliHub**. The start month/year is **not** recorded. Never infer one from commits.
- **ADPDigitek: March 2025 to July 2026** in both `lib/data.ts` and `lib/resume-data.ts`. The previous v1 guide incorrectly said January 2025 to Present. **Do not carry that error into LinkedIn.** If the live profile differs, flag the conflict for the owner instead of silently rewriting a potentially valid personal record.
- GlobalAcademies: July 2024 to January 2025; Memoapps: September 2023 to June 2024; Kinpeak: September 2021 to August 2023; Adroit Solutions: February 2021 to August 2021.
- Education: B.Tech in Mechatronics Engineering, Federal University of Technology, Minna. Study dates not established in these sources.
- Relvor: an **early-stage venture**. Do not describe verified revenue, traction, employees, or a funded company.

**Must confirm with owner before changing:** MilliHub start month/year and employment type; any disputed employment dates or titles; education dates; course issuers/credential IDs not on file; personal phone visibility; job-seeking, hiring, or services settings; public display of private projects. Keep unchanged or skip unresolved fields. Log them as `NEEDS_OWNER_CONFIRMATION`, not "fixed."

## B. How the profile should sound

Write as a working software engineer explaining actual work to another professional.

- Use straightforward first-person sentences in About. In Experience, use short, ordinary action statements.
- Describe the problem, what the person actually did, and the observable result if supported. When a result is unknown, stop after the contribution.
- Use **helped**, **worked on**, **built**, **investigated**, **maintained**, or **published** as appropriate. Do not flatten significant technical work into generic "collaborated" everywhere.
- Vary length naturally. Two meaningful sentences are better than five polished bullets repeating the same point.
- Name technologies where they explain the work, not as a full inventory in every section.
- Keep spelling and tone professional, natural English. Avoid sales copy, faux humility, contrived storytelling, motivational slogans, or unnecessary emojis.
- No em dashes, slogan-like "three pillars", excessive separators, hashtags in the About section, decorative symbols, or keyword stuffing.
- Avoid these formulations in authored copy: **passionate**, **visionary**, **results-driven**, **innovative**, **dynamic professional**, **thought leader**, **trailblazer**, **world-class**, **cutting-edge**, **revolutionary**, **leverage**, **synergy**, **seamless**, **game-changing**, **driving impact**, **at the intersection of**, **transforming industries**, **proven track record**, **end-to-end solutions**, **scalable solutions**.
- Do not replace every ordinary word with an "action verb." Do not say "optimized", "improved", or "led" without supporting specifics.
- **Do not invent metrics**. Specifically, no invented percentages, time saved, users, revenue, downloads, growth, uptime, latency, team sizes, or business adoption.
- Avoid appearing to have personally founded Sabi Ride or AEKO, invented Solana consensus, or built every part of team repositories.

### Example of the standard

**Reject:** "Spearheaded a revolutionary, cutting-edge blockchain ecosystem, driving seamless adoption and transformative business growth."

**Use:** "Worked on AEKO's chain, Explorer and developer tools. I also investigated a testnet failure that stopped new blocks from being produced."

Before publishing a line, ask: "Would I comfortably say this to an engineer who can ask me what I personally did?" If not, rewrite or remove it.

## C. Live-profile audit before any edits

1. Open the authenticated, authorized LinkedIn account at `https://www.linkedin.com/in/surdma/`. Confirm the account belongs to the intended person. Never assume a search snippet is the current profile.
2. Record the **visible current value** of headline, About, positions, dates, education, skills, Featured, Projects, contact info, public URL, photo and banner. Note which sections are missing.
3. Compare each item against current portfolio evidence and the recommendations below. Keep existing wording if it is already accurate, specific and natural. **Do not replace content merely to make it different.**
4. Separate changes into `SAFE_TO_APPLY`, `NEEDS_OWNER_CONFIRMATION`, and `LEAVE_UNCHANGED`. Do not use v1 as an authoritative source.
5. If LinkedIn access is blocked, the account is unavailable, or an edit cannot be saved, prepare copy and report `NOT_APPLIED`. No simulated clicks, invented screenshots, or claim of completion.
6. Follow LinkedIn access and platform rules. Never bypass authentication, rate limits or verification challenges. Do not post, message people, invite connections or change privacy settings as a side effect.

## D. Positioning and recommended headline

**Primary identity:** Software engineer working mainly on backend and real-time systems, with an owner-supplied VP Engineering title at MilliHub. **Secondary:** blockchain-related engineering. **Additional context:** early-stage founder at Relvor.

Use the following headline as a starting point, but preserve an already better, owner-authored one when appropriate:

```text
Software Engineer | VP Engineering at MilliHub | Backend Systems, Real-Time Services & Blockchain | Python, Rust, TypeScript
```

Why: understandable job identity first, evidence-supported specializations next, selected search terms last. Do not add another six roles or an adjective-heavy slogan. Keep `CAE / VP Engineering` as the experience title unless the owner confirms a different public-facing title. Never invent what "CAE" stands for.

## E. About section: proposed natural-language replacement

This is a **draft based on portfolio evidence**, not a claim that the following text is already live. Compare it with the current profile and make only warranted edits. Do not add unresolved dates.

<!-- ABOUT_START -->
I'm a software engineer based in Lagos. Most of my work is on backend services, APIs and real-time systems.

At MilliHub, I work on SabiGo and AEKO. For SabiGo, I've helped build services for ride matching, shared trips and dispatch, including location-aware assignment and handling interruptions to live updates. For AEKO, I've worked on the chain, native social features, the Explorer and developer tools. I also worked through a testnet failure that stopped new blocks from being produced, helping restore block production and transaction confirmations.

I've worked on other products too. Festacol covers school examination workflows such as candidate sessions, timed tests and answer recovery. Laitstyles connects catalogue, inventory, orders and payments for a retail business. I also published FlutterwaveDjango, a Python package for integrating common Flutterwave payment operations into Django applications.

I mainly use Python, Rust and TypeScript, along with Django, FastAPI, Axum, Next.js, PostgreSQL and Redis. The tools vary by project. I'm most interested in understanding the problem properly and getting the system to behave as expected.

I'm also building Relvor as an early-stage venture. My portfolio has case studies with more detail about what I worked on.

Portfolio and projects: https://founder.relvor.org/projects

You can reach me here on LinkedIn about engineering work or collaboration.
<!-- ABOUT_END -->

**Copy rules:** Keep under LinkedIn's current About field limit, including spaces and newlines. Prefer ~1,200–1,700 readable characters over filling every available character. Keep real line breaks and plain paragraphs. Do not paste the complete tech taxonomy or restate every previous employer. The About section is not an autobiography or a CV.

## F. Experience: specific, compact descriptions

Use the exact company records already linked to the profile when legitimate; do not create duplicate companies or duplicate positions. Match LinkedIn's employment-type and date fields only where verified.

### MilliHub | CAE / VP Engineering | Current; start date **[OWNER CONFIRM]**

Use up to four short statements:

- Contribute to engineering direction and hands-on development across SabiGo and AEKO.
- Helped develop SabiGo services for ride matching, shared and group trips, and dispatch delivery, including location-aware assignment and live-update recovery.
- Worked on AEKO's blockchain features, Explorer, developer SDKs and command-line tools, and network operations.
- Investigated and helped resolve a testnet failure that prevented blocks from being produced and transactions from confirming.

Evidence: `docs/portfolio-evidence.md`, including public `https://github.com/MilliHub-dev/aeko-chain/pull/4` for the testnet recovery. **Do not claim ownership of the entire products, every client app or Solana's consensus design.**

### ADPDigitek | Full Stack Developer | March 2025–July 2026 in portfolio

**Owner confirmation required if LinkedIn shows different dates. The v1 "Present" instruction is withdrawn.**

- Worked on frontend and backend features for a remote product team in Spain.
- Improved frontend rendering and performance while developing customer-facing features.
- Worked with design, product and QA colleagues to turn requirements and feedback into changes.

No assumed percentage improvement or employment type.

### GlobalAcademies | Full Stack Developer (Part-Time) | July 2024–January 2025

- Developed question-rephrasing functionality for USMLE Focus, giving learners more variety in exam practice.
- Worked on application usability, backend APIs and exam-preparation flows.
- Used feedback to identify and address problems in learning workflows.

### Memoapps Limited | Backend Developer | September 2023–June 2024

- Built and maintained APIs for Memoneet's communication features.
- Worked on authentication, data access, queries and caching.
- Collaborated on CI/CD work for service releases.

### Kinpeak Limited | Fullstack Developer | September 2021–August 2023

- Developed REST and WebSocket APIs for real-time product features.
- Used Redis and RabbitMQ for background and asynchronous work.
- Investigated database access patterns and contributed to deployments and code maintenance.

### Adroit Solutions Limited | Backend Developer Intern | February–August 2021

- Built API endpoints using Django, Flask and Node.js for internal and client applications.
- Worked with relational and non-relational data stores and helped connect backend services to frontend applications.
- Took part in sprint reviews and refactoring.

**Experience edit rules:** Preserve correct existing role names and company spelling. Use no more than 2–4 substantive bullets per role when possible. Do not claim a measured performance gain, leadership of a team, or full product ownership without evidence. Node.js appears in the internship record; that alone is **not** instruction to add it to the current highlighted technology stack.

## G. Education and certifications

- **Federal University of Technology, Minna**: B.Tech, Mechatronics Engineering. Dates **[OWNER CONFIRM]**.
- **Professional RESTful API Design**: portfolio lists Alison Foundation. Verify certificate name, issuer and credential details against the original certificate before adding/changing.
- **Diploma in Scalable Web Development**: issuer and credential details **[OWNER CONFIRM]**. Do not publish an incomplete or guessed qualification.

Do not pad this section with inferred awards, student leadership, class rank or coursework.

## H. Skills: selective and credible

LinkedIn's official documentation supports up to **100** skills, not v1's limit of 50. **This is a capacity limit, not a target.** Keep a focused selection and connect skills to the experience or project where LinkedIn allows it. Use the exact standardized labels offered in LinkedIn's skill selector.

**Suggested priorities** (adjust to the actual labels and role sought): Backend Development, Software Architecture, Python, Rust, TypeScript, API Development, PostgreSQL, Redis, Django, Real-Time Systems, Technical Leadership.

Additional proven and owner-listed stack may include: FastAPI, Flask, Axum, React, Next.js, Flutter, MongoDB, Prisma, WebSockets, RabbitMQ, Celery, Docker, GitHub Actions, and suitable testing tools. The complete taxonomy is in `lib/about-evidence.ts`; it is not a mandate to list everything. Do not add tools solely because a project's manifest contains a dependency. Do not claim endorsement or proficiency levels that are not recorded.

Reorder visible skills if LinkedIn permits it, but do not describe "five pinned skills" as a guaranteed current product feature. Do not delete skills carrying real endorsements just to match a template.

## I. Featured, Projects and public links

**Feature a small number of genuinely strong items**, ideally 3–5. This is an editorial choice, not a LinkedIn cap. Prioritize proof over quantity:

| Priority | Item | Link and description |
| --- | --- | --- |
| 1 | Portfolio case studies | `https://founder.relvor.org/projects`: work and contributions across selected products |
| 2 | AEKO | `https://scan.aeko.online/`: public Explorer; check that it loads before featuring |
| 3 | Sabi Ride | `https://www.sabiride.net/`: team product, not sole-ownership proof |
| 4 | FlutterwaveDjango | `https://pypi.org/project/flutterwavedjango/`: published Django package |
| 5 | Festacol | `https://festacol.vercel.app/`: exam platform; verify preview/access before adding |

The publicly accessible `https://github.com/MilliHub-dev/aeko-chain/pull/4` is a strong optional technical proof point. Do not show an unavailable preview as a working product. Do not expose private repository URLs.

**LinkedIn Projects section:** Start with AEKO, SabiGo, Festacol, Laitstyles, FlutterwaveDjango and Path-Planning Algorithms. Add Healthcare Waste Monitoring only with its **prototype/experimental** status stated clearly. Most of the fourteen original portfolio entries do **not** need separate LinkedIn entries. Reuse portfolio project descriptions, shorten them, and preserve individual ownership boundaries.

**Project associations:**
- Associate **SabiGo and AEKO** with MilliHub only where the actual LinkedIn employment relationship and project records support it.
- Associate **USMLE Focus** with GlobalAcademies where supported.
- **Do not attach Festacol or Laitstyles to MilliHub** merely because they appear near those projects in the portfolio. Do not invent employers for independent work.

**Contact and privacy:** Retain existing professional email and portfolio link if the owner wants them visible. Do **not** expose, add or broaden access to the phone number without permission. Do not assume that a premium profile website button or a particular number of website slots is available. Inspect the actual account UI.

## J. LinkedIn-specific restrictions and checks (verified October 2026)

- LinkedIn removed the **creator mode on/off toggle** in 2024. Do not instruct an agent to enable it.
- LinkedIn Skills supports up to **100 skills**. Ordering/category behavior follows the current UI.
- The Featured section is not limited to five items. Use a short curated list for readability.
- Some profile-feature buttons/links depend on account tier. Do not presume that custom buttons are available.
- Use the current editor's character counters and controls; platform UI and limits can change.
- LinkedIn's current Projects flow may use **Add media → Add a link** rather than a distinct Project URL field.
- Do not change **Open to Work**, recruiter visibility, Follow/Connect preference, hiring status, services, privacy or public contact settings without explicit owner authorization.

References for the execution agent:
- Skills: `https://www.linkedin.com/help/linkedin/answer/a549047`
- Skill ordering: `https://www.linkedin.com/help/linkedin/answer/a564121`
- Featured: `https://www.linkedin.com/help/learning/answer/a552452`
- Creator mode change: `https://www.linkedin.com/help/linkedin/answer/a5999182`
- Profile sections and project links: `https://www.linkedin.com/help/linkedin/answer/a540837`

## K. Apply and verify: acceptance checklist

Execute in this order; **skip rather than guess**:

1. **Snapshot** all currently visible LinkedIn fields. Record date/time and whether access is authenticated or public-only.
2. **Resolve conflicts:** especially ADPDigitek dates and MilliHub start date. Continue on fields that are already verified.
3. **Preserve good existing content.** Only replace inaccurate, bloated, unsupported or poorly targeted text.
4. **Edit** headline and About, then verified experience descriptions, skills and carefully chosen Featured/Projects items. Do not make unrelated profile changes.
5. **Validate before save:** character counts, correct first person, spelling, real dates, employer association, public URLs, platform fields, and no unsubstantiated numbers.
6. **Verify after save:** reopen the actual profile. Confirm the persisted values in the right sections. Scroll the mobile-sized layout if a browser is available; do not mistake a successful click for persisted content.
7. **Review independently:** challenge the profile as a hiring manager and a technical peer. Would someone identify the specialization in five seconds? Is each significant claim defensible? Does the About read like a person rather than an ad?
8. **Report exact results**, including fields changed, left alone, blocked, uncertain, and verified. Never claim "optimized on LinkedIn" when you only generated a draft or when access was unavailable.

### Quality gate (score only what was actually observed)

Score the *live profile* across these equally weighted categories, 0–2 each, total **/10**:
- **Clarity:** a reader understands the primary role and specialization quickly.
- **Specificity:** recognizable projects and contribution details, not generic statements.
- **Accuracy:** dates, titles, maturity, ownership and claims match verified sources.
- **Natural voice:** simple, first-person, varied, non-promotional wording.
- **Evidence and usability:** relevant skills, working links, curated work, readable sections.

Do not present a draft score as a verified live score. When the full live profile cannot be seen, mark the live score **NOT ASSESSED**. Do not invent recruiter reach, ATS results, search ranking or views.

### Required completion report

```text
LinkedIn profile optimization v2
Repository reference: <branch / commit or source URL actually read>
Live account access: AUTHENTICATED / PUBLIC_ONLY / UNAVAILABLE
Fields verified and updated: <exact field + before/after>
Fields already good and left unchanged: <exact field>
Not applied: <field + reason>
Needs owner confirmation: <specific unresolved personal facts>
Evidence links checked: <links and result>
Headline characters: <count of text actually entered>
About characters: <count of text actually entered>
Live profile score: <0-10 with category evidence, or NOT ASSESSED>
Final status: VERIFIED_ON_LINKEDIN / PARTIALLY_VERIFIED / DRAFT_ONLY
```

Never substitute "agent finished the task" for this report.
