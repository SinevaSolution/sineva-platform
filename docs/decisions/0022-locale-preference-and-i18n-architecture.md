---
title: "Locale Preference and i18n Architecture"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-22"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "i18n", "locale", "copy-lint", "indonesian"]
summary: "Locale comes from the user's profile, then a cookie, then Accept-Language, with no URL prefix and no cross-locale fallback. One locale registry, message catalogs per locale, and a copy lint that fails CI."
related_docs:
  - "README.md"
  - "0011-user-facing-wording.md"
  - "../design-context/copywriting_and_brand.md"
  - "../product/product_model_and_wording.md"
  - "../../docs/implementation-plan/M0-foundations.md"
adr_id: "0022"
decision_status: "accepted"
supersedes: []
---

# 0022 Locale Preference and i18n Architecture

Accepted on the Founder's delegation, using the implementation plan's recommended option (ADR-P-06), with one stated deviation in the library choice (see Decision, point 6).

## Context

The platform ships in Indonesian and English. Every UI string was hardcoded English. The product needs one place that lists languages, one place that decides which one a request uses, a rule that catalogs stay complete, and a gate on wording (no "assistant", no em dash, protected product names).

## Options considered

1. **Locale in the URL (`/id/...`)**: shareable per language, but it doubles every route and breaks the workspace slug scheme (`/w/{slug}`).
2. **Locale from the profile, then cookie, then browser, no URL prefix**: one URL per page, the person's saved choice wins everywhere.
3. **A fallback chain (`id` falls back to `en`)**: hides gaps. A missing Indonesian string would silently show English and CI would stay green.

## Decision

1. **Resolution** (`packages/i18n/resolve.ts`, used by `apps/web/src/i18n/server.ts`): `users.locale` of the signed-in person, then the `sineva_locale` cookie, then `Accept-Language` (primary subtag, so `id-ID` and the legacy `in` both give Indonesian), then `en`. Every candidate must be enabled in the registry. No URL prefix. The root layout sets `<html lang>`.
2. **One registry** (`packages/i18n/locales.ts`): code, native name, `Intl` locale, enabled flag. v1.0 enables `id` and `en`. `users.locale` and `workspace.default_locale` are validated against it (`server/application/dtos/locale_dto.ts`), not against a two-value enum.
3. **Catalogs** (`apps/web/messages/en.json`, `id.json`): namespaces per feature (`common`, `errors`, `meta`, `auth`, `account`, `shell`, `workspace`, `room`, `chat`, `specialists`, and `mcp` reserved). Both files are authored in the same change. **No cross-locale fallback**: a missing key renders its own path and is reported; CI fails on a missing, unused or untranslated key.
4. **Error copy maps from the machine code** (`apiErrorKey` in `client/lib/api.ts`), never from the API `message`.
5. **Copy lint** (`packages/i18n/copy_lint.ts`, run by `src/__tests__/i18n_copy_lint.test.ts`) and an ESLint rule (`apps/web/eslint-rules/no-hardcoded-strings.mjs`) enforce the wording rules of `00-conventions.md` section 10. The lint cannot see model output or user content; that gap stays with the guardrails in `sineva-ai`.
6. **Library, deviation from the plan**: the plan recommends `next-intl`. This change ships a small in-repo translator instead (`packages/i18n/format_message.ts`, `translator.ts`, `apps/web/src/i18n/`) with the same call shape (`useTranslations(ns)`, `getTranslations(ns)`, `t.rich`) and the same ICU subset (`{name}`, `{n, plural, ...}`). Reason: adding a dependency means an `npm install` that rewrites the shared lockfile and `node_modules` other work is running against. The API is deliberately next-intl-shaped, so adopting it later replaces `provider.tsx` and `server.ts` internals and leaves every component and catalog untouched. Reverse this decision by superseding this ADR once the dependency can be installed.

## Consequences

- Adding a language is: one registry entry, one catalog, then `findIncompleteLocales` and the copy lint must pass before it can be enabled.
- A hardcoded string in `src/client` or `src/app` fails `npm run lint`.
- The profile locale costs one cached profile read per request on pages (React `cache`).
- Specialist `display_name`, `role_title` and `short_description` come from the specialist registry and are data, not catalog copy. Their localized forms arrive with the specialist manifest (WP-M0-31).
- Native-speaker review of both catalogs is a release gate before beta; machine-written Indonesian here is a first draft.
