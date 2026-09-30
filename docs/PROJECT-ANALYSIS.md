# Verified project analysis

- **Reviewed:** 30 September 2026 (Asia/Calcutta)
- **Repository:** `mypresonaldrive/Weddingjhall`
- **Application baseline:** `12642d77163120895cb524068fc98e699e5a7f6a` on `arena/01a0e5a2-weddingjhall`

> **Follow-up:** The [deeper production developer review](PRODUCTION-READINESS.md) identifies additional open findings, including CSV formula handling, logout revocation error reporting, stale edits and retry idempotency. Read that review before a production decision. Passing the earlier suites did not cover all these cases.

## Executive verdict

The supplied analysis is **mostly correct about the stack, implemented features and launch limitations**, but overstates several security and verification claims. This is a React/Express venue-management SaaS application, **not a Flutter project**. No `.dart` files or `pubspec.yaml` exist in the reviewed application tree. `weddinghallFlutteri` is not the name of this checkout; another repository would need its own review.

The code is production-oriented and has useful local regression coverage. It is **not certified for customer launch**. Passing automated tests does not establish that there are no bugs, that the deployment is secure against every threat, or that providers work with real credentials. Numeric ratings such as 8.5/10 are subjective without a scoring rubric; this review uses evidence and remaining acceptance gates instead.

## 1. Stack and architecture

| Layer | Verified implementation |
| --- | --- |
| Frontend | React 19, JSX/CSS, Vite-built responsive SPA; no native Flutter application |
| Server | Node.js 22.13+ / Express; one application serves the API and built frontend |
| Production data/auth | Supabase PostgreSQL and Supabase Auth in `APP_MODE=saas` |
| Demo | `node:sqlite`, seeded accounts and records; browser-local CMS/platform previews |
| Payments | Razorpay SaaS subscriptions **and messaging-credit recharge orders**; not customer venue-booking checkout |
| Deployment | Multi-stage Dockerfile, Compose, Coolify instructions and GitHub Actions regression workflow |

`server.js` defaults to SaaS when `NODE_ENV=production`; otherwise it defaults to demo. Production demo startup requires `ALLOW_DEMO=true`. SaaS startup validates required configuration and HTTPS URLs. These guards do not detect whether an operator has entered real customer data into a demo, and an incorrect `NODE_ENV` can still select demo. There is no automatic demo-to-Supabase migration. Demo SQLite changes can persist in the local data directory/container writable layer; “disposable” does not mean it resets on every restart. Compose mounts no production SQLite volume.

Organizations contain hall records and owner/staff/client memberships. A user currently has one organization membership; multi-organization switching is not implemented. The platform console requires a listed platform administrator and AAL2. It does not automatically grant access to every tenant's private booking/customer records.

Shared pricing, duration and confirmation modules support both UI and server validation. The server recalculates booking quotes instead of accepting client totals. Workspace and platform modules are lazy-loaded. The reviewed production build reports main JS **269.45 kB / 83.91 kB gzip**, deferred Workspace JS **139.64 kB / 39.05 kB gzip**. These are build artifacts, not measured real-user page-load times or the complete page transfer size.

**Evidence:** `server.js`, `server/production.js`, `src/main.jsx`, `src/saas/SaaSApp.jsx`, `shared/booking-pricing.js`, `shared/booking-duration.js`, `Dockerfile`, `compose.yaml`.

## 2. Corrections to the supplied claims

| Original claim | Finding / corrected wording |
| --- | --- |
| All writes use security-definer RPCs | **Incorrect as an absolute.** Core booking/quota/payment and credit-accounting mutations use privileged RPCs. Integration settings, consent/preferences, packs, some message/order state changes and audit inserts also use direct server-side service-role writes. |
| Browser has no database write permissions | **Correct for the reviewed application tables and privileged business RPCs.** Do not generalize this to all Supabase Auth functionality or unrelated schemas/storage. Some read-only policy helper functions are executable by browser roles. |
| Random server sessions + bcrypt(10) describe SaaS security | **Mode confusion.** Opaque random sessions stored in SQLite and bcrypt(10) are demo mechanisms. SaaS uses Supabase access/refresh tokens in HttpOnly cookies and verifies identity through Supabase Auth. |
| Razorpay only bills SaaS subscriptions | **Outdated.** It also handles owner purchases of messaging-credit packs, with captured-payment verification and a separate signed credits webhook. Venue booking payments remain manually recorded. |
| Zod validates everything | **Too broad.** Zod is used widely, alongside custom JavaScript business validation and SQL constraints/RPC checks. This is not proof that every possible input is validated correctly. |
| JSONB means no per-field DB validation | **Too broad.** Domain documents do not have a typed column per field, but SQL RPCs validate important fields/invariants, and relational tables have CHECK/FK/unique constraints. Ad-hoc analytics and independently constraining every document property are still harder. |
| Immutable booking snapshots | **Qualify.** Catalog edits do not rewrite saved agreed rates. Authorized booking edits can recalculate quantities; changing the selected plan/hall or adding services may use new applicable rates. This is not an append-only immutable booking history. |
| All tests run on every CI push | **Incorrect.** The workflow invokes four script groups: SaaS, messaging, SaaS HTTP and deployment. Optional browser suites are not in that workflow; neither is Docker execution or live-provider acceptance. |
| All 7 suites pass, therefore no bugs | **Unsupported conclusion.** Test scripts and test files are different counts. Passing the executed cases only establishes those tested outcomes. No coverage percentage, exhaustive security audit or load certification is established. |
| `/healthz` OK certifies SaaS readiness | **Incorrect inference.** Demo health and static startup tests are not Supabase readiness checks. SaaS health queries four database tables and needs the real database/migrations. Successful startup with placeholder credentials is not proof of a usable database. |
| Demo is blocked from being public | **Only conditionally.** The production opt-in is a configuration guard, not network isolation. Demo has seeded credentials, no explicit CSRF/origin middleware or application rate limiter, and no Secure session-cookie flag. Use synthetic data only. |
| HTTPS enforced | **Qualify.** Production requires an HTTPS `APP_URL`, uses Secure cookies and Helmet headers. Express still listens on an internal HTTP port; TLS termination and blocking direct ingress bypass are deployment responsibilities. |
| Image licensing must be replaced | **Rights need verification, not an invented legal conclusion.** Third-party image attribution is not proof of commercial permission. Obtain/document permission or replace those assets, including their cropped derivatives. The new hero is separately labelled AI-generated illustrative artwork in the website documentation. |

The one-hour access-cookie lifetime and seven-day refresh-cookie lifetime are real settings, but token validity/revocation is still governed by Supabase. `/api/auth/session` supports the implicit-email-link fallback, applies CSRF and rate limiting, and verifies the supplied tokens with Supabase; receiving tokens in a POST body is not itself evidence of an authentication bypass.

## 3. Source inventory and maintainability

Snapshot counts, excluding dependencies, build output and data:

- **42 application JS/JSX files**, **1,691 physical lines**, counting root application JS plus `src/`, `server/`, `shared/`; tests are excluded from that line total.
- **18 CSS files**, **885 physical lines** under `src/`.
- **5 SQL migrations**, **547 physical lines**.
- **25 test `.mjs` files**. Several scripts execute multiple test files.
- **6 existing documentation guides** before this report; **7** including this report. README is separate.
- Migrations define **25 public application tables**: 13 core, 3 CMS, 9 integrations/messaging. RLS is enabled, including through the dynamic loop in migration 005. Some sensitive tables have no browser grants at all.

The supplied approximate 2,700-line figure has no stated counting scope and should not be used as a stable project metric. Dense single-line source makes physical LOC particularly misleading. The 139-line production server contains substantial logic and is difficult to review. Formatting and staged module extraction would improve maintainability, but a broad untested rewrite is not warranted by this analysis. No TODO/FIXME marker in application source would prove completeness or correctness.

## 4. Security and data boundaries

### Implemented controls

- Browser-role write revocation, RLS-scoped reads and server-side actor/organization authorization.
- Atomic core domain RPCs for quotas, conflicts, payments, subscriptions and invitations; atomic messaging credit reservation/finalization and outbox operations.
- HTTPS-configured HttpOnly `__Host-` access/refresh cookies; Supabase identity verification and refresh handling.
- CSRF token comparison and rejection of a mismatched supplied Origin on non-safe API requests. The implementation does not require an Origin header when the valid token pair is present. Provider webhooks are deliberately registered before cookie-CSRF middleware and use raw-body HMAC verification instead.
- Database-backed rate limiting on selected authentication, enquiry, checkout and messaging actions—not a global limiter on every route.
- AAL2 platform gate; AES-256-GCM provider-secret encryption with provider-specific authenticated context; redacted settings responses.
- CSP/Helmet, bounded inputs, signed payment verification, idempotency and explicit uncertain-operation reconciliation.

### Caveats and deployment responsibilities

- The service-role key bypasses RLS. Server authorization and tenant filters are essential, particularly for direct server-side table writes. Never expose this key to React or use it as a browser key.
- Configure `TRUST_PROXY` for the actual trusted ingress chain; restrict direct container access. Turnstile is optional and requires real Supabase/provider setup.
- Demo is not a substitute for SaaS security. `node:sqlite`'s experimental warning is a runtime notice, not a failing test or permission control.
- Keep encryption-key backups separately from database backups. Losing that key makes stored provider settings unreadable; there is no automated key-rotation UI.
- `npm audit` checks known dependency advisories at a point in time, not application authorization, secret handling, cloud configuration or future advisories.

**Evidence:** `server/production.js`, `server.demo.js`, `server/integrations.js`, `server/messaging.js`, all files in `supabase/migrations/`, [deployment guide](COOLIFY.md).

## 5. Features and current limits

The feature inventory is broadly correct:

- Bilingual marketing site, editorial CMS, blog and hall/team subscription-plan finder. This is **not a public venue marketplace**; no public event-availability search, verified venue listing directory or customer booking checkout is implemented.
- Halls, clients, team directory, four-step booking wizard, calendar/search/filtering, CSV export, reports and owner/staff/client permissions.
- Four pricing methods: venue-only, per-plate with venue included, venue plus per-plate, fixed package. Four meal types, menu lists, minimum guarantees, extras, tax/discount/advance and server-calculated quotes. No external-caterer selection.
- Morning/afternoon/evening/full-day/multiple-day/custom booking durations and duration-aware conflicts.
- Financial and event-only printable confirmations. Financial statements are **not statutory GST invoices**; event-only output omits financial and private operations fields.
- Platform plans, organization suspension, audit history, estimated subscription metrics, checkout/webhooks/reconciliation, provider settings, channel wallets, allowances and credit purchases.

Important qualifications:

- The workspace pages through database results but ultimately loads the whole visible tenant dataset into memory; server-side filtering/pagination and performance testing remain future work.
- Platform overview lists are capped at 1,000 per query (audit 100). Collection charts/metrics based on these windows are not guaranteed lifetime totals. Messaging has separate all-history summary calculations but latest-100 jobs/events/grants, latest-30 recharge orders and 1,000-row selectors/consent lists. Do not describe all reports as having the same cap.
- Notification worker is off by default (`MESSAGE_WORKER_ENABLED=false`); channel and recipient alerts require explicit enablement/consent. Automatic dispatch currently concerns first booking confirmation, not every subsequent edit/cancellation or every business event.
- MSG91 uses a configured flow variable; Meta supports one text body parameter. Approval flags are operator attestations, not live template-approval verification. Provider acceptance means “sent” in reports, not delivered/read. Delivery receipts, bounces and inbound opt-out automation are not implemented.
- Production contact enquiries are saved for the platform admin with privacy-policy revision consent; they do not send email. Demo enquiries are neither sent nor stored. Messaging SMTP and Supabase Auth SMTP are separate configurations.
- Legal content starts unpublished and prices start as drafts. There is no tenant file-upload/storage pipeline. Refunds, disputes, credit clawbacks, proration, self-service subscription upgrades and tax invoicing are not automated.

**Evidence:** [booking guide](BOOKING-PACKAGES.md), [website/CMS guide](WEBSITE-CMS.md), [dashboard guide](DASHBOARD-UI.md), [messaging guide](MESSAGING.md).

## 6. Verification performed for this review

Fresh local execution on 30 September 2026:

| Command / check | Result and boundary |
| --- | --- |
| `npm ci` | PASS; installs the lockfile dependencies |
| `npm run test:saas` | PASS; local SQL/RLS/business-rule, schema, signature, chart and recommendation tests |
| `npm run test:messaging` | PASS; local wallet/worker/consent/encryption/HTTP tests with provider mocks |
| `npm run test:saas:http` | PASS; includes production build, HTTP denial checks and expanded startup guard tests; no live provider certification |
| `npm run test:deployment` | PASS; includes production build and isolated demo authentication/booking/pricing/menu/package/printing/static/restart tests; **does not execute Docker** |
| `npm audit` | 0 known dependency vulnerabilities reported at review time |

The HTTP test now explicitly verifies eight startup failures: missing service key, missing app URL, HTTP production app URL, HTTP database URL, invalid mode, production demo without opt-in, partial Razorpay configuration, and test billing without opt-in. Its child environment disables the messaging worker and saved integration loading to avoid inheriting those opt-ins from the developer's shell.

GitHub Actions run [36621370672](https://github.com/mypresonaldrive/Weddingjhall/actions/runs/36621370672) for baseline commit `12642d7` completed successfully. That is evidence for that commit's configured CI job, not every possible suite or future commit. This review does not claim fresh execution of all optional browser suites; the homepage change already had browser verification, and this update changes documentation, HTTP guard tests and CI maintenance configuration rather than UI behavior.

The first review update also passed [GitHub Actions run 36660955950](https://github.com/mypresonaldrive/Weddingjhall/actions/runs/36660955950), but the runner reported non-blocking Node 20 action-runtime deprecation and an upcoming `ubuntu-latest` image migration. The workflow has therefore been updated to SHA-pinned v5 checkout/setup-node actions declaring a Node 24 action runtime and an explicit `ubuntu-24.04` runner. This changes the **action runtime**, not the application's Node 22 test target or Docker base image. Existing regression groups remain unchanged; browser/container/live-provider checks are still separate.

**Not performed here:** live Supabase signup/session/MFA/provider flows, real SMTP/MSG91/Meta/Razorpay transactions, Docker image execution, cloud/network configuration audit, backup restore, penetration testing, accessibility certification or load testing. No Docker executable is available in this review environment. Their absence is a verification gap, not evidence those flows fail.

## 7. Prioritized follow-up

### Required before real customer launch

1. Execute the complete [Coolify release checklist](COOLIFY.md#6-mandatory-release-checks) against the real staging configuration: all migrations, real accounts, MFA, cross-tenant API/RLS checks and recovery flows.
2. Verify Supabase Auth SMTP independently from notification SMTP. Keep notifications disabled until consent, templates, provider delivery and uncertain-send handling are accepted.
3. Complete Razorpay test-mode then controlled live acceptance for subscriptions **and credit recharges**, including duplicate/out-of-order events, ambiguous creation, cancellations and reconciliation. Establish manual refund/dispute procedures.
4. Build and run the actual Docker image; verify health, trusted ingress, HTTPS, shutdown/restart, runtime secrets and backup/restore. A local Express test is not a container test.
5. Review/publish legal pages and commercial plans; document photo rights or replace third-party originals and derivatives. Keep registration closed until these gates are complete.

### Improvements after/beside acceptance, with separate scope

- Format source and extract route/service modules incrementally under regression coverage.
- Add optional browser and actual container smoke coverage to CI, with explicit setup and scope labels.
- Add secure tenant-scoped media uploads if real venue photography is required: storage authorization, size/type validation, lifecycle/deletion and commercial rights management.
- Introduce server-side filtering/pagination, all-history aggregates where needed and representative load tests before scaling.
- Add delivery/bounce/opt-out processing, richer templates and automated refund accounting only as separately designed, tested features.

This review does not enable messaging, change payment charging, migrate the database, add uploads, convert the app to Flutter or claim to remove the remaining launch gates.
