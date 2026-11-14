---
name: red-team-audit
description: >-
  Use this skill to perform the final-stage Red-Team security, Clean Architecture, backend concurrency,
  frontend UX, performance, and responsive (375px-1440px) audit on Goku-Junior-NextJS.
---

# Red-Team Final Audit Runbook — Goku-Junior-NextJS

Execute all 5 phases below before signing off on the repository:

## 1. Secret & Client Bundle Inspection
1. Verify git ignore status: `git check-ignore -v .env` and `git status --short`.
2. After `pnpm build`, scan `.next/static` for leaked credential substrings (`npg_`, `cloudinary://`, `UNSPLASH_ACCESS_KEY`, `AUTH_SECRET`). Zero matches must be found.

## 2. Adversarial API & OWASP Exploitation Checks
Test against route handlers / use cases:
- **SSRF / Key Exfiltration**: Submit `downloadLocation` pointing to external host (`https://attacker.tld/photo/download`) or internal IP (`http://127.0.0.1:3000`). Expect SSRF filter block without outbound request.
- **IDOR on Private Posts & Saved Images**: Attempt read/edit/delete/like on another user's `PRIVATE` post; attempt creating a post on another user's `savedImageId`. Expect `403` / `404`.
- **Like Anonymity Enforcement**: Verify non-admin endpoints never serialize `likedByUsers`, `actorUserId`, or `likeAuditLogs`.
- **Privilege Escalation**: Attempt `role: "ADMIN"` in `/api/auth/register` and `/api/profile`; attempt accessing `/api/admin/*` as a normal `USER` (`403`) and locked `ADMIN` (`401`).
- **Malicious Avatar Upload**: Send SVG/HTML disguised as `.webp` and oversized buffers (`> 2MB`); confirm magic-byte validator rejects before touching Cloudinary.
- **CSRF & Rate Limit**: Send cross-origin `Origin: https://evil.example` to mutating `POST/PATCH/DELETE` endpoints -> expect `403`. Trigger rapid login failures -> expect `429` rate limit on auth brute-force (while `/api/images/feed` NEVER returns `429` thanks to `UnsplashQuotaWorker` fallback).

## 3. Concurrency & Worker Resilience
- Fire `15` concurrent `/api/images/feed?page=1` calls and verify Singleflight executes at most `1` upstream fetch.
- Verify `likes_count` never drops below `0` on repeated unlikes.

## 4. Performance Audit
- Check Neon pooled driver usage (`DATABASE_URL_POOLED`) for runtime queries.
- Check image lazy-loading, aspect-ratio reservation (no CLS jump), and client-side WebP compression (`<= 512x512`) in avatar uploader.

## 5. Responsive Viewport Matrix
Inspect UI rendering at:
- **Mobile (`375x812`)**: Navigation header wraps/collapses cleanly, 1-2 column Masonry grid, no `scrollWidth > innerWidth`, touch-friendly buttons/dialogs.
- **Tablet (`768x1024`)**: 2-3 column Masonry grid, Saved Multi-Post drawer/panel readable.
- **Desktop (`1440x900`)**: 3-4 column ultra-minimalist Masonry grid, Admin tables & stats cards balanced.
