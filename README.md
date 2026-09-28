# Gatherhall

A full-stack, multi-tenant marriage hall management application with a responsive React dashboard, Express API, and persistent SQLite storage.

## Run

Requires Node.js 22.13+ (uses built-in `node:sqlite`).

```sh
npm install
npm run dev
```

Open port **3000**. The server binds to `0.0.0.0` and supports proxied preview hosts. The first visit opens the seeded owner demo; signing out opens the authentication screen. New workspace registration creates a separate, empty organization.

```sh
npm run build
npm start
```

## Light lavender UI & booking improvements

The light theme uses the supplied Lavender Lilt palette: `#D3D3FF`, `#9999CC`, `#575799`, and `#090933`. The sidebar and cards remain white, with lavender selection states and navy text. Amber, green, and red are retained for meaningful status feedback.

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

**Temporary database only:** no SQLite volume is configured, as Supabase migration is planned. Recreating the container resets local data. Demo access remains enabled; do not use this deployment for real customer data until the database and production authentication setup are ready.

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
- Venue capacity checks, whole-day booking conflict protection, maintenance checks, and payment overpayment protection.
- Calendar, booking filters/search/pagination, client directory, payment history, CSV exports, business reports, and profile/workspace settings.
- Seeded demo data: two organizations, three halls per organization, six clients, four staff directory entries, 36 bookings, and 36 payments per organization.
- Persistent database: `data/gatherhall.sqlite`, excluded from Git. Initial demo fixtures are generated only when no tenant exists.

The demo's dashboard/calendar date is fixed to September 28, 2026 for a coherent first-load experience. Events are treated as whole-day reservations; start times are informational.

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
