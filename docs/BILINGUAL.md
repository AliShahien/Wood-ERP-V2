# Bilingual UI (Arabic / English)

- Locales: `ar` (RTL, default) and `en` (LTR). One codebase, one set of components.
- The user's language is stored in `users.locale` and changed from the profile page. Before login,
  the `edge_locale` cookie (or `Accept-Language`) decides.
- `<html lang dir>` is set server-side per request, so the first paint is already correct.

## Messages
- Catalogs: `packages/i18n/messages/ar.json`, `en.json` — nested keys (`nav.customers`,
  `errors.insufficientStock`). A test asserts both files have identical key sets.
- Optional runtime overrides in the `translations` table (locale, key, value) take precedence.
- Server errors carry `messageKey`; the UI translates them. Never render raw server text as a label.
- Enum values (statuses) are translated via `status.<Enum>.<VALUE>` keys.

## Master data is NOT translated
Product names (English), material names (Arabic), customer/supplier names (as entered) are shown
exactly as stored in both UI languages. Configuration records that are pure labels
(roles, production stages) have `name_ar` + `name_en`.

## Layout rules
- Use CSS logical properties / Tailwind logical utilities: `ms-* me-* ps-* pe-* start-* end-*
  text-start text-end border-s border-e`. Do not use `ml/mr/pl/pr/left/right` for layout.
- Directional icons (chevrons, arrows) flip with `rtl:rotate-180`.
- Numbers, codes (QT-2026-000001), phone numbers and dimensions are wrapped in `dir="ltr"`
  spans (`<Num>`) so they never reorder inside Arabic text.
- Fonts: IBM Plex Sans Arabic (Arabic) + Inter (Latin), both self-hosted via `next/font`.
- Dates/numbers formatted with `Intl` using the active locale (`ar-EG` uses Latin digits by
  configuration `numberingSystem: "latn"` for readability of codes and amounts).

## PDFs
PDFs embed an Arabic-capable font and run the text through a shaping/bidi pass, so Arabic
material names render correctly even in English documents. See `packages/core/src/pdf`.
