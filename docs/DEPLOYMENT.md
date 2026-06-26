# MAA BTOOL — Deployment & Operations Guide

This document covers the production deployment architecture, best practices, and operational runbooks for MAA BTOOL.

---

## Architecture Overview

```
GitHub (bayhaqy/maa-btool)
   │  push to main
   ▼
Vercel (auto-deploy)
   │  Next.js 16 · Standalone output · Region: sin1 (Singapore)
   ├── Supabase (PostgreSQL 15 · Connection pooler PgBouncer)
   ├── Upstash Redis (Rate limiting & caching)
   ├── Resend (Transactional email)
   ├── Pinecone (Vector search for AI features)
   └── Vercel Blob (File uploads — optional)
```

---

## 1. GitHub Configuration

### Repository Settings
- **Default branch**: `main`
- **Branch protection** (recommended):
  - Require pull request before merging
  - Require status checks to pass (CI workflow)
  - Require linear history
  - Allow force pushes: `Never`
- **Actions permissions**: Read and write
- **Secrets**: None stored in GitHub (all env vars live in Vercel)

### CI Workflow (`.github/workflows/ci.yml`)
Runs on every push/PR to `main`:
- Bun install (`--frozen-lockfile` for reproducibility)
- Prisma client generation
- ESLint (`bun run lint`)
- TypeScript type-check (`bun run type-check`)

### Dependabot (`.github/dependabot.yml`)
- Weekly npm dependency updates (Monday 09:00 Asia/Jakarta)
- Grouped updates for Radix UI, Next.js, React, Tailwind
- GitHub Actions version updates

---

## 2. Vercel Configuration

### `vercel.json` Highlights
| Setting | Value | Rationale |
|---------|-------|-----------|
| `framework` | `nextjs` | Explicit framework declaration |
| `regions` | `["sin1"]` | Singapore — closest to MAP Group (Indonesia) users |
| `cleanUrls` | `true` | Removes `.html` extensions |
| `trailingSlash` | `false` | SEO-friendly canonical URLs |
| Security headers | HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy | 2026 OWASP best practices |
| Static asset cache | `max-age=31536000, immutable` | 1-year immutable cache for hashed assets |
| AI route limits | `memory: 1024MB, maxDuration: 60s` | LLM calls need more memory & time |
| Image route limits | `memory: 512MB, maxDuration: 30s` | Image processing |
| Upload route limits | `memory: 1024MB, maxDuration: 60s` | Large file uploads |

### Environment Variables (Vercel Dashboard)
Configure these in **Project → Settings → Environment Variables** for Production + Preview:

| Variable | Scope | Description |
|----------|-------|-------------|
| `DATABASE_URL` | Production, Preview | Supabase pooler URL (port 6543, transaction mode) |
| `DIRECT_DATABASE_URL` | Production, Preview | Supabase direct URL (port 5432, session mode) — for migrations |
| `UPSTASH_REDIS_REST_URL` | Production, Preview | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Production, Preview | Upstash Redis auth token |
| `RESEND_API_KEY` | Production, Preview | Resend email API key |
| `PINECONE_API_KEY` | Production, Preview | Pinecone vector DB key |
| `PINECONE_INDEX` | Production, Preview | Pinecone index name |
| `JWT_SECRET` | Production, Preview | App-level JWT signing secret |
| `NEXT_PUBLIC_APP_URL` | Production | `https://maa-btool.bayhaqy.my.id` |

> **Never** commit `.env` files to git. All secrets live exclusively in Vercel.

### Build Settings
- **Install command**: `bun install` (from `vercel.json`)
- **Build command**: `bun run build` (includes `prisma generate`)
- **Output directory**: `.next` (auto-detected by Vercel for Next.js)
- **Node.js version**: 20.x (from `.nvmrc`)

---

## 3. Supabase Configuration

### Database Connection Strings

Supabase provides two connection modes. Use them correctly:

```
# DATABASE_URL — for runtime queries (Prisma Client)
# Uses PgBouncer connection pooler (transaction mode)
# Port: 6543
postgresql://postgres.[project]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1

# DIRECT_DATABASE_URL — for migrations (Prisma Migrate)
# Direct connection (session mode)
# Port: 5432
postgresql://postgres.[project]:[password]@aws-0-[region].supabase.com:5432/postgres
```

### Prisma Schema (`prisma/schema.prisma`)
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")        // Pooler (6543) — runtime
  directUrl = env("DIRECT_DATABASE_URL")  // Direct (5432) — migrations
}
```

### Supabase Best Practices
1. **Connection Pooling**: Always use the pooler URL (port 6543) for `DATABASE_URL`.
   Serverless functions (Vercel) open many short-lived connections — PgBouncer
   prevents connection exhaustion.
2. **`connection_limit=1`**: Add this query param to `DATABASE_URL`. Each Vercel
   serverless function instance should hold at most 1 connection.
3. **Direct URL for migrations**: `DIRECT_DATABASE_URL` (port 5432) is required
   because PgBouncer's transaction mode doesn't support Prisma Migrate's
   long-running transactions.
4. **Enable Point-in-Time Recovery (PITR)**: On Supabase Pro plan, enables
   daily backups + point-in-time recovery.
5. **Row Level Security (RLS)**: Enable RLS on all tables. Even though the app
   enforces auth, RLS provides defense-in-depth.
6. **Database indexes**: Ensure frequently queried columns have indexes
   (Prisma `@@index` directives in schema).

### Running Migrations
```bash
# Local development
bun run db:migrate

# Production (via Vercel CLI or Supabase dashboard)
# Option A: Run migration locally against production DB
DIRECT_DATABASE_URL="postgresql://..." bun run db:migrate deploy

# Option B: Use Supabase's SQL editor for schema changes
```

---

## 4. Next.js Configuration (`next.config.ts`)

| Setting | Value | Rationale |
|---------|-------|-----------|
| `output: "standalone"` | — | Minimal Node.js server output; optimal for Vercel cold starts |
| `poweredByHeader: false` | — | Removes `X-Powered-By` header (security) |
| `compress: true` | — | Gzip/Brotli compression |
| `typescript.ignoreBuildErrors` | `true` | Vercel builds never fail on type errors (CI catches them) |
| `eslint.ignoreDuringBuilds` | `true` | Vercel builds never fail on lint (CI catches them) |
| `experimental.optimizePackageImports` | 9 packages | Tree-shakes barrel exports (smaller bundles) |
| `images.formats` | `['avif', 'webp']` | Modern image formats |
| `images.minimumCacheTTL` | 30 days | Long image cache |
| Static asset headers | `immutable, 1 year` | Hash-named assets cached forever |

---

## 5. Local Development

### Prerequisites
- Node.js 20+ (check `.nvmrc`)
- Bun 1.1+ (`curl -fsSL https://bun.sh/install | bash`)
- Supabase project (or local PostgreSQL)

### Setup
```bash
# Clone
git clone https://github.com/bayhaqy/maa-btool.git
cd maa-btool

# Install dependencies
bun install

# Copy env template
cp .env.example .env
# Edit .env with your Supabase credentials

# Generate Prisma client
bun run db:generate

# Push schema to database (first time only)
bun run db:push

# Start dev server
bun run dev
```

### Available Scripts
| Script | Description |
|--------|-------------|
| `bun run dev` | Start dev server (port 3000) |
| `bun run build` | Production build (includes prisma generate) |
| `bun run start` | Start production server (standalone) |
| `bun run lint` | Run ESLint |
| `bun run type-check` | Run TypeScript type checker |
| `bun run db:push` | Push Prisma schema to database |
| `bun run db:generate` | Generate Prisma client |
| `bun run db:migrate` | Create & apply migration |
| `bun run db:studio` | Open Prisma Studio GUI |
| `bun run format` | Format code with Prettier |

---

## 6. Deployment Workflow

### Automatic (GitHub → Vercel)
```
git add .
git commit -m "feat: description"
git push origin main
# → Vercel auto-deploys to production (maa-btool.bayhaqy.my.id)
```

### Manual (Vercel CLI)
```bash
# Preview deployment
bun run vercel:deploy

# Production deployment
bun run vercel:prod
```

### Rollback
```bash
# List deployments
vercel ls

# Promote a previous deployment to production
vercel promote <deployment-id> --prod
```

---

## 7. Monitoring & Observability

- **Vercel Analytics**: Enabled (`@vercel/analytics`) — page view tracking
- **Vercel Speed Insights**: Enabled (`@vercel/speed-insights`) — Core Web Vitals
- **Health Check**: `GET /api/health` — returns database & service status
- **Deployment Info**: `GET /api/deployment-info` — returns runtime env metadata

---

## 8. Security Checklist

- [x] HSTS enabled (2 years + preload)
- [x] X-Frame-Options: SAMEORIGIN (clickjacking protection)
- [x] X-Content-Type-Options: nosniff (MIME sniffing protection)
- [x] Referrer-Policy: strict-origin-when-cross-origin
- [x] Permissions-Policy: camera/microphone/geolocation disabled
- [x] X-Powered-By header removed
- [x] No secrets in git (all in Vercel env vars)
- [x] `.env` files gitignored
- [x] Supabase RLS enabled
- [x] JWT-based authentication with httpOnly cookies
- [x] bcrypt password hashing
- [x] Rate limiting via Upstash Redis
