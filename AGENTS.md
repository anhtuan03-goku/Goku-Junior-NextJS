# Goku-Junior-NextJS — Agent Workspace Guidelines

This workspace follows **Strict Clean Architecture** and a **Multi-Agent Quality & Red-Team Pipeline** compatible with both **Google Antigravity** and **Gemini**.

## Core Architectural & Security Rules

1. **Dependency Direction**:
   - `src/domain` -> pure TypeScript entities, errors, and port interfaces (0 external framework imports).
   - `src/application` -> Use cases & safe DTO projections (imports `src/domain` only).
   - `src/infrastructure` -> `import "server-only"`; Drizzle + Neon Postgres (`DATABASE_URL_POOLED` at runtime, `DATABASE_URL` for migrations), `UnsplashQuotaWorker`, `PicsumRandomProvider`, `CloudinarySingleSlotStorage`, `JwtSessionService`, `PasswordHasher`.
   - `src/interfaces` & `src/app` -> Route handlers, Zod validation, rate-limiters, CSRF checks, and ultra-minimalist `shadcn/ui` views.

2. **Seven Non-Negotiable Product Invariants**:
   - **Zero-PII Auth**: Only `username` + hashed `password` (`bcryptjs`). Initial Admin bootstrapped via `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD`.
   - **Multi-Post Saved Images**: `1 saved_image` -> `N posts`, each editable and freely switchable between `PRIVATE` and `PUBLIC`.
   - **Anonymous Hearts**: No comments, no notifications. Non-admin responses NEVER include liker usernames/IDs; full like/unlike audit trail is stored for `ADMIN` only.
   - **Photographer Mode & Profile**: User setting `showPhotographerInfo` toggles photographer attribution badges on/off; `/photographers/[username]` displays detailed photographer info & works.
   - **Zero-429 Quota Worker (`50 req/hr`, `30 photos/req`)**: Singleflight coalescing + Token-Bucket Governor + Neon Postgres Cache Pool (`cached_images`, `cached_photographers`) + Deferred `download_location` job queue + Multi-Provider fallback.
   - **Single-Slot Cloudinary Avatar**: Client WebP compression + server magic-byte verification + old-slot `destroy` & deterministic `overwrite=true` `public_id`.
   - **Zero Secret Leakage**: `.env` may be read locally by authorized server configs/agents for verification, but secrets must never enter git history, client bundles, or HTTP error payloads.

## Specialized Workspace Agents & Skills
- **QC Engineer** (`.agents/agents/qc-engineer.md` | Skill: `.agents/skills/qc-test-suite/SKILL.md`): Functional, boundary, quota-exhaustion, and E2E testing.
- **Red-Team Auditor** (`.agents/agents/red-team-auditor.md` | Skill: `.agents/skills/red-team-audit/SKILL.md`): Final adversarial audit across BE, FE, AppSec, Performance, and Responsive design.
