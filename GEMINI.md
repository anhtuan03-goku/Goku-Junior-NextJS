# Goku-Junior-NextJS — Project Constitution (Gemini & Antigravity Rules)

## 1. Architectural Mandate: Strict Clean Architecture
All code inside `src/` MUST obey inward-pointing dependencies:
- **`src/domain/`**: Enterprise entities, value objects, domain errors, and repository/service interfaces (ports). **ZERO imports** from `next`, `drizzle-orm`, `@neondatabase/serverless`, `src/application`, `src/infrastructure`, or `src/app`.
- **`src/application/`**: Use Cases & DTO mappers. Depends ONLY on `src/domain/`. Never imports `next` or `src/infrastructure`.
- **`src/infrastructure/`**: Concrete adapters (Neon Drizzle DB, `UnsplashQuotaWorker`, `CloudinarySingleSlotStorage`, `JwtSessionService`, `PasswordHasher`, `RateLimiter`). Must include `import "server-only"` at module entrypoints so client components can never bundle server secrets or DB drivers.
- **`src/interfaces/` & `src/app/`**: Next.js App Router pages, minimal `shadcn/ui` components, and API Route Handlers.

## 2. Invariant Business & Privacy Policies
1. **Zero-PII Policy**:
   - Registration and authentication collect ONLY `username` (normalized lowercase, unique) and `password` (cryptographically hashed via `bcryptjs` cost >= 12).
   - Never collect or request email, phone number, full legal name, or tracking analytics.
   - `passwordHash` must NEVER leave `src/infrastructure/` or auth verification DTOs.
2. **Saved Image to Posts (`1-to-Many`)**:
   - A single saved image (`saved_images`) can have **multiple independent posts** (`posts`) authored by its owner.
   - Each post supports editing content and toggling `PRIVATE` <-> `PUBLIC` visibility at any time.
   - `PRIVATE` posts must NEVER be readable, likable, or queryable by any non-author user.
3. **Strict Like Anonymity (Zero Comments, Zero Notifications)**:
   - There are NO comments and NO user notifications.
   - All user-facing APIs (even for the post's own author!) MUST return ONLY `{ likesCount: number, likedByMe: boolean }`.
   - Who liked/unliked a post is recorded in `post_likes` and append-only `like_audit_logs` accessible **exclusively** to `ADMIN` role use cases.
4. **Photographer Display Mode & Detail View**:
   - Users control `showPhotographerInfo` (`boolean`, stored in DB + synced to UI). When disabled, image cards render pure minimalist visuals without photographer overlays.
   - Photographer profile page (`/photographers/[username]`) fetches and renders bio, stats, portfolio link, and photo gallery through the quota-aware worker.
5. **Unsplash Rate-Limit Queue Worker (`50 req/hour`, `max 30 photos/req`, Zero `429`)**:
   - Never call `api.unsplash.com` directly from UI or ad-hoc route handlers. Every call MUST go through `UnsplashQuotaWorker`.
   - Always fetch list batches at `per_page=30` and Opportunistically Hydrate photographer profiles into `cached_photographers`.
   - Validate `links.download_location` strictly (`https://api.unsplash.com/photos/.../download...`) to block SSRF / Access-Key exfiltration, and dispatch via the deferred queue so saving an image never blocks or fails on rate limits.
   - When hourly quota is low or `0`, seamlessly serve from `cached_images` / `cached_photographers` / secondary `IImageProvider` (`PicsumRandomProvider`) with HTTP `200` — NEVER expose `429 Too Many Requests` to users.
6. **Cloudinary Single-Slot Avatar Rule**:
   - Client compresses/crops avatar to WebP (`<= 512x512`) before upload; server validates magic bytes (`JPEG`/`PNG`/`WebP` only — reject SVG/HTML) and size (`<= 2MB`).
   - Every user has **at most 1 image slot** on Cloudinary: destroy previous `avatarPublicId` when different, upload with deterministic `public_id = goku_avatars/user_<userId>`, `overwrite=true`, `invalidate=true`, and destroy the asset when user deletes their avatar or Admin deletes the user.
7. **Secret Hygiene**:
   - `.env` and `.env.*` (except `.env.example`) MUST remain git-ignored at all times. Never print raw secrets in client code, logs, error responses, or commits.

## 3. Quality & Verification Workflow
- Run `.agents/agents/qc-engineer.md` (skill: `qc-test-suite`) for automated typechecking, Clean Architecture boundary tests, unit/integration tests, and browser E2E verification.
- Run `.agents/agents/red-team-auditor.md` (skill: `red-team-audit`) as the mandatory final gate across Backend, Security, Frontend, Performance, and Responsive viewports (`375px` to `1440px`).
