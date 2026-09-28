# Pricing models, food menus and booking printing

## Getting started

1. Open **Pricing models** in the sidebar.
2. Owners can create, edit, deactivate or delete pricing models and extra services. Staff and clients can view the catalog but cannot change it.
3. Create or edit a booking, enter event details, then choose a pricing model.
4. Enter expected guests once in **Event & duration**, choose a suggested/custom duration, then select a pricing model and meal type.
5. Expand optional billing controls or extras only as needed. Review the synchronized estimate and save.

Each tenant receives four reference models and eight reference services once. Owners should review their own menus, inclusions, rates and tax treatment before using these as real offers. The catalog is independently editable in each workspace. Deleted items are not automatically re-seeded on restart.

## Billing methods

| Billing method | How the charge is calculated |
| --- | --- |
| Venue only | The selected hall's rental + selected add-ons |
| Per plate — venue included | Billed plates × chosen meal rate + add-ons; no separate hall rent |
| Venue + per plate | Hall rental + billed plates × chosen meal rate + add-ons |
| Fixed package | A fixed amount for the listed inclusions and maximum guests + add-ons |

A single plan applies to each booking. Different bookings can use different plans.

Meal types are **Vegetarian**, **Jain / No onion-garlic**, **Non-vegetarian**, and **Mixed menu**. Owners set rates for offered meal types on per-plate models. A mixed menu is one agreed rate per billed plate, not separate veg/non-veg guest groups. Each configured meal type has its own itemized food menu. Booking dietary notes record additional preferences. Models without itemized menus retain legacy meal-type support.

## One attendance source, explicit billing rules

New UI bookings use pricing version 2:

- **Expected guests** appears once in section 1 and drives the estimate.
- **Minimum guaranteed guests** defaults to the selected model’s minimum. It is an agreed contract minimum, not capacity or expected attendance. It may be increased but not reduced below the model minimum; 0 means no minimum.
- **Actual served guests** is optional and entered by owner/staff after service. Blank uses expected attendance; recorded 0 is a genuine zero. Once actual served is recorded, changing expected guests affects planning only. Clear actual served to return to an estimate.
- **Billable plates = max(expected or actual served, agreed minimum guests)**.
- **Food amount = max(billable plates × meal rate, minimum food bill)**. The minimum-spend adjustment is shown as a separate line, not disguised as additional plates.
- **Hall capacity** limits expected/actual attendance and guarantees; it never changes rental or creates a billing minimum.

Example: 150 expected, ₹650/plate, minimum 100 → ₹97,500 estimate. Actual served 80 → ₹65,000; actual served 180 → ₹1,17,000. With a ₹1,00,000 minimum food bill, 80 served still means ₹1,00,000 food billing.

Venue-only does not provide an external-caterer option, external catering bill or outside-caterer collection. Food, if charged by this system, belongs to a selected in-house pricing model.

### Duration and availability

Booking-time suggestions: **Morning 08:00–14:00**, **Afternoon 14:00–20:00**, **Evening 17:00–23:00**, **Full day 00:00–24:00**, **Multiple days**, and **Custom timing**. These are explicit local venue-time intervals. Afternoon and evening overlap and cannot both be reserved; morning and afternoon touch without overlapping. There is no implicit setup/cleanup buffer—include it in the custom reserved duration where necessary.

- Multiple days includes the last selected date and charges daily rent for each date.
- Custom timing reserves the exact interval, including overnight intervals with a later end date. Rental uses the daily rate for every calendar day touched. Ending exactly at midnight does not add another day.
- Up to 31 days per booking. Cross-date overlaps are checked by the server; Pending bookings reserve availability too, Cancelled bookings do not.
- Full-day and legacy bookings block all shifts on their date. Calendar entries and date-range filters include all occupied dates.
- Suggested shift rental rates are configured in hall editing. Blank means use full-day rental—no unannounced hourly proration.

**Rate precedence:** event-specific model rental → model rental override → hall shift rate → hall daily rate. Rental overrides are per selected shift/day; multiple-day rental multiplies by rental days. Event-specific meal/package rates override the model’s base rate. Rental + catering adds the two charges; per-plate/venue-included has no separate rental.

**Food covers one agreed meal service for the booking, and a fixed package is charged once per booking. Neither is automatically multiplied by rental days.** Multiple separately priced meal services are not modeled as independent meal schedules; agree their scope explicitly in the menu/terms or use appropriately named extra services with explicit quantities.

## Food menu editor

Create named models such as “Silver Vegetarian Menu”, select one of the four billing methods, and add food menus. These are menu packages—not programmable pricing formulas or plan inclusion checklists.

- Add up to four dietary menus. Only configured types can be selected for new bookings.
- Add, rename, reorder or remove courses such as welcome drinks, starters, main course, breads/rice and desserts.
- Enter dishes one per line, or explicitly insert an editable North Indian sample menu.
- Each menu has 1–8 courses, with 1–20 items per course; up to 160 food items across a model. Course names allow 50 characters, dishes 100. Blank items are removed and duplicate dishes within a course are normalized case-insensitively.
- Dishes are included in the model's price, not billed individually. Venue-only models cannot carry food menus. Fixed packages can offer a choice of meal type without changing their fixed rate.
- Optional booking terms (up to 3,000 characters) appear on the full financial confirmation.

Catalog cards preview menus, and food-item search finds relevant models. The booking snapshots the selected menu and model terms; editing or deleting the catalog does not rewrite saved agreements. Legacy bookings without menus are explicitly labeled as having no recorded itemized menu.

The tenant-scoped `/api/pricing-models` API supports list/create and `/api/pricing-models/:id` supports read/update/delete. The original `/api/plans` write routes and internal `plans` storage remain compatible. Omitting `menus` or `terms` on edit preserves them; explicit `menus: []` clears future menus. Only untouched reference models with no menus property receive sample menus on upgrade.

## Extra services

The reference catalog includes mandap/stage decoration, baraat welcome, DJ/sound, a live chaat counter, guest rooms, generator backup, photography/video and parking assistance. Owners can add their own services.

Each service has a name, category, unit, rate, description and active/inactive status. Supported units:

- Per event
- Per guest / serving
- Per room-night
- Per hour
- Per item

The unit labels explain the quantity; the calculation is always **quantity × agreed unit rate**. For example, 4 rooms for 2 nights should be entered as 8 room-nights. **Per-guest services** default to “Follow attendance” on new bookings and use expected/actual served (not minimum billable plates). Turn it off to set an explicit quantity. Other units are manual and are not automatically changed when attendance or duration changes. Avoid selecting an extra already included in a fixed package.

An add-on is a charge line, **not a vendor reservation or inventory allocation**. Room stock, vendor schedules, actual service delivery and local DJ/noise permissions still need to be confirmed by the team.

### What’s included in each service

The owner’s add/edit service dialog has a dedicated **What’s included** editor:

- Add, edit, reorder or remove checklist items. **Enter** adds another row after a completed item.
- Paste multiple lines into a row to replace it with separate inclusions. Simple bullet prefixes are removed.
- Use example suggestions as starting points; adding an example is always explicit, never automatic.
- Preview the client-facing checklist before saving.
- Up to **20 inclusions**, each **160 characters**. Blank lines are removed, whitespace normalized and case-insensitive duplicates removed while preserving the first occurrence and order.

For a camera/photography add-on, examples might be “Professional camera equipment”, “On-site photographer” and “Edited digital photos”. The venue must set the actual agreed deliverables.

Inclusions describe what the service rate already covers; they are **not separately priced or individually selectable add-ons**. The service checklist appears on catalog cards, in booking selection, under the quote’s service lines and in the downloaded text estimate. Search also matches inclusion text. Long checklists can be expanded without selecting/deselecting the service.

The API takes inclusions from the authorized tenant catalog, not client-submitted claims. New bookings snapshot the agreed list alongside the service rate. Catalog edits or deletion do not rewrite an existing agreement. Older booking snapshots without inclusions remain empty rather than acquiring today’s promises retroactively.

Older API clients may omit `features` when editing a service without clearing it; an explicit empty array clears the list for future bookings. Untouched reference services receive example lists on upgrade. Customized services and explicitly empty lists are not overwritten.

## Estimate, tax and advance

1. Subtotal = venue charge + catering/package charge + add-ons.
2. Discount is a fixed rupee amount, not a percentage.
3. Tax = (subtotal − discount) × configured tax percentage.
4. Booking total = subtotal − discount + tax.
5. Advance target = booking total × advance percentage.
6. Advance still due = advance target − payments already recorded, with a floor of zero.
7. Total balance = booking total − payments recorded, with a floor of zero.

Currency amounts are rounded to two decimal places. Owners/staff can set discounts, tax (0–28%) and advance (0–100%). Clients cannot override them: new client requests use the catalog's tax and advance settings and have no discount. Unit rates, totals and line charges are recalculated by the API from tenant-owned catalog records rather than trusting submitted totals.

The default tax rate is 0%, **not a claim of exemption**. Configure the applicable treatment with your accountant. The summary is an estimate, not a GST-compliant tax invoice. Per-line tax classifications, CGST/SGST splits, GSTIN validation and statutory invoices are not implemented.

Payments are still recorded manually. Advance percentages do not automatically charge a card, collect money or confirm a pending booking. Previously recorded payments cannot exceed the revised booking total; the API rejects such reductions.

## Saved agreements and older bookings

Each booking stores a snapshot of its selected plan, hall rental, service unit rates and calculated quote. Editing catalog prices or deleting/deactivating catalog records does not silently change historical agreements. Changing quantities on a saved booking uses its saved unit rates. Switching to a different plan uses that plan's current offer; newly added services use current catalog rates. The hall’s rental schedule stays locked while the same hall is retained; selecting a different hall uses its current rates. Saved event-rate rules are retained, but selecting another event type or duration applies the appropriate saved rule and recalculates quantities. A changed draft total is shown separately from the saved booking/payment balance. Prints and payment records update only after save.

Older version-1 catering agreements keep their original **guaranteed + extra plates** calculation; their editor shows a clear legacy notice and an explicit switch to guest-linked billing. Review the resulting draft total before saving. Existing version-2 bookings cannot be downgraded by submitted data. New client requests always use guest-linked billing and cannot submit actual served counts or fake totals. For compatibility, owner/staff API integrations sending explicit legacy plate counts without `pricingVersion: 2` still use version 1; integrations should send version 2 for all new bookings.

Older bookings keep their original manual totals. They can be edited without conversion or explicitly moved to a catalog plan. Once a packaged booking is saved, its plan cannot be removed to bypass pricing calculations.

## North India event coordination

Event types include weddings, receptions, sagai/engagement, tilak, roka, haldi, mehendi, sangeet, mundan and janeu/upanayan, plus other common functions.

Optional fields record:

- Family / event coordinator and phone
- Baraat arrival
- Muhurat / ceremony time
- Expected end time
- Menu and dietary preferences
- Internal operations/vendor notes (hidden from client API responses)

The selected **booking duration** controls availability. Arrival and ceremony timings are informational and do not extend the reservation. Select **Custom timing** for overnight handover or **Multiple days** to reserve consecutive dates.

## Sharing

Owners/staff can download the last saved estimate from the booking editor. Clients can see their own itemized quote and download a UTF-8 text estimate from booking details. Unsaved draft changes and internal vendor notes are not included in the download.

### Printable confirmations

Use a booking row’s printer button or **Print confirmation** in booking details/editing:

- **Full financial copy:** saved event/menu/services, recorded charges, tax, advance, current payment records, balance, saved terms and signature lines.
- **Event-only copy:** event details, selected menu and services, without structured prices, payments, financial terms or general booking notes.

Open the preview, then choose **Print / Save as PDF**. The standalone white A4 document is independent of the app’s theme. Pending and cancelled bookings are clearly labeled and never represented as confirmed reservations. Internal operations/vendor notes are never printed. Review free-text menu/preferences before sharing: user-entered prices in those fields are not automatically redacted.

The authenticated `/api/bookings/:id/confirmation?format=full|event` route enforces tenant and client ownership, escapes dynamic HTML and disables caching. It is not a public share link. Downloaded PDFs contain private booking data: share them only with intended recipients. A booking confirmation is not a statutory tax invoice.

## Storage and deployment

This feature extends the existing temporary storage setup. It does not introduce Supabase or permanent SQLite mounts. Docker now copies the shared pricing module into both its build and runtime stages. The existing Coolify deployment settings remain the same.

## Verification

`npm run test:deployment` builds and starts an isolated production server, runs the original API suite plus package and menu/printing tests, checks restart persistence and then removes test data. `npm test` runs appearance checks and all API suites against an already running demo server.

Package tests cover catalog permissions/CRUD, tenant boundaries, all price modes, plate/service validation, tax/discount/advance calculations, protection against submitted rate/total manipulation, saved-price snapshots, internal-note privacy and paid-balance protection.
