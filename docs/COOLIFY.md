# Gatherhall SaaS deployment: Supabase + Razorpay

New to Supabase? Start with [the first-time setup walkthrough](SUPABASE-FIRST-TIME.md), then use this document as the deployment/release checklist.

## Status and boundaries

This is a production-oriented implementation, **not a live-certified deployment**. Local migration/business-rule tests and demo regressions are separate from real Supabase Auth, SMTP, Razorpay Checkout/webhook and Docker verification. Complete the acceptance checklist below before onboarding customers. See the [verified project analysis](PROJECT-ANALYSIS.md) for the distinction between implemented controls, local tests and live acceptance. The default draft prices are illustrative and need operator approval.

Production defaults to `APP_MODE=saas` and fails startup without Supabase credentials and an HTTPS `APP_URL`. SQLite exists only in the explicitly isolated demo. There is no automatic migration of demo accounts or records into real organizations.

One organization per user is currently supported; multiple halls belong to that organization. Existing subscriptions retain price/limit snapshots. Self-service plan upgrades, replacements after a terminal canceled mandate, proration, refunds, accounting/tax invoices, automated delinquency email and multi-organization switching are **not implemented**. Do not advertise these features. Contact support for changes; never edit entitlements to simulate payment.

## 1. New Supabase project

Use a **dedicated new project**, not a project hosting unrelated apps. Apply all files in `supabase/migrations/` in filename order, once each through versioned Supabase migrations / SQL administration. It revokes public-schema privileges broadly and is not intended to be rerun without migration tracking. The initial migration creates tenant RLS, service-only mutation RPCs, auth-profile trigger, platform administration, audit, subscription snapshots and billing ledger.

Browser writes and sensitive RPC execution are revoked. The service-role key is server-only. The server verifies Supabase users, applies actor authorization and checks platform AAL2 for administrative operations. Core domain and credit-accounting mutations use privileged business RPCs; settings, consent, some messaging operations and audit writes also use direct service-role table access. These direct writes rely on explicit server-side authorization and tenant scoping, not browser RLS. Platform admins can inspect tenant metadata and SaaS billing, not automatically read tenant customer/booking records.

Enable email confirmation. Configure custom SMTP, sender/domain verification, production Site URL and redirect allowlist for your exact HTTPS domain. Test delivery, expiry and abuse limits. Configure Turnstile secret in Supabase Auth if using `TURNSTILE_SITE_KEY` in the app.

Recommended confirmation-template links use token hashes, for example:

```
https://YOUR_DOMAIN/auth/confirm?token_hash={{ .TokenHash }}&type=signup
https://YOUR_DOMAIN/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
https://YOUR_DOMAIN/auth/confirm?token_hash={{ .TokenHash }}&type=invite
```

Set each template to the matching type. The default implicit-token flow is also supported: the browser exchanges the fragment tokens for HttpOnly cookies and immediately clears the fragment. Invites never silently attach an account: after verifying email and setting a password, the recipient must explicitly accept the named organization's invitation. Existing users can sign in to view a pending invitation even if Supabase declines a repeat invite email.

### Follow-up migrations for an existing installation

If `202609290001_saas.sql` is already applied, apply only the unapplied migrations:

- `202609290002_atomic_validation.sql`: rechecks positive payments, booking totals, guest capacity, maintenance restrictions and valid time windows under the organization write lock. Also preserves the original trial deadline while a provider mandate is awaiting paid activation.
- `202609290003_invitation_locking.sql`: serializes invitation creation/acceptance with directory mutations and suspension; invalid, expired, changed-email and inactive-directory invitations cannot grant access.

Back up first. The migration does not rewrite historical booking bodies. Existing malformed legacy records should be audited before launch; do not weaken validation to bypass them. The SQL test runner applies **all** migration files in order.

## 2. Bootstrap a platform administrator

Register an ordinary verified user using the public signup flow. Using the Supabase SQL administrator, look up the intended verified user's ID and insert it explicitly:

```sql
insert into public.platform_admins(user_id)
values ('REPLACE_WITH_VERIFIED_AUTH_USER_UUID');
```

There is no public role-selection or admin-registration endpoint. Sign in at `/platform`, enroll a TOTP authenticator, then verify a six-digit code. Keep recovery procedures restricted to trusted operators with Supabase administrative access. Do not insert demo users.

## 3. Razorpay subscriptions

Enable Razorpay Subscriptions for your approved merchant account and configure all three runtime secrets: key ID, key secret, webhook secret. Test and live environments must use separate Supabase projects/keys. Production-node staging with test credentials requires `ALLOW_TEST_BILLING=true`; its UI explicitly labels test billing. Never count test payments as real revenue.

Webhook URL: `https://YOUR_DOMAIN/api/webhooks/razorpay`. Configure subscription lifecycle events including authenticated, activated, charged, pending, halted, resumed, cancelled, completed and updated events supported by your provider account. The endpoint validates HMAC over raw bytes, deduplicates event IDs, and fetches current provider state. Captured collections enter the ledger from signed `subscription.charged` events only. Access is based on verified active periods, not an arbitrary client success flag.

Checkout creates a provider plan from the organization's immutable snapshot and acquires a database creation lease. Checkout signatures bind `payment_id|stored_subscription_id`. A timeout after provider creation leaves checkout `uncertain`; **never blindly reset this state**. In Platform → Organizations → manage organization, enter the existing provider subscription ID. Reconciliation verifies organization/lease notes, INR price, quantity and cadence before linking it. If no provider subscription can be found, escalate for manual investigation; an automatic reset is intentionally unavailable.

Owner cancellation requests end-of-cycle cancellation and preserves earned access. Suspending a tenant only blocks workspace access; it does not cancel billing. Refunds, disputes, provider fees and settlements require provider-side reconciliation. Dashboard MRR is estimated and gross collections are not net revenue.

## 4. Coolify / Docker

Select this repository/branch, Dockerfile build, internal port `3000`. Configure an HTTPS domain, route it to port 3000 and set `/healthz` as health-check path. Set runtime secrets from `.env.example` in Coolify; no secrets belong in Git, Vite build variables, screenshots or chat. `TRUST_PROXY=1` is appropriate only behind exactly one trusted ingress proxy. Ensure direct public access to the container port cannot bypass that proxy.

Required: `APP_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Set Razorpay values together before publishing plans / opening onboarding. Set a strong `RATE_LIMIT_SECRET`. Start with `REGISTRATION_ENABLED=false` until ready (existing users can log in). The Docker image includes the production server and separately guarded demo entry. All durable SaaS data is in Supabase; do not mount a production SQLite volume.

For Compose: copy `.env.example` to ignored `.env`, fill values privately, then `docker compose up --build -d`. Docker was not available in the development sandbox, so image execution still needs verification. Outbound HTTPS to Supabase and Razorpay must be allowed. Production uses frame-ancestor restrictions to prevent clickjacking; operate on the configured domain, not an embedded preview iframe.

**Notification worker (recommended dedicated process):** booking-confirmation jobs are always committed transactionally with the booking, but they are delivered only when a worker is running. Preferred: `docker compose --env-file .env --profile worker up -d worker` (or `npm run worker` on any trusted host) with `MESSAGE_WORKER_ENABLED=true` set **only** for the worker process. Job claims use `SELECT ... FOR UPDATE SKIP LOCKED`, so web and worker processes cannot double-dispatch a job, and `stop()` lets an in-flight provider send finish before exit during deploys. The simpler alternative is `MESSAGE_WORKER_ENABLED=true` on the single web container for small deployments. Either way, confirm exactly one enabled topology; if every process has the worker disabled, queued messages wait in the `held/queued` report instead of sending.

## 5. Publish your plans

In Platform → Subscription plans, edit the draft Starter/Growth/Scale offers and approve prices, hall limits, active-staff quotas, trial days and tax treatment before publishing. These software subscription plans are distinct from the venue's event pricing models and food menus. Publish/unpublish affects new signups; it does not rewrite existing contracts.

The `REGISTRATION_ENABLED=false` gate blocks both public account creation and new organization onboarding; existing invitation acceptance remains available. Set `REGISTRATION_ENABLED=true` when legal pages, support, SMTP and payment tests are complete. New organization onboarding is blocked if Razorpay is not configured. Trials require explicit plan selection but do not create automatic charges. Owners initiate their recurring mandate separately from the organization account screen.

## 6. Mandatory release checks

- Run `npm run build`, `npm run test:saas`, `npm run test:messaging`, `npm run test:saas:http`, and `npm run test:deployment` (the latter is the isolated legacy/demo regression suite, not a real SaaS E2E or Docker test). The current GitHub Actions workflow runs these backend regression groups; optional browser suites and actual Docker execution are separate checks.
- Two real Supabase accounts/organizations: verify signup confirmation, logout, refresh, password recovery, explicit invitations, inactive membership and cross-tenant reads/writes with both API and direct RLS access.
- Admin password-only session must fail platform API/RLS. Verify MFA setup, challenge, expiry, and controlled administrator recovery.
- Razorpay sandbox: first activation, verified checkout, repeated/out-of-order webhooks, failed payment/retry, expired trial, captured ledger, cancellation, suspension and uncertain-create reconciliation. Confirm no duplicate recurring mandate under concurrent attempts.
- Complete a low-value live activation and end-of-cycle cancellation under the provider's permitted testing procedures before declaring live payments working.
- Test booking menus/snapshots, quotes, conflicts, customer-payment floors, printable full/event copies and role restrictions in a real SaaS tenant. These have local SQL and legacy regressions, not yet a live provider integration certification.
- Verify mobile keyboard/focus behavior, email templates/delivery, TLS/cookie settings, CSP with Razorpay/Turnstile, health checks, restart and trusted-proxy rate limiting.
- Schedule independent backups, test restore and verify your Supabase tier's limits, pausing policy and recovery capabilities. A free tier must not be assumed to include a production backup/SLA.
- Monitor failed webhooks, expired trials, uncertain checkouts, auth failures, Supabase quotas and ledger reconciliation. Archive audit/rate data under an agreed retention policy.

## Known scale limits

Workspace reads currently load the tenant's directory and bookings into memory; write validation uses this compatibility snapshot plus atomic SQL invariants. Large-tenant/server-side filtering and pagination need scale testing. Platform overview loads at most 1,000 rows per dataset and explicitly flags truncated metrics. The availability lookup must also be load-tested for large booking datasets. Do not present these windowed figures as audited lifetime totals.

## Safe design preview

`APP_MODE=demo npm run dev` starts disposable sample data. Visit `/platform` for the labelled platform-console design preview or `/pricing` for owner signup design. Administrative mutations, registration and payments are disabled in these previews. For a built demo set `APP_MODE=demo ALLOW_DEMO=true NODE_ENV=production`; never use this mode for real customer records.

## Local regression coverage added during hardening

The local SQL suite covers platform AAL1/AAL2 metadata isolation, denial of platform access to tenant records, service-only RPC permissions, stale-capacity rejection at the database write boundary, positive payments, null/negative totals, SQL/JavaScript booking-window parity, expired/inactive/changed-email invitations, original trial preservation, stale provider observations and repeated payment IDs. These are deterministic local checks, not proof of live Supabase or Razorpay behavior and not a multi-process load test.

Optional browser checks require `playwright-core` and `@sparticuz/chromium` installed locally (`npm install --no-save --package-lock=false playwright-core @sparticuz/chromium`) and a demo server. Run `UI_TEST_URL=http://localhost:3001 npm run test:saas:ui`. Chromium shared-library requirements depend on the host OS. Browser dependencies are not shipped in the runtime image.

The repository includes `.github/workflows/ci.yml` to run these local checks on pushes and pull requests with Node 22 and read-only repository permissions. No live service credentials are used by CI. A passing CI run is a regression gate, not a live deployment certification.

## Public website and CMS

The public home now lives at `/`, with English/Hindi pages, journal and a platform-owner CMS at `/platform#cms`. The old demo workspace is at `/workspace`. Apply follow-up migration `202609290004_website_cms.sql` and read [the website/CMS guide](WEBSITE-CMS.md). Review and publish real legal policies before opening contact enquiries. The CMS has separate draft/public snapshots and MFA-restricted access; the demo editor uses this browser's localStorage only, not production storage.

## Settings and messaging update

Apply `202609290005_messaging.sql` after migrations 001–004. Configure runtime-only `INTEGRATION_ENCRYPTION_KEY`, keep `MESSAGE_WORKER_ENABLED=false` until providers/templates/consent/credits are ready, then follow [MESSAGING.md](MESSAGING.md). Changes to saved Razorpay credentials require a restart of all instances.
