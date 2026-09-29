# Compact dashboard update

## Interface

- Removed large dashboard introductions, promotional overview banners and multi-level breadcrumb trails. Each platform page has one small title in the top bar; existing safety/setup warnings remain.
- Platform overview starts with organization, gross SaaS collection, subscription and estimated-MRR cards, followed by UTC monthly charts, readiness, hall/staff/plan counts, recent organizations, subscription mix, quick actions and audit activity.
- Reference-image metrics that are not available (website visitors, ratings, tenant booking analytics) are intentionally not invented. The charts use existing organization registrations and captured SaaS payments, not venue booking revenue. Demo data remains explicitly labelled.
- Charts have 3/6/12-month selectors, SVG descriptions and expandable data tables. The current UTC month is partial. The existing 1,000-row loaded-window limitation still applies; these are not guaranteed lifetime financial totals.
- All platform tabs now have stable hash URLs; organization search routes to the existing organization list. Create-plan actions remain available on the plan page, including mobile.
- Venue dashboard welcome banners and page introductions have also been removed. Booking, calendar, catalog and account controls remain available. Public website and sign-in marketing content is unchanged.

## Loading changes

- The venue workspace is a separate lazy-loaded module (`src/Workspace.jsx`). Visiting the platform or public website no longer imports booking/editor code.
- Platform dashboard and overview are separate lazy-loaded modules. Settings, CMS and Messages do not require the overview API and can open without that request.
- The platform shell renders immediately after authentication. Dependent views show a loading placeholder while fetching data; errors expose retry controls instead of replacing navigation.
- Overview requests are deduplicated in the mounted dashboard. Existing data is reused across tabs, with explicit refresh and post-mutation refresh. No tenant data is persisted to browser storage for caching.
- Organization/subscription/usage lookups use maps. The usage RPC runs concurrently with overview table queries.
- Production build comparison: main JavaScript **444.08 → 269.41 kB** (gzip **129.72 → 83.90 kB**); initial CSS **168.16 → 119.41 kB**. Some bytes move to on-demand chunks. These are build sizes, not a measured promise of live page-load time; hosting, Supabase and network latency still matter.

## Other fix

The venue dashboard's displayed revenue total previously filtered hard-coded April–September/July–September month numbers. It now follows the selected rolling period and current year, matching chart buckets and excluding future-dated receipts.

## Validation and deployment

No new SQL migration or environment variables are required for this update. Existing migrations and provider setup are still required.

- `npm run test:saas` includes chart bucket/currency/date-boundary tests.
- `npm run test:dashboard:ui` verifies cold Settings navigation skips overview/workspace loading, shell visibility during slow requests, chart range, search, plan actions and mobile/dark layouts.
- Existing SaaS, messaging, deployment, booking, printing, sidebar and marketing/CMS regressions apply.
- Browser suites need the optional Playwright/Chromium dependencies and a running development server (same conventions as the existing UI tests).
