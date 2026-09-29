# Settings, messages and channel credits

## Simple setup

1. In Supabase SQL Editor, run **`supabase/migrations/202609290005_messaging.sql`** once, after migrations 001–004. Back up an existing project first. Do not rerun older migrations blindly.
2. Generate an encryption key privately on your own terminal:
   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```
3. In Coolify, add the result as **`INTEGRATION_ENCRYPTION_KEY`**. Runtime **on**, buildtime **off**. Keep a secure backup outside Git/chat. All instances must use the same key.
4. Initially set **`MESSAGE_WORKER_ENABLED=false`**. Redeploy. `/healthz` must return `{"status":"ok","mode":"saas"}`; it now also checks the integration/outbox tables exist.
5. Sign in as the MFA-verified SaaS administrator. Open **Settings** (`/platform#settings`). Enter and save the provider details below. No secrets belong in frontend variables. SMS/WhatsApp require an explicit template-approval confirmation before enabling; changing the flow/template/language clears that confirmation. This is an operator attestation, not a live provider approval lookup.
6. Open **Messages & credits** (`/platform#messages`). Create recharge packs, define plan allowances, or allocate a small test balance to an organization. Nothing is pre-priced or automatically funded.
7. In that venue owner's workspace, open **Messages & credits → Notifications & consent**. Enable selected channels and recipients. Record real customer permission. Phone numbers must use international format, e.g. `+91…`.
8. When ready for a controlled end-to-end test, set **`MESSAGE_WORKER_ENABLED=true`** and restart. Confirm a test booking and check the message report **and the provider dashboard**. This can incur provider charges. Do not turn on broad sending before this test.

The demo preview never saves provider secrets, sends messages, sells packs or allocates real credits.

## Providers

### Razorpay

- Enter Key ID, Key secret and Webhook secret together. Blank secret fields retain the existing secret; they never reveal it.
- **Restart every app instance after changing Razorpay settings.** Runtime uses a consistent credential set for checkout and webhook verification. Until restart, the running process continues using its startup configuration.
- Saved Razorpay settings override the original `RAZORPAY_*` runtime variables on startup. With no saved row, existing environment credentials keep working. A saved disabled row disables billing on restart; this does not cancel existing provider mandates.
- Keep the same Razorpay account for existing subscriptions. Changing accounts can break existing mandates and recharge reconciliation. Rotate credentials within the same account carefully and coordinate webhook-secret changes with deployment.
- Subscription webhook: `https://YOUR-DOMAIN/api/webhooks/razorpay` (existing subscription events).
- **Add a second webhook:** `https://YOUR-DOMAIN/api/webhooks/credits`, subscribe to **`payment.captured`**, using the same saved webhook secret. Raw-body signatures are verified.
- Recharge credit is added only after server-side verification of a captured INR payment matching the stored order and amount. Browser-supplied amounts/signatures alone cannot credit balances.
- Test keys require `ALLOW_TEST_BILLING=true` in a production Node staging deployment. Test mode is not a live payment certification.
- Other payment gateways are not exposed as fake working options. This version implements Razorpay only; other gateways need their own verified order, mandate and webhook adapters.

### SMTP email

- Supply a public SMTP hostname, port **465** (TLS) or **587** (required STARTTLS), username/password and verified sender email.
- Verify your sending domain/SPF/DKIM/DMARC with your email provider. Ensure your hosting provider allows outbound SMTP.
- Private/local network addresses are blocked. The SMTP connection uses a resolved public IPv4 address with TLS hostname verification.
- These settings control **booking notifications only**. Supabase signup verification, recovery and invitations still use **Supabase Authentication → SMTP**.
- A successful SMTP acceptance does not prove inbox delivery. Review bounces in the provider dashboard.

### MSG91 SMS

- Supply your MSG91 auth key and an approved **Flow ID**.
- Your DLT-compliant flow must use these exact recipient variables: **`event`, `date`, `time`, `venue`, `organization`**. Values are capped at 30 characters each; choose appropriate static template wording.
- Example template structure to submit for approval (approval is not guaranteed): “Your {{event}} booking is confirmed for {{date}} at {{time}}. Venue: {{venue}}. From {{organization}}.”
- Configure the required DLT entity, sender and template mappings within MSG91. Do not enable an unapproved flow or use it for promotional bulk messages.
- Provider billing may depend on segments/encoding. This application sells **one flat credit per accepted API message**, not per SMS segment; set pack prices to cover your costs.

### Meta WhatsApp Cloud API

- Supply a suitable access token, Phone Number ID, approved **utility template** name, and matching language code (for example `en` or `en_US`).
- The template must have **one text body parameter**, populated with event-only booking details. Example structure for approval: “Your booking details: {{1}}. Please contact the venue if you need assistance.” Avoid headers/buttons requiring extra parameters; this adapter does not populate them.
- Template approval, business verification, sender registration and token permissions are handled in Meta. Requests use Graph API v23.0; plan a version upgrade before its retirement.
- Record WhatsApp-specific opt-in before sending to a customer. There is no automatic processing of inbound STOP/opt-out messages in this version: process requests promptly and revoke consent in the consent register before any new dispatch.

## What is sent

Only the **first confirmation** of a booking per enabled channel and recipient is queued automatically. The outbox is written in the same database transaction as the booking. Ordinary edits, cancellation and reconfirmation do not create duplicate confirmation messages.

- Channels, owner alerts and customer alerts are off by default.
- Owner alerts use the organization's billing email/phone and require explicit owner enablement.
- Customer permission is recorded separately for each channel and **bound to the current contact address**. A changed contact needs fresh consent. Store the source/date of genuine permission, not merely “customer booked.” Consent changes are audited.
- Dispatch rechecks organization access, current booking status, current preferences, customer status/contact/consent, provider enabled status and balance. Opt-out after provider acceptance cannot recall a message already sent.
- Messages contain event name/date/time/hall/organization only. They never include financial totals, private operations notes or family contact details.
- Jobs created while notifications were enabled but later blocked become **held**. After fixing the issue, explicitly choose **Retry checks**. This rechecks permission rather than bypassing it.
- Enabling notifications later does not send historical confirmations automatically.

## Credit rules

There are independent **Email**, **SMS** and **WhatsApp** balances. Credits are service entitlements, not transferable money, withdrawable funds or provider-account balances.

1. Reserve one credit atomically before a provider request; concurrent workers cannot overspend the same grant.
2. Charge that reservation on provider acceptance. A later delivery failure is not automatically refunded because providers may still charge.
3. Release on definite provider rejection. Released credits keep their original expiry; an expired grant is not resurrected.
4. Retain reservations for timeouts, network uncertainty or interrupted sends. Never automatically retry these calls.
5. A platform administrator may use **Reconcile** on an uncertain message after checking the provider logs. Record evidence; confirm accepted (charge) or definitely not accepted (release). No automatic resend follows reconciliation.

“**Sent**” in reports means **accepted by provider**, not delivered/read. Delivery receipts, bounce processing and provider-cost reconciliation are not implemented. Queued, processing, held, failed and uncertain states are shown separately. Aggregate totals cover all history; tables explicitly show the latest 100 jobs/ledger events/grants and latest 30 recharge orders. Organization/client selectors are capped at 1,000 rows; pagination for larger installations is a future enhancement.

## Plans, individual rules, referral allocations

- Create a rule per **subscription plan + channel** or **organization + channel**.
- An organization rule overrides the plan rule for that channel; zero explicitly suppresses the allowance.
- Each rule supports **expire at paid-period end** or **carry forward**.
- Grants occur on verified captured subscription payment, at most once for the current paid-through period. There are no free-trial grants by default. Annual subscriptions get the configured allowance once per annual paid period (not monthly).
- Rules are an explicit messaging benefit policy: changes affect future paid periods, not existing grants or subscription money/hall-limit snapshots. There is no retroactive allocation. Tell customers about benefit changes before editing policies.
- One-time admin allocations can have an expiry or no expiry, with a required reason such as referral promotion/support credit. Allocation request IDs prevent duplicate grants from retries.
- Referral credits here are **manual promotional allocations**, not an automated referral tracking/reward program.
- Purchased pack credits never expire. Recharge orders snapshot the pack/price; later edits cannot change an existing order's charge or credits.
- Recharge grants are deduplicated. Closed checkout windows can use **Refresh payment**; the signed webhook also reconciles captures. If order creation is uncertain, administrators must link the matching Razorpay order by its receipt in **Reconcile order**; never ask the customer to pay again without checking.
- Refunds/chargebacks do **not** automatically claw back messaging credits. Before offering refunds, reconcile provider payments and remaining/consumed credits manually under a reviewed operational policy. Automated refund reversal, invoices and GST accounting are not included.

## Security & operations

- Provider settings use AES-256-GCM with provider-specific authenticated context. Database/browser roles cannot read or write the new tables or call privileged wallet RPCs. The API masks saved secrets, requires platform MFA and CSRF for changes, and scopes owner reports/mutations to the authenticated organization.
- Never lose/change the encryption key casually: existing ciphertext becomes unreadable. There is no automated key-rotation/re-encryption UI. Back up the key separately from database backups and coordinate a controlled re-encryption migration if needed.
- No real provider credentials are stored in demo/localStorage or emitted by application logs. Never paste Coolify secret-bearing build logs into chat. Keep all secrets runtime-only, revoke previously exposed keys and clear secret-bearing retained logs where possible.
- The worker runs in the full Express process every 5 seconds (up to 10 jobs per tick). Database claims use row locks/skip-locked; interrupted processing becomes uncertain after 5 minutes, not queued again. Use an always-on deployment; sleeping services delay dispatch.
- The worker must have the encryption key and the same database as the app. For larger throughput, split dispatch into a dedicated worker with metrics and per-provider throughput policies rather than adding uncontrolled retries.
- Settings save does not claim a provider connection is verified. Test the actual supported flows before live use. No live Supabase/SMTP/MSG91/Meta/Razorpay certification was performed by the local test suite.

## Local tests

```sh
npm run test:messaging     # SQL, wallet/consent/provider mocks, encrypted settings and route gates
npm run test:saas
npm run test:saas:http
npm run test:deployment
```

Optional browser tests (same optional Playwright/Chromium dependencies as other UI suites): `npm run test:messaging:ui`. Covers platform settings, credit controls, responsive screens, owner consent navigation, dark mode and safe disabled demo actions.
