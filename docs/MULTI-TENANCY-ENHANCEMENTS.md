# Multi-Tenancy SaaS Enhancement Roadmap

**Baseline:** commit `e88e123` on `arena/01a0e5a2-weddingjhall`.
**Status:** enhancement **options** for a stronger multi-tenant SaaS — none of these are implemented by this document. Effort estimates are qualitative (S/M/L), not commitments.
**Prerequisite:** the open findings F1–F7 in [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) take priority over every enhancement below. Do not build new capability on top of known data-integrity gaps.

---

## 1. Current tenancy model (what the enhancements build on)

- One row-membership tenancy: `memberships.user_id` is the primary key, so a person belongs to **one organization only**.
- Server uses the Supabase **service-role key**, which bypasses RLS — all authorization happens in application code.
- Business data (bookings, payments, staff, packages…) is stored as **JSONB records per organization** with an **organization-wide advisory lock** in the save RPC.
- Messaging dispatch runs **in-process** with the web server; rate limiting uses a shared database table.
- Plan enforcing exists for hall counts; CMS/branding per tenant already exists.

This is a reasonable shared-schema SaaS foundation. The roadmap below hardens it first, then adds commercial and enterprise depth.

---

## 2. Tier 1 — Tenancy hardening (recommended before more tenants onboard)

| # | Enhancement | Why | Effort |
|---|---|---|---|
| T1.1 | **Single tenant-context path per request** — resolve organization once (middleware), carry it in request-scoped context (e.g. AsyncLocalStorage), and forbid any handler that queries data without it | Prevents the classic cross-tenant bug class: a route that forgets `organization_id`. Today correctness depends on every handler remembering scoping manually | M |
| T1.2 | **RLS defense-in-depth** — stop using service-role for user-triggered reads where practical: per-request Supabase clients with the user JWT, or a dedicated DB role + `set_config('app.current_org', …)` per transaction with org-scoped policies | Today a single server-side scoping mistake leaks all tenants because service-role bypasses RLS. Defense-in-depth makes a scoping bug hit the database's own wall instead | L |
| T1.3 | **Automated cross-tenant isolation test matrix** — for each sensitive table/route: user A cannot read/write/search/export organization B's data, including crafted IDs, membership of both orgs, and direct HTTP calls | Green unit tests today don't prove isolation route-by-route; this is the regression net that must exist before tenant count grows | M |
| T1.4 | **Hybrid relational schema for hot paths** — promote frequently queried/sorted fields (booking date, status, customer, amount, hall) from JSONB into typed indexed columns; keep JSONB for the flexible tail | The org-wide JSONB document forces full-tenant loads, weak ad-hoc reporting, and full-document rewrites. Start with bookings/payments — highest contention | L |
| T1.5 | **Composite indexes with `organization_id` first** on every tenant table + query-plan (`EXPLAIN`) review for workspace load, availability, and dashboard queries | Without index discipline, one large tenant slows every other tenant — the noisy-neighbor problem at the database layer | S |
| T1.6 | **Per-tenant rate limiting and quotas** — API, export, login, and messaging limits keyed by organization (not just IP), with 429 responses + alerts | Protects all tenants from one tenant's abuse/bug; also enables plan-based limits later | M |
| T1.7 | **Transactional outbox** — enqueue notifications/audits in the same DB transaction as the mutation; separate worker process (or Supabase Cron) drains them with retry and dead-letter states | Fixes F5 (audit-after-mutation partial failures) structurally, makes restart/deploy loss visible instead of silent, and removes notification work from the web process | M |
| T1.8 | **Scheduled retention/cleanup jobs** (pg_cron / Supabase Scheduled Jobs) — rate-limit buckets (F7), expired invitations/otps, old audit and delivery records per a written retention policy | Prevents unbounded table growth that degrades every tenant over time | S |
| T1.9 | **Supabase Storage for tenant media** with per-organization buckets/policies (hall photos, documents), size/type validation, and signed URLs | Today there is no tenant upload pipeline; putting files in the DB or public URLs would create isolation problems later | M |
| T1.10 | **Stale-check + idempotency standard for all write APIs** (expected-version header / `If-Match`-style on records; idempotency keys on payment-style creates) | Closes F3 and F4 generically, so future features inherit safe writes instead of re-introducing the bugs | M |

## 3. Tier 2 — Tenant lifecycle & commercial SaaS

| # | Enhancement | Why | Effort |
|---|---|---|---|
| T2.1 | **Multi-organization membership + org switcher** — drop the `user_id` PK constraint, membership = (user, org, role) rows; switcher UI + per-request chosen-org validation | One-tenant-per-user blocks agencies, staff working across venues, and the eventual marketplace | M |
| T2.2 | **Granular RBAC** — roles beyond admin/owner logic: owner / manager / staff / read-only, with a server-checked permission matrix (who can record payments, export, delete bookings, manage messaging) | Real multi-tenant customers demand least-privilege staff access; today the distinction is coarse | M |
| T2.3 | **Server-enforced entitlements** — a single `plan → features/limits` table checked on the server for halls (exists), staff seats, messaging allowances, exports, custom branding, API access | Revenue protection: limits enforced only in the UI can be bypassed; this also powers clean plan upgrades | M |
| T2.4 | **Subscription lifecycle depth** — proration on upgrade/downgrade, dunning (failed-payment retry schedule), grace period before suspension, self-service plan change, invoice history | Required when paying tenants churn and fail payments; Razorpay webhooks already exist as the backbone | L |
| T2.5 | **Tenant lifecycle automation** — provisioning checklist, seeded starter data, trial expiry, suspension, archival, and irreversible deletion with a data-export option | Manual lifecycle handling doesn't scale past a handful of tenants and is error-prone | M |
| T2.6 | **Custom domains / subdomains + white-label** — `venue.yourdomain.com`, tenant logo/theme/footer via the existing CMS, tenant-facing email sender name | The highest-value perceived differentiation for venue owners; the CMS and theming already exist as the base | M |
| T2.7 | **Self-service data export & privacy tooling** — per-tenant full export (bookings, payments, customers) and customer-record deletion honoring retention rules | Trust, legal readiness, and a selling point in India as DPDP obligations mature | M |
| T2.8 | **Usage metering dashboard for admin** — messages sent/held/failed per tenant, storage, active bookings, credit burn | Until you can see per-tenant usage, you can't price plans or catch abuse | S |

## 4. Tier 3 — Enterprise & scale (later, when warranted)

| # | Enhancement | Why | Effort |
|---|---|---|---|
| T3.1 | **Supabase Realtime per-organization channels** for live booking-calendar and dashboard updates | Better UX than polling; channel authorization must be org-scoped | M |
| T3.2 | **Immutable, exportable audit trail** — tenant-visible activity log; platform audit export; documented tamper-evidence for financial events | The current audit entries are sparse and sometimes non-atomic (F5); auditors and disputes need complete before/after history | L |
| T3.3 | **Reporting layer** — materialized views / read model for dashboards and GST-ready exports, so reports stop scanning live tenant data | Production-readiness already flags JSONB reporting weakness; a read model is the durable fix | L |
| T3.4 | **Partitioning + archiving** for high-volume tables (audit, messaging jobs, rate limits) by month | Keeps queries fast as history grows; combine with retention jobs (T1.8) | M |
| T3.5 | **Per-tenant SSO (SAML/OIDC)** and optional IP allowlists for large venue groups | Enterprise procurement checkbox; Supabase supports enterprise SSO | L |
| T3.6 | **Disaster-recovery targets** — written RPO/RTO, automated restore drills to an isolated project, key-rotation runbook | A backup that has never been restored is a hope, not a plan | M |
| T3.7 | **Feature flags per plan/tenant** — staged rollout of new features to a subset of tenants | Safe rollouts; pairs with entitlements (T2.3) | S |
| T3.8 | **Audited support impersonation** — platform admin "view as tenant" that is read-only by default and heavily logged | Essential for support at scale; dangerous if bolted on without audit | M |

## 5. What NOT to build yet (over-engineering traps)

- **Per-tenant databases or sharding** — shared schema + RLS + indexes serves far beyond the current stage; splitting databases multiplies migration, backup, and reporting pain.
- **Microservices** — split the **worker** out of the web process (T1.7); keep the rest a monolith.
- **Kubernetes** — the Compose/Coolify flow with health checks and rollback is sufficient; invest in monitoring instead.
- **Custom auth replacement** — Supabase Auth + custom SMTP + MFA is adequate; spend effort on sessions, logout correctness (F2), and MFA rollout instead.
- **A public venue marketplace / customer gateway** — deliberately out of scope per product decisions; revisit only with a dedicated design.

## 6. Suggested phases

**Phase 1 — Pilot-hardening (now):** F1–F7 fixes → T1.1, T1.3, T1.4 (bookings/payments only), T1.5, T1.7, T1.8, T1.10.
**Phase 2 — Commercial depth (before marketing to many venues):** T2.1–T2.4, T2.7, plus T1.9 for media.
**Phase 3 — Enterprise (when a large customer or compliance demand appears):** T3.1–T3.8 on demand, not speculatively.

**Recommended first five engineering items:** stale-write protection + idempotency (T1.10), outbox + separate worker (T1.7), cross-tenant test matrix (T1.3), tenant-context middleware (T1.1), retention jobs (T1.8). Together they remove the findings that could actually corrupt or mix tenant data.

## 7. Verification rule for every enhancement

No enhancement is "done" without: (1) a failing test written before the fix that passes after, (2) a cross-tenant isolation case, (3) a failure-path case (database down, provider error, restart mid-operation), and (4) a README/docs update. The existing CI layout (saas / messaging / http / deployment groups) should gain one group per enhancement rather than growing ad-hoc.
