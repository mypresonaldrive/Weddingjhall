# Notification centre, branding & push

## What teams get
- **Topbar bell (workspace):** the last 25 broadcasts + automatic reminders for your organization, newest first. The badge shows unread count (tracked per browser via a last-seen timestamp).
- **Popup broadcasts**: a `popup`-media notification opens once per browser with a "Got it" acknowledgement.
- **Push media**: broadcasts/reminders labelled `push` are delivered in-app today; real browser/device delivery begins after the platform saves FCM credentials **and** the web app registers browser tokens (Firebase client SDK — future step).

## Automatic reminders (idempotent)
`notifications_generate_reminders()` runs when a workspace opens its notification feed (rate-limited) and is safe to schedule (cron / scheduler) server-side:
- **subscription.expiring** — on day −7/−2 before the trial or paid period ends, once per ISO week.
- **booking.tomorrow** — evening before an event date, once per booking.
- **payment.due** — a booking with balance due, once per booking/day.
Each uses the matching enabled row in `notification_templates` (variables rendered `{{like this}}`) or a safe built-in fallback when the template is disabled. Dedupe keys make generation idempotent; re-runs create nothing twice.

## SaaS admin
- **Platform → Notifications**: broadcasts with category (announcement/maintenance/billing/event/system), audience (all organizations / trial organizations), media (banner/popup/push), plus Save draft, Schedule (future IST time), Send now, Edit (drafts/scheduled), Cancel. Dispatch fans out atomically; a re-dispatch is rejected with `CONFLICT`; every row is stamped `broadcast:<id>` so two sends never duplicate.
- **Reminder templates tab**: edit title/body/variables/channel, enable/disable. Updates take effect from the next generation.
- **SaaS Settings → SaaS branding**: product title, logo text/image, tagline, description, support email, footer note. Public-login safe values are exposed via `/api/config.branding` (15 s server cache). Saves are compare-and-swop; a second tab saving over you returns *"settings changed elsewhere…"*.
- **SaaS Settings → Push (FCM)**: Firebase project ID, sender ID, server credential (secret), optional VAPID key. Validated like other integrations; device delivery requires the token-registration step above.

## Data & security
- Migration `202609300002_notifications.sql`: `platform_settings` (KV + revision), `notification_templates`, `platform_notifications`, `tenant_notifications`; RLS: feed rows visible to members of that organization only; all writes go through security-definer RPCs granted exclusively to `service_role`.
- Membership is checked on every read (`notifications_list`), audiences are `all | trial` (organizations are the delivery unit; auth notifications are never "owners only").
- Broadcasts cannot be edited after send; scheduled items must be in the future.

## Regression
`npm run test:saas` includes `tests/notifications-sql.mjs` (FCM kind, branding CAS, template guards, idempotent fan-out + dedupe, schedule rules, reminder dedupe, feed scoping, service-role enforcement).
