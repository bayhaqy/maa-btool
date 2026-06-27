# MAA BTOOL Enterprise MDM — PRD Executive Summary

**Version:** 2.1.0 · **Date:** June 27, 2026 · **Status:** Active — Continuous Development
**Production:** [maa-btool.bayhaqy.my.id](https://maa-btool.bayhaqy.my.id) · **Repo:** [github.com/bayhaqy/maa-btool](https://github.com/bayhaqy/maa-btool)
**Full PRD:** [`docs/PRD.md`](./PRD.md) (~1,250 lines)

---

## What is MAA BTOOL?

MAA BTOOL is the **single source of truth for master and reference data** across the MAP Group (PT Mitra Adiperkasa Tbk, IDX: MAPI) — Indonesia's largest premium lifestyle retail conglomerate. It unifies article, supplier, store, pricing, promotion, asset, and budget master data into one governed, auditable, AI-augmented system. Built natively on a serverless stack (Next.js 16 + Prisma + Supabase + Vercel), it delivers enterprise MDM capabilities comparable to Stibo Systems / Profisee / Semarchy at a fraction of the cost and deployment time.

## Target Users

- **6 MAP group companies** (tenants): MAPI (retail), MAPA (sports/lifestyle), MBA (F&B), MAPD (digital), MAPP (property), MAPL (logistics)
- **8 user roles** (from `rbac.ts`): Super Admin, Manager, Data Entry, Viewer, Doc Writer, API Manager, SFTP Manager, AI User
- **Multi-tenant** via `TenantCompany` — isolated data, shared schema

## Business Value

- ≥40% reduction in approval cycle time (maker-checker replaces email chains)
- 100% audit coverage on all mutations (SOX/PDP Law ready)
- ≥98% data completeness via upstream validation + lookup-driven dropdowns
- Self-serve Module Builder eliminates ERP customization requests
- In-product AI assistant lowers onboarding friction

## Tech Stack (key)

Next.js 16 (App Router) · TypeScript 5 · Prisma 6 · PostgreSQL/Supabase · Tailwind 4 · shadcn/ui (New York) · Zustand · TanStack Query · Zod · JWT+bcrypt · z-ai-web-dev-sdk (GLM-4-Plus) · Vercel (sin1) · GitHub Actions CI

## v2.1 Highlights (June 2026 — current release)

Driven by the **Stibo Systems benchmark research** (`mdm-research-findings.md`):

**P0 critical fixes:**
- Audit logging on all hierarchy + lookup mutations (was entirely missing)
- RBAC enforcement on hierarchy API (`hierarchy:read`/`hierarchy:write`)
- Non-destructive PUT on lookups (per-value upsert — fixes data-loss bug)
- Referential integrity check before deleting lookups (409 Conflict + soft-delete default)
- Where-used tracking (`_count.fields` + `/api/fields?lookupId=` + dialog)
- Removed `opacity-0 group-hover:opacity-100` (touch-device usability bug)
- Soft-delete on `LookupMaster` (`isActive=false` default)

**P1 enhancements:**
- Node status lifecycle (DRAFT/IN_REVIEW/ACTIVE/ARCHIVED) on `HierarchyNode`
- Search within tree + breadcrumb showing materialized path + Expand/Collapse All
- Effective dates (`validFrom`/`validTo`) + description + category on `LookupValue`/`LookupMaster`
- Expired/Upcoming/Active badges, "Used by N fields" badge, AlertDialog delete confirmation

## Core Functional Areas (15)

Dashboard · Module Builder (dynamic schema) · Data Records (CRUD + maker-checker + SCD Type 2) · Hierarchy Manager (materialized-path trees) · Lookup Manager (reference data) · Approval Workflow (ticket + field-by-field diff) · Bulk Import/Export (CSV `;` / XLSX) · Documentation Hub (markdown + multi-file upload) · AI Assistant (Claude-style, demo+live modes) · API Management (4 tabs) · SFTP Config · User/Role Admin · Audit Log · System Health · Branding/Settings

## Data Governance (Stibo-aligned)

- **6 data quality dimensions:** accuracy, completeness, consistency, timeliness, uniqueness, validity
- **RACI stewardship:** Data Producer → Data Steward → Data Owner → Data Trustee → Data Consumer
- **SCD Type 2 versioning** via `DataVersion` (validFrom/validTo)
- **Soft-delete + referential integrity** on lookups (no orphans, no destructive deletes)
- **Compliance:** GDPR, CCPA, PDP Law (Indonesia), SOX-ready audit trail

## Roadmap

- **v2.2 (next):** drag-and-drop reparenting, multi-tab node detail, attribute inheritance (Stibo killer feature), lookup approval workflow, translations, bulk import/export for lookups, transformation lookup tables
- **v3.0+:** enterprise knowledge graph, AI-powered classification (agentic MDM), hierarchy templates, virtualization for 10K+ nodes, version diff viewer, 360° cross-domain views, external reference data subscription, hash-chain tamper-evidence, full i18n + dark mode

## Key Non-Functional Targets

- Page LCP < 2s · API p50 < 500ms · AI TTFB < 5s · uptime ≥ 99.9%
- WCAG 2.1 AA · 44px touch targets · mobile-first responsive
- HSTS preload · X-Frame-Options · nosniff · Permissions-Policy (all via `vercel.json`)
- 22 Prisma models · 24 API routes · 8 RBAC roles

## Top Risks

1. Z.AI key/balance failure → mitigated by silent demo-mode fallback
2. Supabase free-tier limits → monitor + Pro upgrade before hit
3. Single-developer bus factor → this PRD + worklog + commit history mitigate
4. Prisma `db push --accept-data-loss` → all changes additive (nullable + defaults)
5. Concurrent record edits → `lockedBy` field (planned v2.2: timeout + optimistic concurrency)

---

*This summary is a 1-page executive overview. For the full specification (personas, all 15 functional areas, complete architecture, data governance, metrics, risks, appendices), see [`docs/PRD.md`](./PRD.md).*
