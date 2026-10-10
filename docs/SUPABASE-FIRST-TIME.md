# First-time SaaS setup: connect Gatherhall to Supabase

This guide is for the owner of the **Gatherhall SaaS platform**, not a venue owner signing up as a customer. It uses the Supabase and hosting dashboards where possible.

## First understand the connection

```text
Visitor / venue owner / platform admin
               ↓
React website in the browser
               ↓ same-origin /api requests + secure session cookies
Gatherhall Express server (deployed with the Dockerfile)
               ↓
Supabase Auth + PostgreSQL
```

**The frontend connection is already implemented.** You do not need to add a Supabase SDK to React, enter database keys in the website CMS, or change the booking forms. Configure the server, apply the database migrations, and switch the deployment to SaaS mode.

- `APP_MODE=demo`: sample venue data uses SQLite; CMS preview edits use browser localStorage. Neither is production Supabase data.
- `APP_MODE=saas`: accounts, organizations, records, subscriptions and CMS content use your configured Supabase project.
- The service-role/secret key stays on the server. Never put it in `src/`, `public/`, a `VITE_*` variable, a screenshot, chat, or GitHub.
- This is **not a frontend-only/static-hosting deployment**. Deploy the Express backend and React build together using the existing Dockerfile. A static Vite upload alone will not provide `/api`, secure authentication or Razorpay verification.

### Before starting

You need:

1. Access to your GitHub repository and hosting dashboard, such as Coolify.
2. A Supabase account.
3. An HTTPS application domain, for example `https://venues.yourdomain.com`.
4. An email delivery provider supporting SMTP for customer signup, invitations and recovery.
5. Razorpay Subscriptions credentials later, before testing venue-owner onboarding or opening paid plans.

Use separate Supabase projects for test/staging and real customers. Test billing must never share a real-customer database.

---

## Step 1 — Create a fresh Supabase project

1. Visit <https://supabase.com/dashboard> and sign in.
2. Choose **New project** and the Supabase organization that should own it.
3. Give it a clear name, such as `gatherhall-staging`.
4. Create a strong database password and save it in your password manager. It is **not** the API secret key.
5. Choose a region near your users—for example, Mumbai if offered for your project.
6. Wait for the database to finish provisioning.

**Use a new, dedicated project.** The initial migration changes public-schema permissions broadly. Do not apply it to an unrelated project that already hosts another application.

Free-tier use is a starting point, not a guarantee of backups, uninterrupted availability or capacity for your production workload. Review your project's current limits and recovery options before launch.

## Step 2 — Find your project URL and API keys

In the project's **Connect** dialog or **Settings → API Keys / Data API**, find:

| Supabase value | Gatherhall server variable | Where it belongs |
|---|---|---|
| Project URL, such as `https://YOUR_PROJECT.supabase.co` | `SUPABASE_URL` | Server environment |
| Publishable key, `sb_publishable_...` | `SUPABASE_ANON_KEY` | Server environment in this architecture |
| Secret key, `sb_secret_...` | `SUPABASE_SERVICE_ROLE_KEY` | **Private server secret only** |

The environment variable names are legacy-compatible, but the current Supabase JavaScript client accepts the newer API key values. If your existing project already uses legacy `anon` and `service_role` keys, those map to the same respective variables while enabled. Prefer Supabase's newer publishable/secret keys for a new project.

Do not paste a Postgres connection string into `SUPABASE_URL`. This app uses Supabase's HTTPS APIs and does not require a `DATABASE_URL` or database password in its runtime environment.

**Do not share these keys in chat.** Enter them directly into your hosting provider's private runtime settings.

## Step 3 — Create the database tables and security rules

The SQL files are in GitHub under `supabase/migrations/`. Open the repository branch `arena/01a0e5a2-weddingjhall`.

For a **brand-new project**, use Supabase **SQL Editor → New query**. Run each complete file below, in this exact order:

1. `202609290001_saas.sql`
2. `202609290002_atomic_validation.sql`
3. `202609290003_invitation_locking.sql`
4. `202609290004_website_cms.sql`

For each file:

1. Open its **Raw** contents in GitHub and copy the complete SQL, not a truncated preview.
2. Create a fresh SQL Editor query.
3. Put `BEGIN;` on the first line, paste the full file, and put `COMMIT;` on the last line.
4. Run the query as the project database administrator.
5. Confirm it succeeded before proceeding to the next file.
6. Keep a private deployment record of the filename and successful application date. Never paste API secrets into SQL.

If a file fails, stop and inspect the error. Do not continue, rerun every file blindly, disable RLS, or delete tables to work around it. The transaction wrapper avoids intentionally applying only part of a migration. If the editor reports an aborted transaction, roll it back before retrying the corrected query.

**Existing installation:** apply only migrations that have not already been applied. These are versioned schema changes, not scripts to run on each restart.

**Migration-tracking note:** manually running SQL in the dashboard does not automatically create Supabase CLI migration-history entries. Do not later run `supabase db push` against this project without first reconciling the applied migration history. Alternatively, use the Supabase CLI migration workflow from the beginning; do not mix both approaches casually.

### Checkpoint

In **Table Editor**, you should see tables including:

- `profiles`, `platform_admins`
- `organizations`, `memberships`
- `saas_plans`, `saas_subscriptions`, `saas_records`
- `record_private`, `saas_invitations`
- `billing_events`, `billing_payments`, `audit_log`
- `cms_entries`, `cms_history`, `cms_enquiries`

You can verify the seed data in SQL Editor:

```sql
select name, published, max_halls, max_staff
from public.saas_plans;

select kind, slug, locale, published is not null as is_published
from public.cms_entries
order by kind, slug, locale;
```

The subscription plans initially remain **draft/unpublished**. Legal policy templates also remain unpublished until you review them. This is intentional.

## Step 4 — Configure authentication URLs

In Supabase **Authentication → URL Configuration**:

1. Set **Site URL** to your application's exact HTTPS origin:
   `https://venues.yourdomain.com`
2. Add these permitted redirect URLs for the current application's flows:
   - `https://venues.yourdomain.com`
   - `https://venues.yourdomain.com/`
   - `https://venues.yourdomain.com/?reset=1`
3. Use the same hostname in the app, Supabase configuration and links—do not mix `www` and non-`www` domains.

For local development, add the equivalent localhost URLs only to your **development/staging project**. Do not use broad wildcard redirect rules to work around a configuration mistake.

In **Authentication → Sign In / Providers** (dashboard labels can vary):

- Enable email/password authentication and new-user signup for the controlled bootstrap/testing stage.
- Keep email confirmation enabled.
- Ensure authenticator/TOTP MFA is available for platform administrators.
- Use at least 12 characters for new passwords in this app; stronger Supabase password policies may also apply.

The app's `REGISTRATION_ENABLED` switch is an additional app-level control. Supabase's own signup/provider settings must also permit the flow you are testing.

## Step 5 — Configure email delivery and templates

In Supabase **Authentication → Email / SMTP Settings**:

1. Enable custom SMTP.
2. Enter your email provider's SMTP host, port, username and password privately.
3. Configure your sender name and address, for example `Gatherhall` and `no-reply@yourdomain.com`.
4. Complete the provider's domain-verification requirements, including appropriate SPF/DKIM/DMARC records.
5. Test delivery before inviting customers.

Supabase's default email service is restricted and is not intended for production customer delivery. Without custom SMTP, emails may be limited to authorized project-team addresses. Do not respond to delivery failures by disabling email confirmation.

For email templates, replace `venues.yourdomain.com` below with your real domain. Use the appropriate link in each template:

**Confirm signup:**

```html
<a href="https://venues.yourdomain.com/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Confirm your email</a>
```

**Reset password:**

```html
<a href="https://venues.yourdomain.com/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset your password</a>
```

**Invite user:**

```html
<a href="https://venues.yourdomain.com/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Verify your invitation</a>
```

Copy the `{{ .TokenHash }}` template expression exactly. These links point to the **app's** `/auth/confirm` endpoint, not a manually invented Supabase route. Invite verification leads to password setup; joining the organization still requires explicit acceptance inside the app.

The default implicit-token templates also have a fallback in this app, but the token-hash templates above make the intended server-cookie flow clearer. Test a fresh link after changing a template.

## Step 6 — Configure and deploy the app in Coolify

Choose a GitHub/Dockerfile application deployment:

- Repository: `mypresonaldrive/Weddingjhall`
- Branch: `arena/01a0e5a2-weddingjhall`
- Dockerfile: `/Dockerfile`
- Internal application port: `3000`
- Domain: your exact HTTPS application domain
- Health-check path: `/healthz`

Add these as **runtime environment variables**, not frontend/Vite build variables:

```dotenv
APP_MODE=saas
NODE_ENV=production
PORT=3000
APP_URL=https://venues.yourdomain.com
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=sb_publishable_REPLACE_PRIVATELY
SUPABASE_SERVICE_ROLE_KEY=sb_secret_REPLACE_PRIVATELY
REGISTRATION_ENABLED=false
SUPPORT_EMAIL=support@yourdomain.com
RATE_LIMIT_SECRET=REPLACE_WITH_A_RANDOM_SECRET
TRUST_PROXY=1
ALLOW_TEST_BILLING=false
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

- Replace the Supabase placeholders privately with the values from Step 2.
- Set `TRUST_PROXY=1` **only if exactly one trusted reverse proxy sits in front of Express**. Otherwise use the correct value for your deployment; do not blindly trust arbitrary forwarded headers.
- Generate a random rate-limit secret in your own terminal or password manager. For example:
  `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`
- Leave **all three** Razorpay variables empty for the initial database/auth/CMS setup, rather than filling them with fake placeholder values. Paid-plan publication and new organization onboarding will remain blocked until billing is configured.
- Do not set `ALLOW_DEMO=true` for your real SaaS deployment.
- Save and redeploy after changing environment variables. Editing `.env.example` does not configure a running server.

The Dockerfile builds React and runs Express. Coolify should route the domain to this service, so browser requests such as `/api/config` and `/api/auth/login` reach the same host. No frontend Supabase key form is required.

### Checkpoint: open these URLs directly in your browser

`https://venues.yourdomain.com/healthz` should return:

```json
{"status":"ok","mode":"saas"}
```

`https://venues.yourdomain.com/api/config` should include:

```json
{"mode":"saas","billingEnabled":false}
```

Additional non-secret fields are normal. `billingEnabled:false` is expected before Step 9.

Visit `/` and `/hi`. They should now read published website content from Supabase rather than browser-local demo content.

**A successful `/api/config` alone does not prove database connectivity.** `/healthz` queries the required database tables; check both. Open production on its configured domain, not embedded inside an iframe—the production server intentionally restricts framing.

## Step 7 — Create your SaaS-owner account

Being the owner of the Supabase project does **not** automatically make you a Gatherhall platform administrator. Also, a venue organization's `owner` role is different from the SaaS platform administrator role.

For your initial admin bootstrap:

1. Temporarily set `REGISTRATION_ENABLED=true` in Coolify and redeploy.
2. Visit `https://venues.yourdomain.com/login`.
3. Choose **New here? Create an account**, enter your name, business email and a strong password.
4. Verify your email using the signup email.
5. **Do not create a venue organization for this platform-admin account.** The next step gives it the separate platform role. If you see the organization onboarding screen, stop there.
6. Set `REGISTRATION_ENABLED=false` again and redeploy while you finish setup. Existing verified users can still sign in.
7. In Supabase **Authentication → Users**, find your verified user and copy its user UUID, not an API key.

In Supabase SQL Editor, first confirm the intended identity:

```sql
select id, email, email_confirmed_at
from auth.users
where id = 'REPLACE_WITH_YOUR_VERIFIED_USER_UUID';
```

Check that the email is yours and `email_confirmed_at` is not null. Then run:

```sql
insert into public.platform_admins(user_id)
select id
from auth.users
where id = 'REPLACE_WITH_YOUR_VERIFIED_USER_UUID'
  and email_confirmed_at is not null
on conflict (user_id) do nothing;
```

Verify the resulting administrator:

```sql
select p.user_id, u.email
from public.platform_admins p
join auth.users u on u.id = p.user_id;
```

Never elevate customer accounts or use the public sample/demo users for this step. There is deliberately no public “make me an admin” button.

## Step 8 — Sign in as platform owner and set up MFA

1. Visit `/platform` on your configured domain and sign in with your verified account.
2. You should see **One more security check**.
3. Choose **Set up authenticator**.
4. Add the displayed setup key to your authenticator app as a time-based/TOTP account. Keep the key private; do not send it in chat.
5. Enter the current six-digit code.
6. The platform dashboard should open after successful verification.

Then open `/platform#cms` or select **Website CMS**:

- Edit English and Hindi content independently.
- Save a draft; the public website should not change yet.
- Publish and verify the change at `/` or `/hi`, including in a private/incognito browser window. Seeing the same published content in another browser confirms it is not merely your browser's demo localStorage.
- Review and publish your actual privacy, terms and refund policies before public launch.
- The contact form requires a published privacy policy in the visitor's language; enquiries appear in the private CMS inbox. The contact form does not automatically send email notifications.

Platform administration requires MFA. Keep a controlled recovery procedure through trusted Supabase operators; do not disable MFA to bypass an access problem.

## Step 9 — Add Razorpay before onboarding venue owners

Supabase is the database/authentication provider; it does not activate Razorpay billing for you.

Use your **staging deployment and staging Supabase project** for initial payment tests:

1. Enable Subscriptions for your Razorpay account.
2. Set a matching **test** key ID and secret in the server environment.
3. Configure a signed webhook at:
   `https://YOUR_STAGING_DOMAIN/api/webhooks/razorpay`
4. Configure the subscription lifecycle events described in [COOLIFY.md](COOLIFY.md), including charged, activated and failure/cancellation events.
5. Set the same webhook secret in `RAZORPAY_WEBHOOK_SECRET`.
6. Set `ALLOW_TEST_BILLING=true` for this staging deployment and redeploy.
7. In the platform dashboard, review draft subscription prices, hall/team limits and trial periods, then publish a plan.

These settings must be configured **together**:

```dotenv
RAZORPAY_KEY_ID=rzp_test_REPLACE_PRIVATELY
RAZORPAY_KEY_SECRET=REPLACE_PRIVATELY
RAZORPAY_WEBHOOK_SECRET=REPLACE_PRIVATELY
ALLOW_TEST_BILLING=true
```

The app labels test billing; test payments are not real revenue. Use separate live credentials and `ALLOW_TEST_BILLING=false` for the eventual real-customer environment. Do not simply switch test customers and their existing mandates to live keys in the same database.

You can validate the website, CMS and platform-admin login **without Razorpay**. You cannot complete this app's normal venue-owner organization onboarding or publish a paid plan before billing is configured.

## Step 10 — Test your first venue-owner customer

Use a **different email** from the platform administrator:

1. On the staging app, set `REGISTRATION_ENABLED=true` and redeploy.
2. Open a private/incognito browser window.
3. Visit `/login`, register a venue-owner account and verify its email.
4. Choose a published plan and monthly/yearly interval.
5. Enter the organization details and create the organization.
6. Open its workspace. Add a hall, a client and a pricing model/menu before creating a packaged booking.
7. Verify that the selected hall/team limits are enforced.
8. Test advance-payment recording, duration conflicts, saved pricing/menu snapshots, print confirmations and explicit staff/client invitations.
9. From the organization account screen, test Razorpay mandate creation and verified activation in test mode.

In Supabase, check that the test account has:

- A `profiles` row from the Auth trigger.
- An `organizations` row and a linked `memberships` row.
- A `saas_subscriptions` snapshot with its plan and limits.
- Tenant-tagged `saas_records` for the hall, client and booking.

Create a second independent customer organization and verify that it cannot read or edit the first organization's records. Do not treat “it works in the admin dashboard” as proof of tenant isolation.

## Step 11 — Launch only after the checklist passes

Complete the release checks in [COOLIFY.md](COOLIFY.md): live email delivery, two-tenant isolation, MFA, password recovery, webhooks, renewals/failures, cancellation, uncertain-checkout reconciliation, backups/restore, legal policies and monitoring.

Run the local checks as well:

```sh
npm ci
npm run test:saas
npm run test:saas:http
npm run test:deployment
```

These are local regression checks. They do not prove your specific Supabase, SMTP, Razorpay or Docker deployment works. No external project was connected or migrated on your behalf just by pushing this guide.

---

## Optional: run against Supabase on your own computer first

Requires Node.js 22.13+ and a staging Supabase project with all migrations applied.

1. Copy `.env.example` to `.env`.
2. Fill the Supabase values privately.
3. Set `APP_MODE=saas`, `NODE_ENV=development`, `APP_URL=http://localhost:3000`, `PORT=3000`, `TRUST_PROXY=0`.
4. Add the localhost Auth URLs to the staging Supabase project's redirect configuration. Use email templates pointing at your local application for this test, and open them on the same computer running the server.
5. Run:

```sh
npm ci
node --env-file=.env server.js
```

The `--env-file` flag matters: `node server.js` / `npm run dev` does **not** automatically read a local `.env` for Express. Vite's frontend env handling is not the same thing as server environment loading. The production Docker/Compose/Coolify environment injection is separate.

Use `localhost` consistently; do not open the local app as `127.0.0.1` while `APP_URL` uses `localhost`, because origin checks intentionally distinguish them. Another person's browser cannot reach the server on your computer by using their own `localhost`.

## Common first-time problems

| What you see | What to check |
|---|---|
| Sample organizations or “Design preview” | `APP_MODE` is still `demo`, or you opened the old preview URL instead of your SaaS domain. Set SaaS mode and redeploy. |
| `SUPABASE_URL is required` / missing key error | Set runtime environment variables; for a local `.env`, use `node --env-file=.env server.js`. |
| Invalid API key | Use URL and API keys from the **same** project. Do not use the database password or a connection string. |
| `/api/config` works, `/healthz` fails | Check project availability, API key permissions and all four migrations. CMS tables are required too. |
| Missing table / permission denied | Check migration order and application history. Do not disable RLS or grant browser writes as a shortcut. |
| `Email address not authorized`, rate-limit or missing confirmation email | Configure custom SMTP, verify the sending domain and inspect Supabase Auth/email-provider logs. Default email delivery is restricted. |
| Email link goes to the wrong website | Match Site URL, redirect allowlist, template links and `APP_URL`; request a fresh link. |
| “Registration is currently closed” | Intentionally controlled by `REGISTRATION_ENABLED`; enable temporarily for bootstrap/testing, save and redeploy. Also check Supabase signup settings. |
| “Registration opens after billing is configured” | Account authentication may work, but organization onboarding requires the Razorpay setup in Step 9. |
| Platform login shows organization onboarding | Your verified Auth UUID is not yet in `platform_admins`. Insert the intended account, then reload `/platform`. |
| MFA prompt repeats / invalid code | Check the authenticator's setup key and automatic clock synchronization. Use a fresh code. Do not change roles to bypass MFA. |
| “Untrusted request origin” / security check failed | Match the exact HTTPS hostname in `APP_URL`, reload to get a fresh CSRF cookie, and check reverse-proxy configuration. |
| App cannot be embedded in preview iframe | Open its configured HTTPS domain directly; production blocks framing intentionally. |
| CMS edits appear only in one browser | You are using the demo CMS/localStorage. A real SaaS CMS uses Supabase and should publish across browsers. |
| Public legal page is unavailable / contact form disabled | Review and publish that language's policy in the CMS; policies are seeded as drafts. |
| Billing startup rejects test keys | For staging with `NODE_ENV=production`, set `ALLOW_TEST_BILLING=true`; never present test collections as real money. |

## Official references

- Supabase API keys: <https://supabase.com/docs/guides/getting-started/api-keys>
- Email/SMTP setup: <https://supabase.com/docs/guides/auth/auth-smtp>
- Redirect URL configuration: <https://supabase.com/docs/guides/auth/redirect-urls>
- Row Level Security: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- CLI migration management: <https://supabase.com/docs/guides/deployment/database-migrations>

Supabase dashboard labels and key-management UI can change. Follow the current official pages if a menu has moved; never weaken the authorization design to make an old tutorial work.

## New Settings and messaging features

After the four migrations above, apply `202609290005_messaging.sql` once. This is required by the current app health check. Follow [the simple messaging setup steps](MESSAGING.md#simple-setup) to enable encrypted provider settings and channel credits. Keep the worker disabled until a controlled live-provider test passes.
