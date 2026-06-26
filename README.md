# MAA BTOOL — Enterprise Master Data Management

[![CI](https://github.com/bayhaqy/maa-btool/actions/workflows/ci.yml/badge.svg)](https://github.com/bayhaqy/maa-btool/actions/workflows/ci.yml)
[![Production](https://img.shields.io/badge/production-maa--tool.bayhaqy.my.id-emerald)](https://maa-btool.bayhaqy.my.id)
[![Framework](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![Runtime](https://img.shields.io/badge/Vercel-sin1-black)](https://vercel.com)

Enterprise Master Data Management platform for **MAP Group** (PT Mitra Adiperkasa Tbk).
Provides data governance, workflow approval, hierarchy management, and multi-tenant
data quality across business units.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Standalone output) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) |
| Database | PostgreSQL (Supabase) + Prisma ORM 6 |
| Caching | Upstash Redis (serverless Redis) |
| Auth | NextAuth.js + JWT + bcrypt |
| Email | Resend |
| AI | z-ai-web-dev-sdk (LLM, VLM, TTS, ASR) |
| Vector DB | Pinecone |
| Hosting | Vercel (Singapore region) |
| Package Manager | Bun |

## Quick Start

```bash
git clone https://github.com/bayhaqy/maa-btool.git
cd maa-btool
bun install
cp .env.example .env  # Fill in your credentials
bun run db:generate
bun run db:push
bun run dev
```

## Features

- **Master Data Management**: Article, Supplier, Store, Pricing, Budget, Asset, Promotion masters
- **Workflow Approval**: Multi-level approval workflow with change tracking
- **Role-Based Access Control**: Super Admin, Manager, Data Entry, Viewer, Doc Writer, API Manager, AI User
- **AI-Powered**: Chat assistant, image generation, document understanding, speech-to-text
- **Branding System**: Per-tenant company branding, logos, colors, sidebar styles
- **Onboarding Guide**: Role-aware interactive onboarding tour
- **Deployment Dashboard**: Live Vercel deployment status & best-practices checklist

## Documentation

- [Deployment & Operations Guide](./docs/DEPLOYMENT.md)
- [Prisma Schema](./prisma/schema.prisma)

## Production

- **URL**: [https://maa-btool.bayhaqy.my.id](https://maa-btool.bayhaqy.my.id)
- **Region**: Singapore (sin1)
- **Auto-deploy**: GitHub `main` branch → Vercel production

## License

Private — MAP Group (PT Mitra Adiperkasa Tbk)
