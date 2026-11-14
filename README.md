# naut.frame

Ultra-minimalist photography curation & visual journal built on **Next.js App Router + `shadcn/ui` + Neon PostgreSQL**, engineered with strict **Clean Architecture** and defense-in-depth security.

---

## Core Capabilities

- **Zero-PII Privacy Policy (`/privacy`)**: Registration and sign-in collect only a unique `username` and a one-way `bcryptjs` (cost `12`) password hash. Zero email addresses, phone numbers, legal names, or tracking scripts.
- **Interactive Polar Bear Auth**: Animated polar bear character that watches your cursor while typing and shyly covers its eyes when plain-text password mode is toggled on.
- **Distraction-Free Infinite Explore**: Pure edge-to-edge masonry frames powered by `UnsplashQuotaWorker` (`50 req/hr`, `30 photos/req`, Zero-`429` guarantee) with Singleflight coalescing, Neon Postgres cache pool hydration, deferred SSRF-safe `download_location` dispatch, and extensible secondary `IImageProvider` fallback (`PicsumRandomProvider`).
- **Author Attribution Toggle & Photographer Profiles (`/photographers/[username]`)**: Instant header switch to show or hide photographer credits, with dedicated photographer detail pages and structured SEO metadata.
- **1 Saved Frame ↔ Many Stories (`Private` / `Public`)**: Write unlimited independent journal entries per saved frame, edit notes, and switch visibility between `Private` and `Public` at any time.
- **Anonymous Hearts (Zero Comments, Zero Notifications)**: Public stories display only aggregate heart counts; liker identities are audited exclusively for **Administrators**.
- **Profile & Single-Slot Cloudinary Avatar**: Client-side square crop & WebP compression, server magic-byte verification, and automatic single-slot reclamation on Cloudinary.
- **Admin Console (`/admin`)**: User management, 7-day save/story telemetry, Quota Worker health, and admin-only heart audit logs.

---

## Getting Started

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Install dependencies
pnpm install

# 3. Push schema to Neon PostgreSQL & seed initial Admin (INITIAL_ADMIN_USERNAME / PASSWORD)
pnpm db:push
pnpm db:seed

# 4. Run development server
pnpm dev

# 5. Run Quality Control suite (Typecheck + Clean Architecture + Unit Tests)
pnpm qc
```
