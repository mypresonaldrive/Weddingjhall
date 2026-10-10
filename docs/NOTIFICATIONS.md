# Notification centre, branding & push

## What teams get
- **Topbar bell (workspace):** the last 25 broadcasts + automatic reminders for your organization, newest first. The unread badge and the read dimming are **server-side per user**, so state syncs across devices.
- **Popup broadcasts** open once per member globally (server-side acknowledgement), not per browser.
- **Browser push (Web Push):** on Settings → Notifications → “Enable push alerts”, the workspace registers the built-in service worker, subscribes with the platform’s VAPID key and stores the subscription. Broadcasts/reminders with `push` media are delivered even when the tab is closed. Works without any client SDK or Firebase app config.
- **Email media:** broadcasts with `email` media are sent by the platform worker from the platform SMTP integration to the organization’s billing email (replies not monitored).

## Automation (worker)
Set `NOTIFICATION_WORKER_ENABLED=true`. Every 20 seconds the worker, safely and idempotently:
1. **Auto-dispatches** scheduled broadcasts whose time has come (atomically reuses the dispatch RPC).
2. **Generates reminders** for every active organization every 15 minutes (throttled; dedupe keys mean re-runs create nothing twice) — subscription expiring, payment due, celebration tomorrow. Reminders also generate per-tenant when a workspace opens the bell even if the worker is off.
3. **Claims & sends outbound deliveries**: Web Push via `web-push` to active subscriptions (invalid endpoints auto-deactivated), email via the platform `email` integration. Claims expire after 10 minutes so a crashed worker never hoards rows.
4. Sweeps tenant deliveries expired 30+ days ago.

## SaaS admin
- **Platform → Notifications**: categories (announcement/maintenance/billing/event/system), audience (all / trial organizations), media (**banner / popup / push / email**), draft / schedule (local time, saved to server clock) / send now / edit / cancel. Dispatch is atomic; re-dispatch is rejected; every fan-out stamps `broadcast:<id>` so duplicates are impossible. Preview mode clearly labels that nothing is dispatched.
- **Reminder templates tab**: edit title/body/variables/channel, enable/disable (disabled template → safe built-in fallback copy).
- **SaaS Settings → SaaS branding**: title, monogram, tagline, description, support email, footer note, and a **logo upload** (PNG/JPG/SVG/WebP ≤ 2 MB via signed URL into the public `branding` storage bucket) or any HTTPS URL. Public-safe values are cached 15 s on the server and exposed via `/api/config.branding`. CAS saves reject stale edits.
- **SaaS Settings → Push (Web Push)**: VAPID subject (mailto:), public + private keys (`npx web-push generate-vapid-keys`). Encrypted like other integrations; private key never leaves the server.

## Data & security
- Migrations `202609300002` (centre) and `202609300003` (email media, reads, tokens, outbound claiming, storage bucket): RLS on all tables; every privileged action is a `service_role`-only RPC with membership checks for member calls (`notifications_list`, `notifications_mark`, `fcm_token_register/unregister`).
- `notifications_list` returns `isRead`/`acked` for the caller; `notifications_mark` batches up to 100 ids and is scoping-validated.
- Broadcasts cannot be edited after send; schedules must be in the future.

## Performance notes
- Bounded helper queries: availability checks only load halls + bookings within ±(31d..380d) of the requested date instead of the full tenant dataset.
- Platform overview shows **lifetime totals computed in SQL** alongside the sampled 1,000-row tables (accurate beyond the window).

## Regression
`npm run test:saas` includes `tests/notifications-sql.mjs` covering branding CAS, template guards, idempotent fan-out (banner/email/push), schedule rules, per-user read/ack, outbound claim/release, subscription registry and service-role enforcement.
