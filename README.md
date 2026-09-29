# Gatherhall

A marriage-hall management app with separate Supabase-backed SaaS and disposable SQLite demo modes. Includes organization subscriptions with hall limits, a platform administration dashboard, and Razorpay integration. Live Supabase/SMTP/payment acceptance testing is still required before customer launch.

## First-time Supabase setup

Start with the [step-by-step Supabase SaaS setup guide](docs/SUPABASE-FIRST-TIME.md). It covers the dashboard, migrations, private server environment settings, email verification, your first platform-admin account, MFA, CMS publication and the first venue-owner subscription. The existing frontend calls Express; do **not** put a Supabase secret/service-role key in React or `VITE_*` variables.

## Run

Requires Node.js 22.13+ (uses built-in `node:sqlite`).

```sh
npm install
npm run dev
```

Open port **3000**. The server binds to `0.0.0.0` and supports proxied preview hosts. The first visit opens the bilingual public website. Visit `/workspace` for the seeded venue demo or `/platform#cms` for the interactive local CMS preview. Demo data and browser-local CMS edits are not production storage.

```sh
npm run build
# Configure runtime secrets from .env.example via your deployment environment first.
APP_MODE=saas npm start
```

## SaaS platform

- `/platform`: authenticated platform console in SaaS mode; clearly labelled sample-data design preview in demo mode.
- `/pricing`: owner plans and registration; organization-level subscriptions, not per-hall billing.
- Plans, tenant suspension/restoration, audit history, gross collection ledger and estimated MRR.
- Verified-email auth, HttpOnly cookies, CSRF, platform MFA, RLS and atomic business-rule RPCs.
- Razorpay checkout verification, signed lifecycle webhooks and uncertain-checkout reconciliation.
- `npm run test:saas`: local SQL/security/signature tests. `npm run test:deployment`: isolated demo regression suite.
- Seed subscription prices are draft illustrations, not approved live offers.

## Public website & CMS

Indian-inspired lavender/ivory landing page with a 3D architectural illustration, English/Hindi pages, journal, and platform-owner editorial CMS. Save drafts, preview, publish, restore revisions and manage contact enquiries. Legal templates start unpublished. See [the CMS guide](docs/WEBSITE-CMS.md) for routes, migration, security, local-preview behavior and limitations.

## Light periwinkle UI & booking improvements

The light theme uses the supplied periwinkle palette: `#CCCCFF`, `#A3A3CC`, `#5C5C99`, and `#292966`. White surfaces and darker secondary text keep forms readable; muted lavender is used for decorative accents. The sidebar and cards remain white, with lavender selection states and navy text. Amber, green, and red are retained for meaningful status feedback.

- Combine event/client search, venue, payment status, and date-range filters. Sort by upcoming events, earliest/latest date, booking value, or balance due; export the filtered results.
- Check venue availability as the event date changes. Conflict warnings suggest available alternatives and update venue pricing when selected. Guest-capacity feedback appears before submission.
- The availability API is tenant-scoped, never reveals another client's event details, and only allows excluding a booking the requester can already access. The save endpoint rechecks conflicts.
- Record payments directly from booking rows or the booking editor, with the remaining balance prefilled. Partial payments update the booking's paid amount immediately.
- Add a booking from a calendar day with the date prefilled.
- Responsive filter controls, keyboard focus containment in dialogs, screen-reader status announcements, and fixed dialog actions improve mobile and keyboard usability.

## Packages, catering & extra services

- **Packages & add-ons**: tenant-specific catalogs with owner-managed pricing, descriptions and active/inactive status.
- **Four booking models**: venue only, per plate with venue included, venue plus catering, and a fixed package.
- **Four meal types**: vegetarian, Jain/no onion-garlic, non-vegetarian and mixed menu, with minimum guarantees and extra plate counts.
- **What’s included**: add, edit, reorder or remove up to 20 inclusions per service, paste multi-line lists and preview the client-facing checklist. Inclusions are visible in the catalog, booking selector, quotes and estimate downloads, and are preserved with saved agreements.
- **Quantity-based extras**: mandap/stage décor, baraat welcome, DJ, live food counters, guest rooms, power backup, photography and parking support; add custom services as needed.
- **Itemized estimates**: discounts, configurable tax, advance targets and outstanding balances; server-calculated totals and snapshots preserve agreed rates.
- **Event coordination**: tilak, roka, haldi, mehendi, sangeet and other event types; baraat/muhurat timings, family contact details, dietary preferences and private operations notes.
- **Saved estimate downloads** for staff and the owning client. Existing manual bookings remain supported.

See [the package and pricing guide](docs/BOOKING-PACKAGES.md) for billing rules, limitations and examples. Reference rates are editable examples, not guaranteed vendor offers. Add-ons are charge lines, not inventory reservations; estimates are not statutory tax invoices.

## Docker / Coolify

A multi-stage Dockerfile, non-root runtime, configurable port, health check, and local Compose setup are included.

```sh
docker compose up --build -d
```

**Coolify:** choose the Dockerfile build pack, `/Dockerfile`, application port `3000`, and health check `GET /healthz`. See [the full deployment guide](docs/COOLIFY.md).

**Production uses Supabase now.** Set runtime secrets and apply the new-project migration before deployment. Production never falls back to SQLite. See the deployment guide for administrator MFA bootstrap, Razorpay setup, explicit invitation acceptance, backups, known limits and the pre-launch verification checklist.

## Demo accounts

All demo passwords: `Welcome123!`

| Email | Role | Workspace |
| --- | --- | --- |
| owner@gatherhall.demo | Owner | The Grand Estate |
| staff@gatherhall.demo | Staff | The Grand Estate |
| client@gatherhall.demo | Client | The Grand Estate |
| willow@gatherhall.demo | Owner | Willow & Co. Venues |

Use the account menu to switch demo roles, or the workspace selector to explore a second organization. Demo switching signs in to a different seeded account; it does not bypass tenant checks.

## Included

- Password hashing with bcrypt; random server-side sessions in HTTP-only cookies; logout and workspace registration.
- Tenant-scoped queries and ownership checks enforced by the API, not just the UI.
- Owners manage venues, bookings, clients, payments, and the team directory.
- Staff manage bookings, clients, and payments, but cannot change halls or the team directory.
- Clients see only their own bookings, profile contact, and related payments, and can request bookings. The server forces requests to Pending and uses the venue's price.
- CRUD forms with validation, delete confirmations, optimistic deletion with rollback, success/error notifications, empty states, and loading indicators.
- Venue capacity checks, duration-aware booking conflict protection, maintenance checks, and payment overpayment protection.
- Calendar, booking filters/search/pagination, client directory, payment history, CSV exports, business reports, and profile/workspace settings.
- Seeded demo data: two organizations, three halls per organization, six clients, four staff directory entries, 36 bookings, and 36 payments per organization.
- Persistent database: `data/gatherhall.sqlite`, excluded from Git. Initial demo fixtures are generated only when no tenant exists.

The demo's dashboard/calendar date is fixed to September 28, 2026 for a coherent first-load experience. Legacy events remain whole-day reservations. New bookings offer shift, full-day, multiple-day and custom durations; arrival/ceremony times do not extend the selected reservation.

## Tests

With the server running:

```sh
npm test
```

The API integration suite verifies authentication, session revocation, tenant isolation, stable client ownership, role permissions, CRUD, privacy-safe availability checks, double-booking prevention, capacity, and payment balances. Test records are removed on successful completion.

## Deployment considerations

This is a runnable demo, not a connected payment processor. Payments are manually recorded. Owners can create real staff/client sign-in accounts by setting an optional initial password on directory forms. Existing account credentials are not changed by directory edits. Email invitations, password recovery, and online payment processing are not connected to external providers.

Before public production deployment, remove/disable automatic demo sign-in and seeded credentials; add TLS-only cookies, rate limiting, CSRF protection appropriate to the deployment, email verification/recovery, audit logging, backups, and a production email invitation process. Serve behind HTTPS. SQLite suits a single-server deployment; use a managed database and migrations for multi-instance deployments.

## Imagery

Venue images are locally stored for reliable previews. Demo imagery was sourced from [Carats & Cake](https://caratsandcake.com/articles/ceiling-wedding-decor) and [Pinterest venue inspiration](https://pinterest.com/ideas/chandelier-wedding-reception/952332121845). Replace these demonstration photographs with your own licensed venue photography for production.

## Pricing models, menus and printing

Open **Pricing models** to create, edit, deactivate or delete named menu packages. Select a billing method (venue-only, per-plate, venue + per-plate, fixed), set rates, and build food menus by dietary type and course. Existing bookings retain their agreed menu and rates.

Use a booking’s printer action for either a **full financial confirmation** or an **event-only copy without financial fields**. Both support browser printing and Save as PDF. See [the model/menu and printing guide](docs/BOOKING-PACKAGES.md).

Appearance settings offer **Periwinkle, Emerald, Ocean Blue and custom colors**, with Light, Dark and System modes. Choices persist in the current browser; light mode uses near-black body text.

### Readability improvements

Forms use stronger, contrast-tested field boundaries, visible keyboard focus, required/optional labels and larger input text. Mobile forms stack into a single column with 16px input text and larger action targets. Long-form server validation errors are announced and focused automatically. These changes apply across the existing light/dark palettes without changing booking calculations.

Optional visual regression checks: `tests/readability-ui.mjs` uses Playwright Core and Sparticuz Chromium against a running development server (`UI_TEST_URL`, default `http://localhost:3000`). These browser tools are not application dependencies.

### Sidebar navigation

The top-left hamburger toggles the desktop sidebar and remembers that preference in the browser. On mobile it opens a temporary navigation drawer with a close button, backdrop dismissal and Escape support. Keyboard focus stays inside the open drawer and returns to the toggle on close; navigating or resizing back to desktop closes the mobile drawer. Optional browser coverage: `tests/sidebar-ui.mjs` (same setup as readability checks).

## Simplified booking flow

Bookings are organized as **Event & duration → Pricing & catering → Extras → Review**. Expected attendance is entered once; new bookings use guest-linked billing with optional actual served, minimum guarantee and minimum food spend. Per-guest extras can follow attendance automatically. Duration-aware availability, multi-day rental, event-specific rates and saved agreement protection use shared server/UI calculations. See [billing rules and limitations](docs/BOOKING-PACKAGES.md).

`tests/booking-flow.mjs` covers representative Indian venue pricing cases, shift/multi-day conflicts, current payments and print totals. Optional `tests/booking-flow-ui.mjs` verifies the synchronized form on desktop and mobile.

### Guided booking & improved printing

The booking dialog now has four navigable steps with **Back / Continue / Review**, required-field checks before advancing, and final validation before saving. Values remain in the same in-memory draft across steps (not persisted until Save). On phones the dialog uses the available screen height, with reachable navigation and a live-total footer; the review step has direct Edit links. Older manual-price bookings still work.

The financial printout uses an invoice-style booking-statement layout with quantity/rate/amount columns, a clear payments/balance summary, A4 pagination, mobile-friendly preview, and a compact-spacing option. Menu/service supporting details are separate from the billing page when present. It remains a **booking statement, not a statutory GST invoice**. Event-only printing excludes financial fields. Optional browser regression suite: `tests/wizard-print-ui.mjs`.

### Provider settings and messaging credits

SaaS owners can configure Razorpay, SMTP, MSG91 and Meta WhatsApp in **Settings**, and manage channel credits, recharge packs and allowances in **Messages & credits**. Venue owners have their own wallet, consent controls and reports. Apply migration `202609290005_messaging.sql` and follow [the messaging setup guide](docs/MESSAGING.md) before enabling dispatch. Real provider delivery and payments require live verification.

### Compact dashboard and loading improvements

See [Dashboard UI and loading changes](docs/DASHBOARD-UI.md) for the data-first overview, removed introductions, lazy-loaded workspace, chart definitions and measured bundle-size reduction. No additional migration is needed.
