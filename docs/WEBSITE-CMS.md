# Bilingual website and platform-owner CMS

## Preview routes

- `/` — English landing page with Indian architectural artwork, perspective/parallax, floating illustrative booking cards and a lavender/ivory visual system.
- `/hi` — Hindi home. Add `/hi` before the other public paths for their Hindi versions.
- `/features`, `/pricing`, `/about`, `/contact`, `/faq`, `/blog` and `/blog/:slug`.
- `/privacy`, `/terms`, `/refunds` — legal routes; intentionally unavailable publicly until the operator reviews and publishes the matching language's draft.
- `/workspace` — the existing venue-management demo/account entry. `/` no longer automatically logs into a venue.
- `/login` — production authentication. Existing email-confirmation/recovery callbacks still bypass the marketing router.
- `/platform#cms` — platform console → Website CMS.

The hero uses an AI-generated architectural illustration and CSS 3D transforms with pointer parallax, not a navigable WebGL model. Reduced-motion preferences disable motion. Decorative illustrations contain no real booking or revenue claims. The public site is a light brand surface; existing workspace/admin light/dark preferences remain available.

## Try the CMS in demo mode

1. Visit `/platform#cms`, select English or Hindi, then a page/article.
2. Edit its title, summary, body or search metadata. Use `## Heading` for section headings; in an FAQ page each section is an accordion item.
3. **Save draft** does not change the public version.
4. **Preview draft** opens an unpublished content preview.
5. **Publish** requires confirmation and publishes the saved draft, independently for each language.
6. Open the public website in the same browser to see the result.
7. Use version history to restore a prior revision as a draft. Publishing remains a separate action. Unpublish before deleting an entry.

Demo CMS changes use browser localStorage, not SQLite, Supabase, or server-wide storage. Different browsers have separate copies. Storage-disabled/full browsers show a save error; a failed save is not reported as published. Reset local demo content from the empty editor screen. Demo contact forms do **not** send or store enquiries.

## Production installation

Apply the existing migrations in order, then `supabase/migrations/202609290004_website_cms.sql`. If upgrading an existing project, apply only unapplied migrations—do not rerun the initial migration. Back up first. New code's production health check requires both the subscription catalog and CMS tables.

Production content is stored in Supabase tables:

- `cms_entries`: per-language pages/articles with distinct draft and published snapshots, revision and publication metadata.
- `cms_history`: saved revisions, including starter revision 1. The UI retrieves the latest 30.
- `cms_enquiries`: private contact requests, status, submission time and the exact published privacy-policy revision accepted.

Only operator-bootstrapped platform admins with a verified AAL2 session can use the CMS API. Venue owners, staff and clients cannot manage the public site. Read RLS enforces the same platform/MFA boundary; direct browser writes and privileged RPC calls are revoked. Server-only mutation RPCs recheck platform membership. Administrative changes produce audit events.

`GET /api/public/content?locale=en|hi` returns only published snapshots and their public metadata—never drafts or revision history. Saving uses optimistic revision checks, so a stale browser cannot silently overwrite another editor. URLs/locales are immutable after creation; create a second entry for a translation or new URL.

No raw HTML, scripts, arbitrary embeds or user-supplied links are executed. Content is rendered as React text and simple section headings. The curated page layouts, illustrations and system UI labels remain in code; this is an editorial CMS, not a drag-and-drop page builder or media-upload system. Public pricing remains authoritative from the subscription-plan catalog rather than editable prices in page prose.

## Contact enquiries and legal review

Legal documents are starter **draft templates**, not legal advice or an approved agreement. Review operator identity, privacy practices, support contact, refunds and terms for the real business before publishing.

The live contact form is disabled until the privacy policy is published in the visitor's language. Submission requires explicit consent and the policy's ID/revision. The transactional insert verifies that the same policy version is still public; if it changed, the visitor must reload and review it. Requests are protected by the existing CSRF/origin middleware, shared per-IP limits and a honeypot field.

Submissions appear in Website CMS → Contact inbox (latest 100). Mark them read/closed or permanently delete their personal data. Deletion leaves only a non-PII audit reference. There is **no automatic email delivery or reply service**; the optional `SUPPORT_EMAIL` is shown on the public page and staff can use their email client to reply. Define your retention policy and periodically delete enquiries. Stronger bot protection and operational monitoring are recommended before opening a high-traffic public form.

## SEO and scale boundaries

The CMS updates browser titles, descriptions and document language. The SPA does not server-render per-article social previews, generate a dynamic sitemap, guarantee indexing, or automatically redirect deleted articles. The initial public content request currently loads all published documents for one language; large editorial libraries need paginated index/detail endpoints and server rendering/caching before scale. No analytics, third-party tracking, newsletter or fabricated testimonials are added.

## Verification

- `npm run test:saas`: migration/schema tests including CMS RLS, draft isolation, stale revisions, publish/restore/delete, consent version matching and enquiry permissions.
- `npm run test:saas:http`: production startup and unauthenticated CMS endpoint denials, without real provider calls.
- `npm run test:deployment`: existing workspace pricing/booking/auth/print regressions.
- Optional browser dependencies: `npm install --no-save --package-lock=false playwright-core @sparticuz/chromium`.
- With a demo server: `UI_TEST_URL=http://localhost:3000 npm run test:marketing:ui`. Host Chromium libraries may be needed. Covers desktop/mobile pages, Hindi, draft/public separation, article rendering, escaped HTML and unsent demo forms.

Live Supabase Auth/MFA and production contact-form testing still require configured services. A local preview is not evidence that those integrations have been deployed.

## Assets

`public/images/indian-palace-3d.webp` is an AI-generated, optimized illustration. Self-hosted Noto Sans Devanagari subsets are distributed under the SIL Open Font License; see `public/fonts/OFL-NotoSansDevanagari.txt`. English type continues using the project's existing font setup with system fallbacks. Hindi text does not depend on Google Fonts network access.
