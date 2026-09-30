# Production developer review

**Reviewed:** 30 September 2026, Asia/Calcutta.
**Code baseline:** `33c2094fc57a7ce3e4958d29ca206233b832db77`, `mypresonaldrive/Weddingjhall`.
**Scope:** source inspection, fresh local regression/build/audit execution and two isolated reproductions of existing function behavior. This is not a penetration test, load test, Docker execution or live-provider certification.

## Executive decision

**Suitable for continued development and controlled staging; not yet approved for unrestricted customer production.**

The application has meaningful tenant isolation, server-authoritative pricing, transactional booking/payment protections and a usable venue-management workflow. However, this deeper review found issues beyond the earlier general assessment. Passing the existing suites does not demonstrate that these cases are covered.

This report is an analysis-only change. The findings below are **open**, not fixed by adding this document.

### Evidence labels

- **Reproduced logic behavior:** actual function text was exercised in isolation with synthetic inputs/mocks. This does not mean a live attack or a complete browser/provider flow was executed.
- **Code-confirmed gap:** the implementation is visible in source; the adverse failure scenario has not been exercised under production conditions.
- **Unverified:** requires a deployed environment or real external service.
- **Product limitation:** intentionally missing or restricted functionality, not automatically a bug.

Priorities are engineering release priorities, not CVSS scores: **P1** address/explicitly mitigate before relying on the affected production workflow; **P2** improve for reliability, scale or expansion. No assertion of a remotely exploitable critical authentication bypass is made.

## 1. Architecture

```text
Browser: React 19 / Vite SPA
        |
        v
Express application: routing, auth, authorization, validation
        |                         |
        v                         v
Supabase Auth/PostgreSQL      Razorpay / SMTP / MSG91 / Meta
        ^                         ^
        |                         |
        +--- in-process notification worker

Separate demo mode: SQLite + seeded users/data + local CMS preview
```

### Strengths

- A modular monolith is a reasonable deployment shape at this stage: one origin, no unnecessary microservice overhead, shared validation/pricing utilities.
- Production and demo entry points are separated; production does not silently fall back to SQLite.
- Business mutations pass through Express; app browser roles cannot arbitrarily write database tables.
- Booking and credit invariants are enforced transactionally, not solely by disabled UI controls.
- Lazy-loaded workspaces reduce the public site's initial JavaScript dependency graph.

### Constraints

- HTTP handling and notification dispatch share a process. Restarts and resource pressure affect both.
- `server/production.js` concentrates authentication, billing, directory and record routes in dense source. `src/Workspace.jsx` also carries substantial UI/business interaction complexity.
- Multiple application instances must share configuration/encryption keys. Saved Razorpay changes require coordinated restarts; different active keys between instances would be operationally unsafe.
- Do not introduce microservices simply to improve a rating. First establish observability, smaller modules, workload measurements and transaction boundaries.

## 2. Codebase and developer experience

Stack: React 19, JSX/CSS, Express, Node 22.13+, Supabase SDK, Zod, plain JavaScript shared utilities. **No Flutter/Dart application.**

Dense source is a maintenance concern: reviewing authorization, database changes and exceptional paths is harder than raw line counts suggest. The checked-in package scripts provide business/security tests, but no dedicated lint/typecheck script. TypeScript is optional; explicit interfaces and incremental static checks would still help.

Recommended engineering work:

1. Introduce formatting/linting as a separate behavior-preserving change.
2. Split authentication, billing, organization records and response/error handling into focused modules.
3. Keep trusted tenant/actor derivation separate from request payloads.
4. Document API contracts, retry semantics, money units and state transitions.
5. Add regression tests for failures, stale edits and retry paths—not just successful CRUD.
6. Add dependency-update ownership. A SHA-pinned action still needs intentional update review.

## 3. Database and data integrity

Five ordered migrations define 25 public application tables with RLS. Core relationships and subscription/payment records use relational constraints; tenant domain records use `saas_records(kind, body JSONB)`.

### Good protections

- Tenant membership and access restrictions.
- Organization-level write locking for core record mutations.
- Atomic hall/staff quotas, range-overlap checks, capacity checks, payment bounds and invitation rules.
- Separate private operations-note records.
- Subscription and payment identifiers support provider-event deduplication.
- Messaging credits have transactional reservation/finalization rather than a browser-maintained balance.

### Important trade-offs

- JSONB is flexible but complicates analytics, indexing, schema evolution and field-by-field constraints. It is not evidence that there is no SQL validation; important invariants are validated in RPCs.
- Per-organization locks protect invariants but serialize same-organization writes. Measure contention under representative concurrent traffic.
- Ordinary business records do not have the same stale-revision protection as CMS entries/settings. See F3.
- Financial booking/payment records can be deleted through existing workflows. Deleting a booking also deletes related payment records. This is unsuitable as the sole legally durable accounting ledger without a defined archival/reversal policy.
- Business audit entries usually identify an operation/record; they are not complete before/after revisions of every booking. An audit trail is not a backup or full event-sourced history.
- Migration files broadly revoke privileges in the public schema. Use a dedicated project and versioned migration tracking, not an unrelated shared database.

Before production, define migration ownership, schema version tracking, backup retention, restoration procedure, acceptable recovery-point objective and recovery-time objective. Restore into an isolated environment and verify both data and application behavior.

## 4. Security assessment

### Implemented strengths

- Supabase identity verification, HttpOnly access/refresh cookies, Secure `__Host-` cookies when HTTPS-configured, and AAL2 platform-administrator checks.
- CSRF checks, supplied-Origin validation, bounded request bodies, selected endpoint rate limits and Helmet CSP.
- RLS/read boundaries and explicit service-side authorization; raw-body HMAC payment webhooks.
- AES-256-GCM provider credentials, redacted settings responses and provider-specific authenticated encryption context.
- Server-calculated totals and role-based restrictions, including private event-only printing boundaries.

### Boundaries developers must understand

- The service-role key bypasses RLS. Direct settings/messaging table operations therefore depend on correct server-side authorization and filters. Not every server write is an RPC.
- Opaque SQLite sessions and bcrypt are **demo** mechanisms; SaaS uses Supabase Auth.
- Demo lacks production CSRF/rate-limit/Secure-cookie protections and has known seeded accounts. Never put real customer data in it.
- HTTPS URL validation is not a TLS listener: the reverse proxy must terminate TLS and block direct bypass. The supplied Compose port mapping is not restricted to loopback; choose binding/firewall/network rules deliberately.
- Set `TRUST_PROXY` to the real trusted topology, not an arbitrary copied value.
- Turnstile is optional, and rate limiting is not universal across all endpoints.
- Logout revocation handling needs correction; see F2. Even successful refresh-session revocation should not be advertised as instant invalidation of every already-issued JWT without verifying Supabase's token behavior.
- An audit returning zero dependency advisories is not an application security certification.

## 5. Findings: bugs, integrity gaps and failure handling

### F1 — CSV formula handling: P1, reproduced logic behavior

**Location:** `src/Workspace.jsx`, `exportData`.

CSV serialization escapes quotes and wraps values in quotes, but does not neutralize formula-leading user text. Exercising the actual serializer with harmless synthetic input produced:

```csv
name,notes
"=1+1","+SUM(1,1)"
```

**Impact:** a spreadsheet can interpret exported user-controlled text as formulas. Quoting a CSV field does not by itself force a spreadsheet to treat it as text. Exact behavior depends on spreadsheet software/import settings; no spreadsheet program or external payload was executed during this review.

**Recommendation:** use a shared, tested spreadsheet-safe export strategy covering formula prefixes, leading whitespace/control characters, quotes/newlines and legitimate numeric values. Test representative Excel/LibreOffice import behavior. Until corrected, treat exports containing untrusted text as unsafe to open with formula evaluation enabled.

### F2 — Logout reports success on a returned revocation error: P1, reproduced logic behavior

**Location:** `server/production.js`, `POST /api/auth/logout`.

The handler awaits `admin.auth.admin.signOut(...)` but does not inspect its returned `error`. The SDK commonly represents failures through result objects rather than thrown exceptions. Exercising the actual handler body with a mock returned error produced:

```text
local cookies cleared: true
response: { success: true }
```

**Impact:** local cookie removal can succeed while provider-side global revocation fails, but the client is told only that logout succeeded. This is not evidence of an authentication bypass; it is an incorrect success signal about a security operation.

**Recommendation:** always clear local cookies, explicitly handle/report provider revocation failure, emit a safe operational event and distinguish local logout from confirmed global session revocation. Add tests for returned errors, thrown failures, successful revocation and unavailable authenticated-session middleware.

### F3 — Ordinary record edits have no stale-version check: P1 for concurrent operations, code-confirmed gap

**Locations:** `server/production.js` `saveRecord`, migration 002 `saas_save_record`.

Updates replace the document body without a client-supplied expected revision/`updated_at` comparison. Database locking serializes writes but does not detect that the second user submitted an older view of the record.

**Risk scenario:** two authorized staff open one booking; one saves updated details; the other saves a stale form and overwrites unrelated changes. Pricing/payment invariant checks do not prevent every lost field update. The parallel-browser scenario was not executed in this review.

**Recommendation:** add optimistic concurrency under the same transaction, return a conflict on stale edits and offer reload/compare UI. Apply to bookings and other editable business documents, not only CMS/settings.

### F4 — Manual create/payment retries lack request idempotency: P1 for financial operations, code-confirmed gap

**Location:** `server/production.js`, `saveRecord` creates a fresh `randomUUID()` for each POST.

**Risk scenario:** a payment record is saved but the HTTP response is lost; retrying the same user intent can create another payment while sufficient booking balance remains. The overpayment bound prevents exceeding the total, not duplicate partial-payment intent. Provider-webhook idempotency does not cover this manual record endpoint.

**Recommendation:** accept a stable request idempotency key scoped to actor/tenant/action and persist the result atomically. Distinguish an intentional second payment from a retry. Test concurrent duplicate requests and dropped responses. This scenario was source-reviewed, not fault-injected end to end.

### F5 — Some updates and their audit insert are separate operations: P1/P2 by operation, code-confirmed gap

**Locations:** `server/integrations.js` settings save; `server/messaging.js` preferences/consent/packs and other administrative operations.

A data mutation may commit before its separate audit insertion fails. The response can then report failure although state changed, and the corresponding audit event may be missing.

**Recommendation:** group safety-critical mutation and audit in a transactional RPC, or use a durable transactional audit outbox. Add failure injection between the two operations. Do not assume every audit trail is currently atomic merely because core booking RPCs are.

### F6 — Database failures are broadly mapped to HTTP 400: P2, code-confirmed gap

**Location:** `server/production.js`, `result` wraps database errors with `fail(error.message)` using the default 400 status.

This can classify dependency failures as client mistakes and expose raw database diagnostics for non-500 responses. No secret leak was demonstrated. It also means some failures bypass the existing 500-only log branch.

**Recommendation:** distinguish validation/conflict/authorization errors from service/unexpected errors. Return safe public messages, appropriate statuses and a correlation ID; retain redacted operator diagnostics separately.

### F7 — Operational state can grow without visible retention jobs: P2, code-confirmed gap

`saas_rate_limit` resets expired buckets when the same key returns, but no scheduled cleanup of abandoned keys was found. Audit, messaging and billing histories also need deliberate retention/archival rules. This is a growth/operations concern, not evidence of current exhaustion.

**Recommendation:** define data-category retention rules and safe cleanup schedules. Never remove active credit reservations or financial evidence solely to reduce row counts.

## 6. Billing, money and reconciliation

There are **three distinct money-related domains**:

| Domain | Implementation | Do not confuse it with |
| --- | --- | --- |
| SaaS subscription | Razorpay recurring organization subscription | Customer's venue/event bill |
| Messaging credit purchase | Razorpay order/captured payment and channel credit grant | Transferable cash wallet |
| Venue booking payment | Authorized manual payment record | Online gateway confirmation or bank settlement |

Pricing snapshots preserve agreed catalog rates against later catalog edits, but authorized booking changes can recalculate totals. Verify currency units carefully: provider amounts use paise while venue-price fields/quotes have their own application representation.

Good controls include verified checkout/webhooks, provider ID binding, captured-payment checks and explicit ambiguous-create reconciliation. Missing operational features include automated refunds/chargeback credit reversal, statutory tax invoices, provider settlement/fee accounting, proration and self-service plan replacement/upgrade flows.

Do not treat estimated MRR or loaded-window gross collections as audited net revenue. Define a support procedure for disputed charges, uncertain orders, expired trials and cancelled mandates. Never “repair” payment state by granting arbitrary paid entitlement without evidence.

## 7. Messaging and worker reliability

The worker is opt-in, in-process, ticks every five seconds and handles up to ten jobs per iteration sequentially. Throughput depends on provider latency; ten per tick is not a guaranteed delivery rate.

Strengths: per-channel balances, consent/contact checks, provider enablement checks, event-only payloads, atomic reservation, idempotent confirmation enqueueing and conservative unknown-outcome handling.

Limitations:

- First booking confirmation, not a complete notification lifecycle for every edit/cancellation.
- Provider “sent” means accepted, not delivered/read.
- No automated delivery receipts, bounce handling or inbound STOP/opt-out ingestion.
- Limited SMS/WhatsApp template parameters; approval is operator-attested.
- A crash/shutdown during dispatch can require manual uncertain-send reconciliation. The stop function stops new work but does not await every in-flight provider send before server shutdown exits.
- Ordinary edits/reconfirmation do not blindly resend. This prevents duplicates but must be explained to venue operators.
- Purchased-credit refunds/clawbacks are not automatic.

Before enabling, test consent withdrawal, contact changes, blocked recipients, insufficient credit, provider timeout after acceptance, process termination during dispatch and operator reconciliation. Use separate credentials/settings for Supabase Auth SMTP and booking-notification SMTP.

## 8. Performance and scalability

The build is reasonably split: main JS approximately 269.45 kB (83.91 kB gzip), deferred Workspace JS approximately 139.64 kB (39.05 kB gzip). This does not establish user-perceived speed.

Main scale risks:

1. Workspace retrieval eventually loads the entire visible tenant dataset; server validation also reads broad tenant data.
2. Availability collects hall/booking records and checks overlaps in application loops.
3. Each authenticated request performs identity and multiple organization/profile/subscription lookups.
4. Organization-level locks serialize domain writes.
5. Platform dashboards use capped windows rather than complete financial aggregates.
6. Sequential in-process dispatch competes with web traffic and provider latency.

Measure representative tenant sizes, concurrent requests, p50/p95 latency, database query plans, payload sizes, lock waits and memory. Do not publish a user/booking capacity number without these measurements. Supabase Free can be useful for development or a constrained pilot, but production suitability depends on current quotas, availability/backup requirements and measured usage; no fixed free-plan capacity is certified here.

## 9. Functional completeness

### Implemented

Public EN/HI website, blog/CMS, plan finder; hall/client/staff management; four-step booking wizard; duration-aware calendar/conflicts; four pricing methods and four meal types; food menus/add-ons; minimum guarantees; taxes/discount/advance; quotes/snapshots; payments/reports/CSV; financial and event-only prints; platform plans/organizations/audit/billing/settings/messaging credits.

### Not implemented or deliberately limited

- Public venue marketplace, public availability directory and guest checkout.
- Customer-facing payment gateway for venue bookings.
- Tenant-scoped file/image upload pipeline.
- Multi-organization switching for one user.
- Automated subscription upgrades/proration/refunds/credit chargeback accounting.
- Statutory GST invoices or full accounting/bank reconciliation.
- Complete delivery/opt-out/notification lifecycle processing.
- Contact-form emails: production saves enquiries; demo does not send/store them.
- Comprehensive self-service data portability/deletion/retention operations.

Not every absent feature must be built before a pilot. It must either be necessary for the promised product and implemented, or clearly excluded from the offer with a workable operational process.

## 10. UX, accessibility, localization and SEO

The public website has EN/HI content, responsive layouts and reduced-motion behavior. Workspaces support theme options and practical booking/print flows. Public-site bilingual support is not proof that every operational UI string is localized.

Remaining checks:

- Screen-reader navigation, keyboard-only use, focus/error announcements, zoom/reflow and color contrast with custom themes. Existing UI tests do not constitute WCAG certification.
- Low-bandwidth devices, first-load font/image behavior and long content.
- Full wizard validation and recovery after failed saves; warnings about stale records and retrying payments.
- Venue date/time semantics: shared duration logic encodes wall-clock input with UTC arithmetic for comparisons. This is not a general tenant-timezone/DST scheduling engine; define semantics before adding timezone-aware integrations.
- Marketing SEO currently updates title/description client-side. Server rendering/prerendering, canonical/hreflang/social metadata and sitemap strategy need separate review before relying on organic discovery/social previews.
- Keep illustrative images labelled; do not present software categories as real available venues or fabricate testimonials.

## 11. Deployment, observability and operations

### Configure explicitly

`APP_MODE=saas`, `NODE_ENV=production`, exact HTTPS `APP_URL`, Supabase keys, correct `TRUST_PROXY`, strong rate-limit secret and reviewed registration gate. Store service-role/provider/encryption secrets only in server runtime secret storage. Keep `MESSAGE_WORKER_ENABLED=false` until acceptance.

### Deployment gates

- Apply all migrations in order; verify grants with real authenticated/anonymous roles.
- Build/run the actual Docker image and test health, shutdown, restart and recovery.
- `/healthz` in SaaS queries database tables. It is not independent process liveness, and a process listening with placeholder credentials is not proof of readiness.
- Separate staging and production database/provider credentials.
- Test deployment and rollback compatibility. Reverting JavaScript does not undo a database migration or external payment side effect.
- Decide whether schema rollout requires temporary maintenance/read-only mode.
- Back up and restore both database and separately managed encryption keys.

### Monitoring gaps

The code has basic console logs, but no comprehensive structured request tracing, latency/error metrics, alert routing or durable reconciliation dashboard alerts were found. Add request IDs and redacted error classification; alert on webhook failures, queue age, unknown sends/orders, health failures, database pressure and backup failure. Do not log access tokens, provider secrets or unnecessary personal details.

## 12. Privacy, legal and commercial readiness

Review privacy/terms/refund pages before publication. Define customer consent evidence, processor responsibilities, retention periods, access/deletion procedures and incident response with appropriate legal advice. Do not infer compliance from RLS alone.

Third-party photos and their cropped derivatives require documented usage rights or replacement. Generated illustrative artwork is separate and should remain non-deceptive; confirm applicable usage terms. Plan prices, support promises, cancellation terms and channel-credit expiry/rollover must match actual behavior.

Operational ownership matters: assign responsibility for admin recovery, refunds, provider-template approvals, failed deliveries, revoked consent, service outages and backup restores.

## 13. Verification and limitations

Fresh local checks passed for this review:

- `npm ci`
- `npm run test:saas`
- `npm run test:messaging`
- `npm run test:saas:http` (includes production build)
- `npm run test:deployment` (includes build and isolated demo regressions)
- `npm audit`: zero known dependency advisories reported at execution time

Additional checks: actual CSV serialization with harmless formula-like input; actual logout handler body with a mocked returned revocation error. Both confirmed the behaviors described in F1/F2. These were isolated function executions, not a live spreadsheet/provider exploit or a complete HTTP browser flow.

Not rerun in this analysis: optional browser suites. Not performed: live Supabase/provider acceptance, real payments, Docker execution, penetration testing, accessibility certification, sustained load/concurrency/chaos testing or restore drills. Existing local SQL tests use PGlite and simulated auth roles; they do not certify every aspect of hosted Supabase Auth/PostgREST behavior.

## 14. Prioritized action plan

### Before relying on real customer workflows

1. Fix and regression-test spreadsheet-safe CSV and truthful logout revocation handling (F1/F2).
2. Add stale-edit protection and stable payment-create idempotency (F3/F4), or explicitly restrict affected workflows while implementing them.
3. Make critical mutation/audit operations atomic and improve failure classification (F5/F6).
4. Complete real two-tenant authorization/MFA/auth-recovery acceptance and provider payment/message tests.
5. Execute Docker/ingress/backup-restore checks and establish incident/reconciliation ownership.
6. Publish reviewed policies/plans, confirm asset rights and keep unaccepted features disabled.

### Before larger rollout

- Server-side paging/filtering, measured query/index improvements and reliable aggregates.
- Structured observability, data retention/archival and notification worker operational controls.
- Browser CI and container smoke coverage; repeatable staging release acceptance.
- Formatting/module extraction/static checks and explicit API contracts.
- Uploads, extended billing or delivery features only according to product commitments.

**Bottom line:** a capable implementation with good foundations, but local green tests are not a production sign-off. Treat this report as an open engineering backlog plus a release-gate checklist.
