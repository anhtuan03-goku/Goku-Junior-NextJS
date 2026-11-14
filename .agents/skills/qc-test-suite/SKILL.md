---
name: qc-test-suite
description: >-
  Use this skill when running Quality Control (QC), unit tests, Clean Architecture boundary tests,
  Unsplash 50-req/hr Worker quota exhaustion tests, or E2E verification on Goku-Junior-NextJS.
---

# QC Test Suite Runbook — Goku-Junior-NextJS

Follow these steps in order whenever validating changes or preparing a release candidate:

## Step 1: Environment & Secret Safety Pre-check
1. Confirm `.env` is ignored by git:
   `git check-ignore -v .env`
2. Confirm TypeScript compiles cleanly:
   `pnpm typecheck`

## Step 2: Automated Architecture, Unit & Integration Suite
Run Vitest across all layers:
```powershell
pnpm test
```
Verify the suite covers:
- `tests/architecture/boundaries.test.ts` — Clean Architecture dependency rules (`domain` & `application` isolation).
- `tests/unit/quota-worker.test.ts` — `50 req/hr` governor, `per_page=30` enforcement, Singleflight request coalescing, SSRF validation on `download_location`, and Zero-`429` fallback at `0` remaining quota.
- `tests/unit/use-cases.test.ts` — Zero-PII registration/login, `1-to-Many` posts per saved image (`PRIVATE` ↔ `PUBLIC`), strict Like Anonymity DTO stripping, Admin RBAC & like audit logs, Photographer Mode toggle, and Cloudinary 1-slot replacement/cleanup.

## Step 3: Production Build & Lint Verification
```powershell
pnpm lint
pnpm build
```
Ensure Next.js App Router compiles all Server Components and API Routes with zero `server-only` leaks.

## Step 4: Live Functional Smoke Check
With `pnpm dev` (or `pnpm start`) running:
1. Check `GET /api/images/feed?page=1` returns `200` with normalized images and photographer metadata.
2. Register a test user (`username` + `password` only), save an image, create 2 posts (`1 PRIVATE`, `1 PUBLIC`) on that saved image, toggle Photographer Mode, visit `/photographers/[username]`, heart the public post, and verify the JSON response omits liker identities while Admin `/api/admin/likes` records the event.
