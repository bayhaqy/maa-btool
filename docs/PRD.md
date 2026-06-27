# MAA BTOOL Enterprise MDM — Product Requirements Document

**Version:** 2.1.0
**Date:** June 27, 2026
**Author:** Product Team
**Status:** Active — Continuous Development
**Repository:** [github.com/bayhaqy/maa-btool](https://github.com/bayhaqy/maa-btool)
**Production URL:** [maa-btool.bayhaqy.my.id](https://maa-btool.bayhaqy.my.id)
**Document Scope:** Full product specification covering v1.0 → v2.1 (released) and v2.2 → v3.0+ (planned)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Overview](#2-product-overview)
   - 2.1 What is MAA BTOOL?
   - 2.2 Target Market & Users
   - 2.3 Competitive Landscape
   - 2.4 Key Differentiators
3. [Goals & Objectives](#3-goals--objectives)
4. [User Personas & Roles](#4-user-personas--roles)
5. [Functional Requirements](#5-functional-requirements)
6. [Non-Functional Requirements](#6-non-functional-requirements)
7. [Technical Architecture](#7-technical-architecture)
8. [Data Governance](#8-data-governance)
9. [User Experience Principles](#9-user-experience-principles)
10. [Roadmap](#10-roadmap)
11. [Metrics & Analytics](#11-metrics--analytics)
12. [Risks & Mitigations](#12-risks--mitigations)
13. [Appendices](#13-appendices)

---

## 1. Executive Summary

### Product Vision
MAA BTOOL is the **single source of truth for master and reference data** across the MAP Group (PT Mitra Adiperkasa Tbk, IDX: MAPI) — Indonesia's largest premium lifestyle retail conglomerate. The platform unifies article, supplier, store, pricing, promotion, asset, and budget master data into one governed, auditable, AI-augmented system, replacing fragmented Excel sheets, siloed ERP modules, and email-based approval chains.

The vision is to deliver **enterprise-grade MDM capabilities** (comparable to Stibo Systems, Profisee, Semarchy) at a fraction of the cost and deployment time, built natively on a modern serverless stack that a small team can operate and extend without vendor lock-in.

### Target Users
- **Internal data stewards** at MAP group companies (MAPI, MAPA, MBA, MAPD, MAPP, MAPL) responsible for article, supplier, store, and pricing master data
- **Department managers** who need approval workflow visibility without learning an ERP
- **Integration engineers** who consume the REST API for downstream syncs (POS, e-commerce, BI)
- **Executive sponsors** who need dashboards on data quality and approval cycle time

### Business Value
- **Cycle-time reduction:** maker-checker approval workflow replaces email chains — measured target ≥40% reduction in average record approval time
- **Compliance readiness:** full audit trail (every create/update/delete logged with old/new values, actor, timestamp) supports SOX, GDPR, and internal MAP audit requirements
- **Reduced duplication:** unique-constraint enforcement + lookup-driven dropdowns eliminate free-text variants of the same entity (e.g., "Nike" vs "NIKE Inc.")
- **Faster onboarding:** schema-driven Module Builder lets a data steward define a new master-data entity in minutes, not weeks of ERP customization
- **AI augmentation:** in-product AI assistant lowers the learning curve and accelerates data steward productivity

### Current Status (v2.1 — June 2026)
The product is **live in production** at [maa-btool.bayhaqy.my.id](https://maa-btool.bayhaqy.my.id), auto-deployed from `main` on GitHub via Vercel (sin1 region). The v2.1 wave (Hierarchy & Lookup enhancement, June 2026) introduced audit logging, RBAC enforcement, soft-delete, referential integrity checks, where-used tracking, search/breadcrumb in trees, effective dates on lookup values, and node status lifecycle — closing the most critical gaps identified in the Stibo Systems benchmark research (see §8 and §10.2).

---

## 2. Product Overview

### 2.1 What is MAA BTOOL?

MAA BTOOL is a **multi-domain Master Data Management (MDM) platform** with the following architectural pillars:

| Pillar | Description |
|---|---|
| **Schema Engine** | Dynamic module/field definitions stored as metadata (not hardcoded). New master-data entities are created at runtime. |
| **Governance Layer** | RBAC, maker-checker approval workflow, audit trail, version history (SCD Type 2 pattern via `DataVersion`). |
| **Hierarchy Engine** | Materialized-path tree storage with self-relation, depth tracking, circular-reference prevention, node status lifecycle. |
| **Reference Data Layer** | `LookupMaster` + `LookupValue` with soft-delete, effective dates, descriptions, referential integrity, where-used tracking. |
| **Integration Layer** | Versioned REST API with API-key auth + rate limits, SFTP inbound/outbound sync, webhook-ready notification system. |
| **Knowledge Layer** | Markdown documentation hub with multi-file uploads and public read access for published articles. |
| **AI Layer** | Claude-style chat assistant with streaming, markdown rendering, conversation history (bookmark/pin/rename/delete), demo + live modes. |

### 2.2 Target Market & Users

#### MAP Group Operating Companies (Tenants)
The platform is multi-tenant via `TenantCompany`. Each MAP group company is a tenant with isolated data records but shared schema:

| Code | Company | Domain | Examples |
|---|---|---|---|
| **MAPI** | MAP Indah (retail) | Premium fashion & lifestyle retail | Zara, Marks & Spencer, Uniqlo, SOGO, SEIBU |
| **MAPA** | MAP Active (sports/lifestyle) | Sports apparel & footwear | Nike, Adidas, Converse, Vans, Puma |
| **MBA** | MAP Boga (F&B) | Food & beverage | Starbucks, Pizza Hut, Cold Stone |
| **MAPD** | MAP Digital | E-commerce & digital | MAPmalls, MAP eMall |
| **MAPP** | MAP Property | Real estate / malls | Grand Indonesia, Pondok Indah Mall |
| **MAPL** | MAP Logistics | Supply chain & distribution | Warehouse, distribution centers |

#### User Personas (8 roles)
See §4 for full personas. Roles are defined in `src/lib/rbac.ts` `ROLE_PERMISSIONS`:

1. **Super Admin** — full access (`['*']`)
2. **Manager** — read/write/delete/approve on data, hierarchies, docs, audit
3. **Data Entry** — read/write data + read-only on hierarchies/audit/docs
4. **Viewer** — read-only across data/docs/hierarchies/audit
5. **Doc Writer** — read/write documentation, read-only data
6. **API Manager** — manage API keys, read-only data/docs
7. **SFTP Manager** — manage SFTP configs, read-only data/docs
8. **AI User** — use AI assistant, read-only data/docs

### 2.3 Competitive Landscape

MAA BTOOL operates in the enterprise MDM market, benchmarked against the following leaders (per [Gartner MQ for MDM 2026](https://www.gartner.com/en/documents/master-data-management) and the research in `/home/z/my-project/mdm-research-findings.md`):

| Vendor | Positioning | Strengths | Where MAA BTOOL differs |
|---|---|---|---|
| **Stibo Systems** | Leader, multidomain MDM, "Trusted Intelligence Platform" | Attribute inheritance, STEP Workbench multi-tab UI, transformation lookup tables, agentic MDM, 40+ years | Serverless SaaS, faster deploy, lower TCO, modern React/TypeScript stack vs. Java/Swing-era UI |
| **Profisee** | Challenger, .NET-based MDM | Rapid implementation, financial services focus | Multi-tenant native, AI-native (in-product chat), no per-record licensing |
| **Semarchy** | Visionary, low-code MDM | xDM platform, intelligent data hub, designer-led | Schema-as-data (no proprietary modeler), works on free Supabase tier |
| **Informatica MDM** | Leader, enterprise MDM + EDC | Cloud + on-prem, integration breadth (IDQ, PowerCenter) | No integration tax, native Next.js serverless, opinionated workflow |
| **AtroPIM** | Niche, open-source PIM/MDM | Open source, PHP-based, product hierarchy depth | TypeScript end-to-end, hosted not self-hosted, governance-first not PIM-first |
| **Ataccama** | Leader, data quality + MDM | AI-driven data quality catalog, maker-checker | Built-in AI assistant for end users (not just data engineers) |

### 2.4 Key Differentiators

1. **Serverless-native, no infrastructure burden** — Deploys to Vercel with zero ops; auto-scales to zero; pay-per-request.
2. **Schema-as-data** — Module Builder lets non-engineers define master-data entities at runtime (no migrations required for new entity types).
3. **Governance-first defaults** — Maker-checker approval, audit trail, soft-delete, referential integrity are ON by default, not opt-in.
4. **AI-in-the-product** — In-context AI assistant (not a separate chatbot) with conversation persistence and demo-mode fallback so the product is usable even when AI credits are exhausted.
5. **Indonesian retail context** — Pre-configured for MAP Group company structure, Indonesian rupiah, GST/PPh tax codes, Bahasa Indonesia UI strings where it matters (onboarding, workflow dialogs).
6. **Modern UX** — shadcn/ui New York design system, Plus Jakarta Sans + Space Grotesk + JetBrains Mono typography (the "2026 viral standard"), mobile-first responsive, 44px touch targets.
7. **Red brand identity** — MAP Group's signature red primary color throughout (no indigo/blue), reinforcing corporate brand recognition.
8. **Open standards** — REST + JSON, JWT + API keys, PostgreSQL (Supabase), no proprietary query languages or vendor-specific runtimes.

---

## 3. Goals & Objectives

### 3.1 Business Goals

| # | Goal | Metric | Target |
|---|---|---|---|
| BG-1 | Reduce master-data approval cycle time | Avg hours from DRAFT to ACTIVE | < 4h (baseline TBD) |
| BG-2 | Eliminate duplicate master records | Duplicate rate by module | < 1% |
| BG-3 | Improve data completeness for downstream sync | % required fields populated on ACTIVE records | ≥ 98% |
| BG-4 | Provide auditable governance for SOX/internal audit | % of mutations with complete audit log | 100% |
| BG-5 | Reduce ERP customization requests | # of new "modules" created via Module Builder / quarter | ≥ 3 |
| BG-6 | Self-serve reference data management | # of lookup changes by non-Super-Admin / month | ≥ 10 |

### 3.2 Product Goals (v2.1 — Hierarchy & Lookup Enhancement Wave)

The v2.1 wave, completed in June 2026, focused on closing the most critical gaps identified in the Stibo Systems benchmark research (Task 21-A, 21-C):

- **P0 governance fixes:** audit logging on all hierarchy + lookup mutations; RBAC enforcement on hierarchy API (`hierarchy:read` / `hierarchy:write`).
- **P0 data-integrity fixes:** replace destructive PUT on lookups with per-value upsert (preserves IDs/isActive/createdAt); referential integrity check before delete (409 Conflict if referenced); soft-delete as default for `LookupMaster`.
- **P0 usability fixes:** remove `opacity-0 group-hover:opacity-100` from all action buttons (touch-device bug, same pattern as Task 20 AI Assistant fix).
- **P1 hierarchy enhancements:** node status lifecycle (DRAFT/IN_REVIEW/ACTIVE/ARCHIVED); search within tree; breadcrumb showing materialized path; Expand All / Collapse All.
- **P1 lookup enhancements:** effective dates (`validFrom`/`validTo`) on `LookupValue` with Expired/Upcoming/Active badges; description on values; category grouping (System/Custom/ISO); where-used tracking via `_count.fields` + `/api/fields?lookupId=` endpoint.

### 3.3 Success Metrics (KPIs)

**Product metrics** — Daily Active Users (DAU), Monthly Active Users (MAU), record creation rate, approval cycle time, AI conversation count.

**Data quality metrics** — Completeness %, accuracy %, duplicate rate, validation pass rate. See §11.

**System metrics** — API latency p50/p95, error rate (5xx), uptime, AI streaming TTFB.

**Business metrics** — Time-to-market for new products (from master data created to first sale), data-related incident count per quarter.

### 3.4 Non-Goals (v2.1)

The following are explicitly **out of scope** for v2.1 and deferred to v2.2+:

- Drag-and-drop reparenting of hierarchy nodes (planned v2.2, see §10.3)
- Attribute inheritance (Stibo's killer feature; planned v2.3, see §10.3)
- Multi-tab node detail view with Referenced By / References / Status / History tabs (planned v2.2)
- Approval workflow (maker-checker) for lookup changes by non-Super-Admin (planned v2.2)
- Translations / multi-language lookup values (planned v2.2)
- Bulk import/export for lookups (planned v2.2)
- Transformation lookup tables / From-To mappings (planned v2.3)
- Enterprise knowledge graph view (planned v3.0+)
- Virtualization for 1000+ node trees (planned v3.0+)

These non-goals are deliberate scope boundaries — the v2.1 wave prioritized **governance, security, and data-integrity fundamentals** over UX surface area, because no amount of UI polish compensates for missing audit trails or destructive data-loss bugs.

---

## 4. User Personas & Roles

The system defines 8 roles in `src/lib/rbac.ts` via the `ROLE_PERMISSIONS` map. Each role maps to a set of permission strings (`*`, `data:read`, `data:write`, `data:delete`, `data:approve`, `doc:read`, `doc:write`, `hierarchy:read`, `hierarchy:write`, `bulk:read`, `bulk:write`, `audit:read`, `api:manage`, `sftp:manage`, `ai:use`).

The `hasPermission()` helper short-circuits on `*` (Super Admin bypass). Module-level granular permissions (per-module `canRead`/`canWrite`/`canDelete`/`canApprove` via `RolePermission`) layer ON TOP of role-level permissions, allowing fine-grained access control per module per role.

### 4.1 Super Admin

| Attribute | Value |
|---|---|
| **Permissions** | `['*']` — full access, bypasses all checks |
| **Description** | System owner. Manages users, companies, roles, lookups, brand settings, all data, all integrations. The only role that can hard-delete lookups, manage API keys, manage SFTP configs, and access Admin pages. |
| **Primary use cases** | User onboarding/offboarding, role assignment, lookup master management, brand/settings changes, emergency data fixes, audit log review. |
| **Example workflows** | (1) New employee joins MAPA → create SysUser → assign "Data Entry" role scoped to MAPA company. (2) Need new "Country" lookup → Admin → Lookups → Create → add values with validFrom/validTo. (3) Suspicious activity reported → Audit Log → filter by user → review old/new values. |

### 4.2 Manager

| Attribute | Value |
|---|---|
| **Permissions** | `data:read, data:write, data:delete, data:approve, doc:read, doc:write, hierarchy:read, hierarchy:write, bulk:read, bulk:write, audit:read` |
| **Description** | Department head or data steward lead. Can create/edit/delete records, approve or reject tickets, edit hierarchies, run bulk imports, manage documentation. Cannot manage users, lookups, API keys, or SFTP. |
| **Primary use cases** | Approve/reject pending tickets, manage hierarchy structure, run bulk imports, write SOPs in Documentation Hub, review audit logs for their team. |
| **Example workflows** | (1) Approval queue has 5 pending records → Workflow → click "Lihat Detail Perubahan" → review field-by-field diff → Approve/Reject with notes. (2) Need to add new product category to hierarchy → Hierarchy → select tree → Add Child node → set status to IN_REVIEW. (3) Monthly bulk price update → Bulk Import → upload XLSX → review job results. |

### 4.3 Data Entry

| Attribute | Value |
|---|---|
| **Permissions** | `data:read, data:write, doc:read, hierarchy:read, bulk:read, bulk:write, audit:read` |
| **Description** | Frontline data creator. Creates and edits records (which go through approval workflow if module has `requireApproval: true`). Cannot delete, approve, or edit hierarchies. Read-only on docs and audit. |
| **Primary use cases** | Create new article/supplier/store records, edit existing ACTIVE records (triggers amendment workflow → REVISION_PENDING), run bulk imports for their team. |
| **Example workflows** | (1) New Nike Air Max 90 arrives → Data Records → ARTICLE_MASTER → Create → fill fields → Save as Draft or Submit for Review. (2) Price update on existing article → open record → Edit → save → record moves to REVISION_PENDING, approval ticket auto-created. (3) Bulk upload of 50 new suppliers → Bulk Import → paste CSV or upload file → review row-by-row results. |

### 4.4 Viewer

| Attribute | Value |
|---|---|
| **Permissions** | `data:read, doc:read, hierarchy:read, audit:read` |
| **Description** | Read-only consumer. Auditors, executives, downstream system owners who need visibility without write access. |
| **Primary use cases** | Review data for audit, browse documentation, view hierarchy structure, check audit log. |
| **Example workflows** | (1) Internal auditor reviews Q2 supplier master changes → Audit Log → filter entityType=DataRecord, moduleName=SUPPLIER_MASTER → export. (2) BI engineer reviews available fields in ARTICLE_MASTER → Modules → ARTICLE_MASTER → view fields. |

### 4.5 Doc Writer

| Attribute | Value |
|---|---|
| **Permissions** | `doc:read, doc:write, data:read` |
| **Description** | Technical writer / SOP owner. Creates and maintains documentation articles. Read-only on data so they understand the context without being able to modify it. |
| **Primary use cases** | Write SOPs for data entry, publish release notes, document approval workflows, embed images in articles. |
| **Example workflows** | (1) Write "How to create a new article" SOP → Documentation → New Article → markdown editor with live preview → upload screenshots → Publish. (2) Update "Supplier approval workflow" article after v2.1 hierarchy changes → edit → version bump. |

### 4.6 API Manager

| Attribute | Value |
|---|---|
| **Permissions** | `api:manage, data:read, doc:read` |
| **Description** | Integration engineer. Manages API keys for downstream consumers (POS, e-commerce, BI). Cannot see SFTP configs, hierarchies, or audit logs. |
| **Primary use cases** | Create/rotate/revoke API keys, set per-key permissions and rate limits, monitor API access logs, test endpoints via the in-product API playground. |
| **Example workflows** | (1) POS integration needs a new API key → API Management → Keys → Create → set permissions (`data:read` only) → set rate limit (100 req/min) → copy key once (never shown again). (2) Investigate 401 errors from BI tool → API Management → Access Logs → filter by key → review 401s. |

### 4.7 SFTP Manager

| Attribute | Value |
|---|---|
| **Permissions** | `sftp:manage, data:read, doc:read` |
| **Description** | Manages SFTP inbound/outbound sync configurations for batch integrations with legacy ERPs and partner systems. |
| **Primary use cases** | Configure SFTP connections (host, port, credentials, remote path), set sync schedule and direction (INBOUND/OUTBOUND), monitor sync logs. |
| **Example workflows** | (1) ERP exports a daily CSV of new articles to `/inbound/articles.csv` → SFTP → Create Config → set schedule (daily 02:00) → set file pattern → set module mapping. (2) Investigate failed sync → SFTP → Sync Logs → review error detail. |

### 4.8 AI User

| Attribute | Value |
|---|---|
| **Permissions** | `ai:use, data:read, doc:read` |
| **Description** | Power user of the AI assistant. Cannot modify any data — the role exists to give business analysts and knowledge workers access to the AI assistant for queries about data, workflows, and documentation. |
| **Primary use cases** | Ask the AI assistant how to perform a task, get explanations of record status, summarize documentation, draft SOPs. |
| **Example workflows** | (1) "How do I create a new record?" → AI responds with step-by-step markdown + code block showing status transitions. (2) "What's the difference between DRAFT and REVISION_PENDING?" → AI explains with reference to docs. (3) Bookmark a useful conversation → rename it → pin it for later reference. |

---

## 5. Functional Requirements

### 5.1 Dashboard & Analytics

**Requirement:** The dashboard (`src/components/mdm/DashboardPage.tsx`) provides an at-a-glance overview of the system state, accessible post-login.

**Functional requirements:**

- **FR-5.1.1:** Display KPI cards: total records, pending approvals, active modules, total users.
- **FR-5.1.2:** Display a records-by-status breakdown (DRAFT, IN_REVIEW, ACTIVE, REVISION_PENDING, REJECTED, ARCHIVED) using `STATUS_COLORS` from `constants.ts`.
- **FR-5.1.3:** Display a records-by-module bar chart (Recharts).
- **FR-5.1.4:** Display recent activity feed (last 10 audit log entries) for users with `audit:read`.
- **FR-5.1.5:** Display pending approvals count with a deep-link to the Workflow page for users with `data:approve`.
- **FR-5.1.6:** Role-aware rendering — hide admin cards (users, companies) from non-Super-Admin users.

### 5.2 Module Builder (Dynamic Schema)

**Requirement:** The Module Builder (`src/components/mdm/ModulesPage.tsx`, `ModuleDetailPage.tsx`) allows Super Admins and Managers to define new master-data entities at runtime without code changes or database migrations.

**Functional requirements:**

- **FR-5.2.1:** Create a `MetaModule` with `moduleCode` (unique), `moduleName`, `moduleIcon` (lucide icon name), `description`, `requireApproval` (default true), `isActive`, `sortOrder`.
- **FR-5.2.2:** Define `MetaField`s per module with the following `dataType` values:
  - `TEXT` — single-line text
  - `NUMBER` — numeric (integer or decimal)
  - `DATE` — date picker
  - `DATETIME` — date+time picker
  - `SELECT` — single-select dropdown (backed by `LookupMaster`)
  - `MULTISELECT` — multi-select (backed by `LookupMaster`)
  - `IMAGE` — image upload (stored as `ImageAsset` + `FileAsset`)
  - `FILE` — generic file upload
  - `BOOLEAN` — checkbox
  - `LOOKUP` — reference to a `LookupMaster`
  - `CALCULATED` — derived value (formula evaluation — planned v2.3)
  - `EMAIL`, `URL` — validated text variants
- **FR-5.2.3:** Per-field configuration: `fieldCode` (unique within module), `fieldName`, `isRequired`, `isUnique`, `defaultValue`, `placeholder`, `description`, `sortOrder`, `isActive`.
- **FR-5.2.4:** Per-field `FieldValidation` rules: `ruleType` (regex, min, max, minDate, maxDate, etc.), `ruleValue`, `errorMessage`.
- **FR-5.2.5:** Link a `SELECT`/`MULTISELECT`/`LOOKUP` field to a `LookupMaster` via `MetaField.lookupId`.
- **FR-5.2.6:** Granular per-role-per-module permissions via `RolePermission` (canRead, canWrite, canDelete, canApprove, columnRestrictions, rowFilter).

### 5.3 Data Records (CRUD with Approval Workflow)

**Requirement:** The Data Records feature (`src/components/mdm/DataRecordsPage.tsx`, `RecordDetailPage.tsx`) is the primary data-entry surface. It implements a strict maker-checker workflow with versioned history.

#### 5.3.1 Record Status Lifecycle

Defined in `src/lib/constants.ts`:

```
DRAFT ──submit──▶ IN_REVIEW ──approve──▶ ACTIVE
  │                  │                      │
  │                  │                      └──edit──▶ REVISION_PENDING ──submit──▶ IN_REVIEW
  │                  │
  │                  ├──reject──▶ REJECTED ──revise──▶ DRAFT
  │                  └──return──▶ DRAFT
  │
  └──archive──▶ ARCHIVED (terminal)
```

`STATE_TRANSITIONS` (validated server-side on every status change):

| From | Allowed To |
|---|---|
| `DRAFT` | `IN_REVIEW`, `ARCHIVED` |
| `IN_REVIEW` | `ACTIVE`, `REJECTED`, `DRAFT` |
| `ACTIVE` | `REVISION_PENDING`, `ARCHIVED` |
| `REVISION_PENDING` | `IN_REVIEW`, `ACTIVE` |
| `REJECTED` | `DRAFT`, `ARCHIVED` |
| `ARCHIVED` | (none — terminal) |

Status colors (`STATUS_COLORS`):
- `DRAFT` → gray
- `IN_REVIEW` → amber
- `ACTIVE` → emerald
- `REVISION_PENDING` → sky
- `REJECTED` → red
- `ARCHIVED` → slate

#### 5.3.2 Maker-Checker Workflow

- **Maker** (Data Entry, Manager) creates a record in `DRAFT`, then submits to `IN_REVIEW`.
- An `ApprovalTicket` is auto-created with `deltaPayload` containing the proposed changes.
- **Checker** (Manager, Super Admin) reviews the ticket in the Workflow page (`WorkflowPage.tsx`), opens the "Lihat Detail Perubahan" dialog showing a field-by-field diff (old value vs. new value, with field labels resolved from `MetaField.fieldName`).
- Checker approves (→ `ACTIVE`, creates a `DataVersion` snapshot, sets `validFrom=now`) or rejects (→ `REJECTED`, with `reviewNotes`).
- Maker can revise a `REJECTED` record (→ `DRAFT`) and resubmit.

#### 5.3.3 Amendment Workflow

Editing an `ACTIVE` record does NOT overwrite it. Instead:

1. Record transitions to `REVISION_PENDING`.
2. A new `ApprovalTicket` is created with the proposed changes in `deltaPayload`.
3. The original `currentPayload` is preserved (still readable as the "current" value).
4. On approval, a new `DataVersion` snapshot is created (`validTo` on the previous version, `validFrom=now` on the new), `currentPayload` is updated, and the record returns to `ACTIVE`.
5. On rejection, the record returns to `ACTIVE` with the original payload.

This implements an **SCD Type 2 (Slowly Changing Dimension)** pattern — at any point in time, you can query "what was the value of field X on date Y?" by joining `DataVersion` records.

#### 5.3.4 Field Types & Rendering

Each `MetaField.dataType` maps to a specific form control and display component:

| dataType | Form control | Validation | Display |
|---|---|---|---|
| TEXT | `<Input>` | maxLength, regex | plain text |
| NUMBER | `<Input type="number">` | min, max, step | formatted number |
| DATE | `<Calendar>` popover | minDate, maxDate | localized date |
| DATETIME | `<Calendar>` + time input | minDate, maxDate | localized datetime |
| SELECT | `<Select>` | required | badge with color |
| MULTISELECT | `<MultiSelect>` (cmdk) | required | comma-separated badges |
| IMAGE | `<ImageUpload>` (drag-drop) | max size 20MB, HEIC/AVIF/WebP | thumbnail gallery |
| FILE | `<FileUpload>` | max size 50MB | download link |
| BOOLEAN | `<Switch>` | none | yes/no badge |
| LOOKUP | `<Combobox>` (cmdk + search) | required, referential | code + display value |
| CALCULATED | read-only | formula | computed value |
| EMAIL | `<Input type="email">` | RFC 5322 | mailto link |
| URL | `<Input type="url">` | URL format | hyperlink |

#### 5.3.5 Record Locking

To prevent concurrent edits, `DataRecord.lockedBy` references the `SysUser` who currently has the record open for editing. Locks are acquired on edit-start and released on save/cancel (or expire after a configurable timeout — planned v2.2).

### 5.4 Hierarchy Manager (Enhanced in v2.1)

**Requirement:** The Hierarchy Manager (`src/components/mdm/HierarchyPage.tsx`, `HierarchyDetailPage.tsx`; API at `src/app/api/hierarchies/route.ts`) provides multi-level tree management for classification hierarchies (product categories, org charts, location hierarchies, etc.).

**Data model** (`prisma/schema.prisma`):
- `HierarchyModel` — id, moduleId, hierarchyName, description.
- `HierarchyNode` — id, hierarchyId, recordId (nullable, links to a DataRecord), parentNodeId (self-relation), nodeLabel, **materializedPath** (e.g., `/root/cat-a/subcat-b/`), **depthLevel**, sortOrder, isActive, **status** (DRAFT/IN_REVIEW/ACTIVE/ARCHIVED — NEW v2.1), description, createdAt, updatedAt.

#### v2.1 Enhancements (NEW)

- **FR-5.4.1 (Node status lifecycle):** `HierarchyNode.status` defaults to `DRAFT`. Transitions follow `STATE_TRANSITIONS` from `constants.ts`. Status badge shown per node in the tree (suppressed for `DRAFT` to reduce visual noise).
- **FR-5.4.2 (Search within tree):** Search input above the tree (`<Input placeholder="Search nodes..." />`). Recursively filters nodes; keeps ancestors of matches visible; highlights matches with `bg-yellow-100`; auto-expands the matched subtree. Uses a derived `effectiveExpanded` via `useMemo` (NOT setState-in-effect — compliant with the new `react-hooks/set-state-in-effect` lint rule).
- **FR-5.4.3 (Breadcrumb navigation):** When a node is selected, a breadcrumb above the tree shows the materialized path: `Root > Category > Subcategory > [Selected]`. Clicking any segment navigates the selection.
- **FR-5.4.4 (Expand All / Collapse All):** Two buttons above the tree (`ChevronsUpDown` / `ChevronsDownUp` icons) for bulk expand/collapse.
- **FR-5.4.5 (Click-to-select):** Clicking a node row selects it (ring highlight) and drives the breadcrumb.
- **FR-5.4.6 (Move Up/Down — FIXED):** Move Up/Down now performs a proper sibling swap (queries the sibling at `sortOrder ± 1` and atomically swaps sortOrder values in a transaction). *Note: the v2.1 implementation shipped the API + UI scaffolding; the full sibling-swap transaction logic is the v2.1.1 patch — see §10.2 known issue.*
- **FR-5.4.7 (RBAC enforcement):** All hierarchy API routes now call `checkAuthAndPermission(tokenPayload, 'hierarchy:read')` for GET and `checkAuthAndPermission(tokenPayload, 'hierarchy:write')` for POST/PUT/DELETE. Viewer and AI User roles are correctly restricted to read-only.
- **FR-5.4.8 (Audit logging):** All hierarchy mutations call `logAudit()` with actions `HIERARCHY_CREATE`, `HIERARCHY_UPDATE`, `HIERARCHY_DELETE`, `HIERARCHY_NODE_CREATE`, `HIERARCHY_NODE_UPDATE`, `HIERARCHY_NODE_DELETE`. Each log entry includes `oldValues` (fetched before mutation) and `newValues`.
- **FR-5.4.9 (Materialized path maintenance):** On reparent, the API recursively recalculates `materializedPath` and `depthLevel` for the moved node and all descendants. Circular-reference prevention: a node cannot be reparented under its own descendant (returns 422).
- **FR-5.4.10 (Touch-friendly action buttons):** Removed `opacity-0 group-hover:opacity-100` from all node action buttons (Add child, Move up/down, Edit, Delete, 3-dot menu). All buttons are now always visible at full opacity with `p-1.5 rounded-md hover:bg-background/80 transition-colors`.

#### Future (v2.2+ — see §10.3)

- Drag-and-drop reparenting (`@minoru/react-dnd-treeview`).
- Multi-tab node detail (Overview, Referenced By, References, Status, History).
- Attribute inheritance (value + attribute inheritance with override — Stibo's killer feature).
- Cross-tree references (References Tab + Referenced By Tab).
- Depth validation (`MAX_HIERARCHY_DEPTH = 7`).
- Virtualization for 1000+ node trees.

### 5.5 Lookup / Reference Data Manager (Enhanced in v2.1)

**Requirement:** The Lookup Manager (`src/components/mdm/AdminLookupsPage.tsx`; API at `src/app/api/admin/lookups/route.ts`) provides centralized management of reference data (countries, currencies, tax codes, payment terms, status enums, etc.).

**Data model:**
- `LookupMaster` — id, lookupCode (unique), lookupName, description, **category** (System/Custom/ISO — NEW v2.1), **isActive** (soft-delete — NEW v2.1), createdAt, updatedAt.
- `LookupValue` — id, lookupId, valueCode, displayValue, **description** (NEW v2.1), **validFrom** (NEW v2.1), **validTo** (NEW v2.1), isActive, sortOrder, createdAt, updatedAt. Unique constraint on `[lookupId, valueCode]`.

#### v2.1 Enhancements (NEW)

- **FR-5.5.1 (Soft-delete on LookupMaster):** `DELETE` defaults to soft-delete (sets `isActive=false` on master + all active values; audit action `LOOKUP_DEACTIVATE`). `?hardDelete=true` performs a true delete (audit action `LOOKUP_DELETE`), Super-Admin-only.
- **FR-5.5.2 (Referential integrity check):** Before delete, the API counts `MetaField` records where `lookupId = id`. If `fieldCount > 0` and the request is a hard-delete without `?force=true`, returns **409 Conflict** with the count of referencing fields. The frontend shows an amber warning: "⚠️ This lookup is referenced by N module field(s). Deactivating it may affect data entry on those fields."
- **FR-5.5.3 (Where-used tracking):** GET includes `_count: { select: { fields: true } }` per lookup. The frontend shows a "Used by N fields" badge per lookup card (amber if referenced, emerald if not). Clicking the badge opens a "Where Used" dialog that queries `/api/fields?lookupId=xxx` and shows a table of (Module, Field Code, Field Name) for every referencing `MetaField`.
- **FR-5.5.4 (Non-destructive PUT — FIXED):** Replaced the previous `deleteMany` + `createMany` pattern with per-value `db.lookupValue.upsert({ where: { lookupId_valueCode }})`. This preserves IDs, `isActive` state, and `createdAt` for values that already exist. Values not in the submitted array are soft-deleted (`updateMany({ data: { isActive: false }})`). This was the most dangerous bug in the lookup system prior to v2.1 — it silently destroyed external references and audit history.
- **FR-5.5.5 (Effective dates):** `LookupValue.validFrom` and `validTo` (nullable DateTimes). The frontend shows badges per value: "Active" (default), "Upcoming" (sky — `validFrom > now`), "Expired" (red — `validTo < now`), "Inactive" (gray — `isActive=false`). Date pickers in the value editor.
- **FR-5.5.6 (Description on values):** `LookupValue.description` (nullable string). Shown in the value editor and as a tooltip in the table.
- **FR-5.5.7 (Category grouping):** `LookupMaster.category` (nullable enum: `System`, `Custom`, `ISO`). Frontend shows a category badge (System=sky, Custom=violet, ISO=emerald).
- **FR-5.5.8 (Search/filter):** Frontend search input filters across `lookupName`, `lookupCode`, `description`, and `displayValue` of all values.
- **FR-5.5.9 (Audit logging):** All mutations call `logAudit()` with actions `LOOKUP_CREATE`, `LOOKUP_UPDATE`, `LOOKUP_DEACTIVATE`, `LOOKUP_DELETE`, including `oldValues` + `newValues`.
- **FR-5.5.10 (Inactive visual treatment):** Deactivated lookups render with `opacity-60` and an "Inactive" badge to visually distinguish them from active ones.
- **FR-5.5.11 (Delete confirmation):** AlertDialog before delete explains soft-delete behavior and, if `fieldCount > 0`, shows the amber referential-integrity warning.

#### Future (v2.2+ — see §10.3)

- Approval workflow (maker-checker for non-Super-Admin) — `LookupChangeRequest` model.
- Translations / multi-language lookup values (`LookupValueTranslation` model or `displayValues Json`).
- Bulk import/export (CSV/Excel endpoints `/api/admin/lookups/import` + `/export`).
- Transformation lookup tables (From-To mappings for normalization — Stibo pattern).
- External reference data subscription (sync ISO codes, country codes from external sources).
- Data quality rules on `LookupValue` (regex validation on `valueCode`).
- Favorites / recently used.
- Usage analytics (which values are most/least selected in forms).

### 5.6 Approval Workflow

**Requirement:** The Workflow page (`src/components/mdm/WorkflowPage.tsx`; API at `src/app/api/approvals/route.ts`) provides a queue of pending approval tickets and a detailed review surface.

**Functional requirements:**

- **FR-5.6.1:** `ApprovalTicket` model: id, recordId, requestedById, reviewedById (nullable), status (`PENDING`/`APPROVED`/`REJECTED`), deltaPayload (JSON of proposed changes), reviewNotes, createdAt, reviewedAt.
- **FR-5.6.2:** List view of pending tickets (filterable by status, module, requester, date range).
- **FR-5.6.3:** "Lihat Detail Perubahan" (View Change Details) dialog showing:
  - Ticket metadata (status, requester, reviewer, timestamps)
  - Record reference (module, record ID, current status)
  - Field-by-field diff table: Field Name | Old Value | New Value (with visual red/green highlight for changes)
  - `reviewNotes` textarea for the reviewer
  - Approve / Reject buttons
- **FR-5.6.4:** On approve: record transitions per `STATE_TRANSITIONS`, `DataVersion` snapshot created, `currentPayload` updated, ticket marked `APPROVED` with `reviewedAt=now`.
- **FR-5.6.5:** On reject: record transitions to `REJECTED`, ticket marked `REJECTED` with `reviewNotes`.
- **FR-5.6.6:** Audit log entry on every approve/reject action.
- **FR-5.6.7:** Notification to the requester (via `/api/notifications`) when their ticket is approved or rejected — planned v2.2.

### 5.7 Bulk Import / Export

**Requirement:** The Bulk Import feature (`src/components/mdm/BulkImportPage.tsx`; API at `src/app/api/bulk/route.ts`) allows mass creation or update of records via file upload or paste.

**Functional requirements:**

- **FR-5.7.1:** Supported formats: CSV (semicolon `;` delimiter — Indonesian locale default), XLSX, XLS.
- **FR-5.7.2:** Two input modes: file upload (drag-drop or click) OR paste data directly into a textarea.
- **FR-5.7.3:** Template download — generates a CSV template with headers from the selected module's `MetaField`s, including a "status" column and example rows.
- **FR-5.7.4:** `AsyncBatchJob` model tracks: userId, moduleId, jobType, status (`PENDING`/`PROCESSING`/`COMPLETED`/`FAILED`), totalRows, processedRows, failedRows, errorLog, fileName, resultFileUrl.
- **FR-5.7.5:** Row-by-row validation: required fields, unique constraints, lookup value validity (checks against `LookupMaster`), regex validations from `FieldValidation`.
- **FR-5.7.6:** Each imported record follows the standard approval workflow (created as `DRAFT` or `IN_REVIEW` depending on module's `requireApproval` flag).
- **FR-5.7.7:** Result report: success count, failure count, per-row error messages downloadable as CSV.
- **FR-5.7.8:** RBAC: requires `bulk:write` permission.

### 5.8 Documentation Hub

**Requirement:** The Documentation Hub (`src/components/mdm/DocumentationPage.tsx`; APIs at `/api/documentation` and `/api/documentation/public`) provides an internal knowledge base with public read access for published articles.

**Functional requirements:**

- **FR-5.8.1:** `Documentation` model: id, title, slug (unique), content (markdown), category, tags, authorId, version, sortOrder, isPublished, viewCount, timestamps.
- **FR-5.8.2:** Markdown editor with live preview (ReactMarkdown + remark-gfm + rehype-highlight).
- **FR-5.8.3:** Markdown toolbar: Bold, Italic, H1-H3, Code, List, Link, Quote.
- **FR-5.8.4:** Multi-file upload (images, PDFs, docs — up to 50MB per file) via `/api/doc-upload`. Files stored as `FileAsset` (database-backed Bytes) for Vercel read-only filesystem compatibility.
- **FR-5.8.5:** Category sidebar with article counts.
- **FR-5.8.6:** Search across title, content, tags.
- **FR-5.8.7:** Public read access: published articles (`isPublished=true`) are readable without authentication via `/api/documentation/public`. Used for SOPs that need to be accessible to all MAP employees.
- **FR-5.8.8:** Article view mode with full markdown rendering, image embedding, and code syntax highlighting.
- **FR-5.8.9:** Version tracking: each save increments `version`; planned v2.3 diff viewer for version comparison.
- **FR-5.8.10:** RBAC: write requires `doc:write`, read requires `doc:read` (or no auth for published articles).

### 5.9 AI Assistant

**Requirement:** The AI Assistant (`src/components/mdm/AiAssistantPage.tsx`; APIs at `/api/ai/chat` and `/api/ai/chat/stream`) provides an in-product Claude-AI-like chat experience for guidance, explanations, and drafting.

**Functional requirements:**

- **FR-5.9.1:** Claude-AI-like UI: conversation sidebar (left) + chat thread (right).
- **FR-5.9.2:** Conversation management: New Chat, Rename, Bookmark (toggle), Pin to top, Delete (with AlertDialog confirmation), search/filter (All / Starred / Pinned tabs).
- **FR-5.9.3:** Conversation metadata: relative timestamps ("1m ago", "6m ago", "18h ago"), message count per conversation.
- **FR-5.9.4:** Message rendering: markdown with syntax-highlighted code blocks, "Copy code" button overlay, "Copy message" action per message, token count display.
- **FR-5.9.5:** Suggested prompt cards in empty state: "Create a Record", "Approval Workflow", "Bulk Import", "Manage API Keys".
- **FR-5.9.6:** Auto-resize textarea with Send button (disabled when empty).
- **FR-5.9.7:** Streaming responses (server-sent events) via `/api/ai/chat/stream` for real-time token-by-token rendering.
- **FR-5.9.8:** **Two modes:**
  - **Demo Mode** (default): when `ZAI_API_KEY` env var is NOT set. Returns helpful markdown-formatted fallback responses (no scary errors). Badge shows "Demo Mode" (amber).
  - **Live AI Mode**: when `ZAI_API_KEY` is set. Calls Z.AI GLM-4-Plus (or configured model) for real AI responses. Badge shows "Live AI" (green).
- **FR-5.9.9:** Defensive fallback: if `ZAI_API_KEY` is set but the API call fails (expired key, insufficient balance, network error), the catch block silently falls back to demo-mode response — users NEVER see scary error messages. Errors are logged to console only.
- **FR-5.9.10:** RBAC: requires `ai:use` permission.
- **FR-5.9.11:** Conversation persistence: `AiConversation` model (id, userId, title, bookmarked, bookmarkedAt, pinned, timestamps) + `AiMessage` model (id, conversationId, userId, role, content, tokensUsed, createdAt).

### 5.10 API Management

**Requirement:** The API Management page (`src/components/mdm/ApiManagementPage.tsx`; API at `/api/api-keys`) provides 4 tabs: Keys, Documentation, Testing, Best Practices.

**Functional requirements:**

- **FR-5.10.1:** `ApiKey` model: id, keyName, keyHash (bcrypt), keyPrefix (first 8 chars for identification), companyId, userId, permissions (JSON), rateLimit (req/min, default 100), isActive, lastUsedAt, expiresAt, createdAt.
- **FR-5.10.2:** Create key: name, permissions, rate limit, expiry. Raw key shown ONCE in a dialog (cannot be retrieved later — only the hash is stored).
- **FR-5.10.3:** Revoke key (soft-delete: `isActive=false`).
- **FR-5.10.4:** `ApiAccessLog` model: id, apiKeyId, endpoint, method, statusCode, responseMs, ipAddress, userAgent, createdAt. Used for the access-log viewer.
- **FR-5.10.5:** Documentation tab: endpoint reference (auto-generated from route definitions), auth examples (Bearer token + API key), request/response examples.
- **FR-5.10.6:** Testing tab: API playground — select endpoint, method, headers, body, send request, view response (status, headers, body, timing).
- **FR-5.10.7:** Best Practices tab: security guidance (key rotation, scope minimization), rate limiting, error handling, integration patterns.
- **FR-5.10.8:** RBAC: requires `api:manage` permission.

### 5.11 SFTP Configuration

**Requirement:** The SFTP Management page (`src/components/mdm/SftpManagementPage.tsx`; API at `/api/sftp`) provides inbound/outbound SFTP sync configuration.

**Functional requirements:**

- **FR-5.11.1:** `SftpConfig` model: id, configName, host, port (default 22), username, authType (`PASSWORD`/`KEY`), authCredential (encrypted), remotePath, schedule (cron), syncDirection (`INBOUND`/`OUTBOUND`), filePattern, moduleId, isActive, lastSyncAt, companyId, timestamps.
- **FR-5.11.2:** `SftpSyncLog` model: id, sftpConfigId, syncStatus, filesSynced, filesFailed, errorDetail, startedAt, completedAt.
- **FR-5.11.3:** Create/edit/delete configs (Super Admin only).
- **FR-5.11.4:** Test connection button.
- **FR-5.11.5:** Manual sync trigger.
- **FR-5.11.6:** Sync log viewer per config.
- **FR-5.11.7:** RBAC: requires `sftp:manage` permission.

### 5.12 User & Role Administration

**Requirement:** The User and Role admin pages (`src/components/mdm/AdminUsersPage.tsx`, `AdminRolesPage.tsx`, `AdminCompaniesPage.tsx`; APIs at `/api/admin/users`, `/api/admin/roles`, `/api/admin/companies`) provide full IAM administration.

**Functional requirements:**

- **FR-5.12.1:** `SysUser` CRUD: username, email, passwordHash (bcrypt), displayName, avatarUrl, isActive, companyId.
- **FR-5.12.2:** Assign multiple roles per user (`UserRole` join table).
- **FR-5.12.3:** User impersonation (Super Admin only) via `/api/admin/users/impersonate` — for debugging user-reported issues. All impersonated actions are audit-logged with both the impersonator and impersonated user IDs.
- **FR-5.12.4:** Hard-delete user (Super Admin only, with referential check) via `/api/admin/users/hard-delete`.
- **FR-5.12.5:** `SysRole` CRUD: roleName, description, roleType (`DATA`/`DOC`/`API`/`SFTP`/`AI`/`SYSTEM`).
- **FR-5.12.6:** `RolePermission` per role per module: canRead, canWrite, canDelete, canApprove, columnRestrictions (JSON), rowFilter (JSON).
- **FR-5.12.7:** `TenantCompany` CRUD: companyCode, companyName, description, logoUrl, website, industry, parentCode, address, phone, email, isActive.
- **FR-5.12.8:** Password change (`/api/auth/change-password`) — requires current password.
- **FR-5.12.9:** RBAC: Super Admin only for all admin endpoints.

### 5.13 Audit Log

**Requirement:** The Audit Log page (`src/components/mdm/AuditLogPage.tsx`; API at `/api/audit`) provides a searchable, filterable record of every mutation in the system.

**Functional requirements:**

- **FR-5.13.1:** `AuditLog` model: id, userId, action, entityType, entityId, moduleName, description, oldValues (JSON), newValues (JSON), companyId, ipAddress, userAgent, createdAt.
- **FR-5.13.2:** Filter by: user, action, entityType, moduleName, date range.
- **FR-5.13.3:** Search across description, entityId.
- **FR-5.13.4:** Detail view: shows old/new values as a diff table.
- **FR-5.13.5:** Export to CSV (planned v2.2).
- **FR-5.13.6:** Tamper-evidence: audit logs are append-only (no UPDATE or DELETE in the API). Planned v3.0: hash-chain for cryptographic tamper-evidence.
- **FR-5.13.7:** RBAC: requires `audit:read` permission.

**Coverage (as of v2.1):** All DataRecord, ApprovalTicket, Hierarchy, HierarchyNode, LookupMaster, LookupValue, SysUser, SysRole, TenantCompany, ApiKey, SftpConfig, Documentation mutations are audit-logged. This was a P0 fix in v2.1 — previously hierarchy and lookup mutations were NOT logged (see §10.2).

### 5.14 System Health & Deployment Info

**Requirement:** The System Health page (`src/components/mdm/SystemHealthPage.tsx`, `DeploymentChecklist.tsx`; APIs at `/api/health`, `/api/deployment-info`) provides operational visibility.

**Functional requirements:**

- **FR-5.14.1:** `/api/health` endpoint returns: status (`ok`/`degraded`/`down`), database connectivity, response time, version, environment, timestamp. Mapped to `/health` via `vercel.json` rewrite.
- **FR-5.14.2:** Deployment info: Git SHA, branch, build time, Vercel deployment URL, region, Next.js version, environment (production/preview/development).
- **FR-5.14.3:** Deployment checklist: pre-deploy verification (env vars set, database migrated, seed data present, build passes, lint passes, type-check passes).
- **FR-5.14.4:** Vercel Analytics + Speed Insights integration (real-user monitoring).
- **FR-5.14.5:** RBAC: Super Admin only.

### 5.15 Branding & Settings

**Requirement:** The Settings page (`src/components/mdm/BrandSettingsPage.tsx`; API at `/api/settings`) provides system-wide branding and configuration.

**Functional requirements:**

- **FR-5.15.1:** `AppSettings` model: settingKey (unique), settingValue, updatedById, updatedAt.
- **FR-5.15.2:** Settings persisted to BOTH database (for server-side reads) and localStorage (for instant client-side reads).
- **FR-5.15.3:** Configurable: brand name, logo URL, primary color (defaults to MAP red), sidebar items visibility, default landing page.
- **FR-5.15.4:** About page (`src/components/mdm/AboutPage.tsx`): developer info, key features showcase, technology stack, MAP Group company info.
- **FR-5.15.5:** RBAC: Super Admin only for write; all authenticated users read via `BrandingProvider`.

---

## 6. Non-Functional Requirements

### 6.1 Performance

| Metric | Target | Measurement |
|---|---|---|
| Page load (LCP) | < 2.0s on 4G | Vercel Speed Insights (RUM) |
| API p50 latency | < 500ms | Vercel Analytics + `/api/health` |
| API p95 latency | < 2.0s | Vercel Analytics |
| AI streaming TTFB | < 5.0s | Server log timing |
| Database query p95 | < 200ms | Prisma query logging (dev only) |
| First Contentful Paint | < 1.5s | Lighthouse CI |
| Total bundle size (initial) | < 300KB gzip | `next build` output |
| Image upload (20MB) | < 10s end-to-end | Manual + automated |

**Optimizations in place:**
- Next.js 16 `output: "standalone"` for minimal server bundle.
- `experimental.optimizePackageImports` for `lucide-react`, `framer-motion`, `recharts`, `date-fns`, `react-markdown`, `@tanstack/react-table` (tree-shaking).
- 30-day immutable cache on `/_next/static/*` and static file extensions (`vercel.json` + `next.config.ts` headers).
- AVIF + WebP image formats, 30-day minimum cache TTL.
- Supabase connection pooling (PgBouncer) for serverless connection reuse.
- AI routes configured with `memory: 1024, maxDuration: 60` (vs. default 512MB / 30s).

### 6.2 Security

| Control | Implementation |
|---|---|
| Authentication | Custom JWT (bcrypt password hashing) + optional NextAuth.js + optional Clerk integration |
| Authorization | RBAC via `ROLE_PERMISSIONS` + granular per-module `RolePermission` |
| API auth | Bearer token (JWT) for session, API key (bcrypt-hashed) for programmatic |
| Password storage | bcrypt (via `bcryptjs`) |
| Secret storage | Vercel encrypted env vars (never in git) |
| Security headers | HSTS (2yr, includeSubDomains, preload), X-Frame-Options: SAMEORIGIN, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy: camera/mic/geo/topics off, X-DNS-Prefetch-Control: on — all enforced in `vercel.json` |
| Powered-By header | Removed (`poweredByHeader: false` in `next.config.ts`) |
| Rate limiting | Per-API-key rate limit (default 100 req/min); planned Upstash Redis backing (currently in-memory fallback) |
| CSRF | JWT in `Authorization` header (not cookie) — CSRF not applicable for API; cookie-based auth routes use SameSite |
| Input validation | Zod schemas on all API inputs (planned full coverage — currently ad-hoc) |
| SQL injection | Prisma ORM parameterized queries (no raw SQL) |
| XSS | React auto-escapes; markdown rendered via `react-markdown` (sanitized); no `dangerouslySetInnerHTML` |
| File upload security | MIME-type whitelist, size limits (20MB images, 50MB docs), file content sniffing (planned) |
| Audit trail | Append-only `AuditLog` table; all mutations logged with old/new values + actor + IP + userAgent |

### 6.3 Scalability

- **Database:** Supabase PostgreSQL with PgBouncer connection pooling (max 200 concurrent connections on the free → pro tier).
- **Compute:** Vercel serverless functions — auto-scale to zero, pay-per-request. Configured memory/duration per route (`vercel.json` `functions`).
- **State:** Stateless API routes — all state in PostgreSQL. No server-side sessions (JWT in client).
- **Cache:** Upstash Redis for rate-limit counters and hot reads (in-memory fallback if Redis unavailable).
- **File storage:** Database-backed (`FileAsset.Bytes`) for Vercel read-only filesystem compatibility. Planned v3.0: migration to S3/Blob storage for >100GB.
- **Target scale:** 1,000 concurrent users, 1M records per module, 100K audit log entries per month. Beyond this, planned sharding by `companyId`.

### 6.4 Availability

- **Hosting:** Vercel with auto-deploy from `main` branch on GitHub.
- **Region:** `sin1` (Singapore — closest to Indonesia users).
- **Uptime target:** 99.9% (Vercel SLA is 99.99% for Pro).
- **Rollback:** Vercel instant rollback to any previous deployment via dashboard or CLI.
- **Database backups:** Supabase daily automatic backups + 7-day point-in-time recovery (Pro tier).
- **Disaster recovery:** RPO = 24h (daily backup), RTO = 1h (redeploy from GitHub + restore backup).
- **Health check:** `/api/health` (mapped to `/health`) for uptime monitoring (planned UptimeRobot or BetterStack integration).

### 6.5 Accessibility

- **Standard:** WCAG 2.1 AA.
- **Semantic HTML:** `<nav>`, `<main>`, `<aside>`, `<section>`, `<article>` throughout.
- **ARIA:** `aria-label` on all icon-only buttons, `aria-describedby` on form fields, `role="dialog"` on modals (via Radix primitives).
- **Keyboard navigation:** Full keyboard support — Tab/Shift+Tab for focus, Enter/Space for activation, Esc for dialog dismissal (Radix handles this).
- **Focus management:** Visible focus rings (`focus-visible:ring-2`); focus trap in dialogs (Radix).
- **Color contrast:** All text/background combinations meet 4.5:1 (normal text) or 3:1 (large text) per WCAG AA.
- **Screen reader testing:** Planned NVDA + VoiceOver regression suite (v2.2).
- **Reduced motion:** `prefers-reduced-motion` respected via `tw-animate-css`.

### 6.6 Internationalization

- **Primary UI language:** English (technical product document, developer-facing surfaces).
- **Secondary language:** Bahasa Indonesia for onboarding dialogs, workflow status labels in user-facing surfaces, and the onboarding guided tour.
- **Framework:** `next-intl` installed (planned full activation v2.2 — currently English-only UI with Indonesian onboarding strings).
- **Date/time:** `date-fns` with locale support (`id` for Indonesian, `en-US` default).
- **Number/currency:** IDR (Rupiah) formatting for financial modules; USD fallback.
- **RTL support:** Not in scope (no Arabic/Hebrew users currently).

### 6.7 Browser Support

| Browser | Versions |
|---|---|
| Chrome | Latest 2 major versions |
| Firefox | Latest 2 major versions |
| Safari | Latest 2 major versions (incl. iOS Safari) |
| Edge | Latest 2 major versions |
| Samsung Internet | Latest (Indonesian mobile market share) |

**Not supported:** IE 11, Chrome <100, Firefox <100. Next.js 16 itself drops IE 11 support.

### 6.8 Mobile Responsiveness

- **Approach:** Mobile-first responsive design via Tailwind CSS 4 breakpoints (`sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px, `2xl` 1536px).
- **Touch targets:** Minimum 44×44px (`p-1.5` = 24px+ on icon buttons; larger for primary CTAs).
- **Sidebar:** Collapsible to icon-only on tablet, drawer on mobile (via `Sheet`).
- **Tables:** Horizontal scroll on mobile (`overflow-x-auto`); planned card view for narrow screens (v2.2).
- **Forms:** Single-column on mobile, multi-column on desktop.
- **Tested on:** iPhone SE (375px), iPhone 14 Pro (393px), iPad (768px), iPad Pro (1024px), desktop 1440px.

---

## 7. Technical Architecture

### 7.1 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER AGENTS                                │
│  Desktop browsers (Chrome/FF/Safari/Edge)  •  Mobile browsers  •  curl  │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ HTTPS
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       VERCEL EDGE NETWORK (sin1)                        │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Security headers (HSTS, X-Frame-Options, etc.) — vercel.json     │  │
│  │  Static asset cache (immutable, 1yr)                              │  │
│  │  Image optimization (AVIF/WebP)                                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  NEXT.JS 16 SERVERLESS FUNCTIONS                        │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌────────────────┐  │
│  │  App Router Pages   │  │  /api/* REST routes  │  │  /api/ai/chat  │  │
│  │  (SSR + RSC)        │  │  (JWT auth + RBAC)   │  │  /stream (SSE) │  │
│  └──────────┬──────────┘  └──────────┬──────────┘  └───────┬────────┘  │
│             │                         │                     │           │
│             └────────────┬────────────┘                     │           │
│                          ▼                                  ▼           │
│  ┌──────────────────────────────────┐   ┌────────────────────────────┐ │
│  │  Prisma Client 6.x (ORM)         │   │  z-ai-web-dev-sdk (Z.AI)   │ │
│  │  - Schema-as-code                │   │  - GLM-4-Plus              │ │
│  │  - Type-safe queries             │   │  - Streaming               │ │
│  │  - Migrations (db push)          │   │  - Fallback to demo mode   │ │
│  └──────────────┬───────────────────┘   └────────────────────────────┘ │
└─────────────────┼───────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              SUPABASE POSTGRESQL (sin1, PgBouncer pooled)               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ IAM      │ │ Metadata │ │ Core     │ │ Workflow │ │ Hierarchy    │  │
│  │ TenantCo │ │ MetaMod  │ │ DataRec  │ │ ApprovTk │ │ HierarchyMod │  │
│  │ SysUser  │ │ MetaField│ │ DataVer  │ │ AsyncJob │ │ HierarchyNode│  │
│  │ SysRole  │ │ LookupM  │ │ ImageAst │ │          │ │              │  │
│  │ UserRole │ │ LookupV  │ │ FileAst  │ │          │ │              │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ API Mgmt │ │ SFTP     │ │ Docs     │ │ Audit    │ │ AI           │  │
│  │ ApiKey   │ │ SftpCfg  │ │ Doc      │ │ AuditLog │ │ AiConv       │  │
│  │ ApiAccLog│ │ SftpSync │ │          │ │          │ │ AiMessage    │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                  │
                  ▼ (optional, graceful degradation)
┌─────────────────────────────────────────────────────────────────────────┐
│  UPSTASH REDIS (rate limit + cache)  •  RESEND (email)  •  PINECONE    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Technology Stack

| Component | Technology | Version | Rationale |
|---|---|---|---|
| Framework | Next.js (App Router) | 16.1.x | Latest React 19 + RSC + server actions + standalone output |
| Language | TypeScript | 5.x | Type safety end-to-end; `tsc --noEmit` in CI |
| Runtime | Bun (dev/build) + Node.js 20+ (production) | Bun 1.2.x | 3x faster install + scripts; Node for Vercel compat |
| ORM | Prisma | 6.11.x | Type-safe queries, schema-as-code, migrations via `db push` |
| Database | PostgreSQL (Supabase) | 15+ | Battle-tested RDBMS; Supabase adds PgBouncer + backups + dashboard |
| UI primitives | shadcn/ui (New York) | latest | Copy-paste components, Radix-based, fully customizable |
| Styling | Tailwind CSS | 4.x | Utility-first, JIT, dark mode, container queries |
| State (client) | Zustand | 5.x | Minimal, no boilerplate, works outside React |
| State (server) | TanStack Query | 5.x | Cache, invalidation, optimistic updates |
| Forms | React Hook Form + Zod | 7.x / 4.x | Performant, schema-validated |
| Auth | Custom JWT + bcryptjs + jsonwebtoken | 9.x / 3.x | Simple, no vendor lock-in; Clerk SDK installed as optional |
| Charts | Recharts | 2.15.x | React-native, declarative |
| Markdown | react-markdown + remark-gfm + rehype-highlight | 10.x / 4.x / 7.x | GFM tables, syntax highlighting |
| AI SDK | z-ai-web-dev-sdk | 0.0.18 | Z.AI GLM models; demo-mode fallback |
| File parsing | xlsx (SheetJS) | 0.18.x | CSV/XLSX/XLS import |
| Email | Resend | 6.x | Transactional email (notifications — planned) |
| Cache | Upstash Redis | 1.38.x | Serverless Redis (rate limit, hot reads) |
| Vector DB | Pinecone | 8.x | Documentation semantic search (planned) |
| Icons | lucide-react | 0.525.x | Tree-shakeable, consistent |
| Animation | framer-motion | 12.x | Page transitions, micro-interactions |
| Fonts | Plus Jakarta Sans + Space Grotesk + JetBrains Mono | next/font/google | 2026 viral typography standard |
| Deployment | Vercel | latest | Auto-deploy from GitHub, sin1 region, serverless |
| CI | GitHub Actions | latest | lint + type-check on PR (advisory, non-blocking) |
| Monitoring | Vercel Analytics + Speed Insights | 2.x | Real-user monitoring |

### 7.3 Data Model

The Prisma schema (`prisma/schema.prisma`) defines 22 models organized into 10 domain sections:

#### 1. IAM & Security Domain
- **TenantCompany** — multi-tenant isolation; companyCode unique; parentCode for group hierarchy.
- **SysUser** — username/email unique; bcrypt passwordHash; companyId; relations to roles, audit logs, approvals, AI conversations.
- **SysRole** — roleName unique; roleType (`DATA`/`DOC`/`API`/`SFTP`/`AI`/`SYSTEM`).
- **UserRole** — many-to-many join (userId, roleId) with `@@unique`.
- **RolePermission** — granular per-role-per-module permissions (canRead, canWrite, canDelete, canApprove, columnRestrictions JSON, rowFilter JSON).

#### 2. Metadata & Schema Engine
- **MetaModule** — moduleCode unique; requireApproval flag; isActive; sortOrder.
- **MetaField** — fieldCode unique within module; dataType enum; isRequired, isUnique, defaultValue, placeholder; lookupId (FK to LookupMaster).
- **FieldValidation** — ruleType, ruleValue, errorMessage per field.

#### 3. Lookup / Reference Data
- **LookupMaster** — lookupCode unique; category (System/Custom/ISO); isActive (soft-delete).
- **LookupValue** — valueCode unique within lookup; displayValue; description; validFrom/validTo (effective dates); isActive; sortOrder.

#### 4. Core Data & Audit (SCD Type 2)
- **DataRecord** — moduleId, companyId, status, currentPayload (JSON string), lockedBy, version counter.
- **DataVersion** — payloadSnapshot, versionNumber, changedById, changeReason, status, validFrom, validTo (SCD Type 2).

#### 5. Hierarchy Engine
- **HierarchyModel** — moduleId, hierarchyName, description.
- **HierarchyNode** — self-relation via `parentNodeId` (`@relation("HierarchyTree")`); materializedPath; depthLevel; sortOrder; status (DRAFT/IN_REVIEW/ACTIVE/ARCHIVED); description; recordId (optional link to DataRecord).

#### 6. Workflow & Async Jobs
- **ApprovalTicket** — recordId, requestedById, reviewedById, status (PENDING/APPROVED/REJECTED), deltaPayload, reviewNotes.
- **AsyncBatchJob** — userId, moduleId, jobType, status, totalRows, processedRows, failedRows, errorLog.

#### 7. Image & File Asset Management
- **ImageAsset** — recordId, fieldName, fileName, filePath, fileSize, mimeType, altText, isPrimary.
- **FileAsset** — fileName, fileData (Bytes — database-backed for Vercel), mimeType, fileSize, category.

#### 8. API Integration
- **ApiKey** — keyName, keyHash (bcrypt), keyPrefix, permissions JSON, rateLimit, expiresAt.
- **ApiAccessLog** — apiKeyId, endpoint, method, statusCode, responseMs, ipAddress, userAgent.

#### 9. SFTP Integration
- **SftpConfig** — configName, host, port, username, authType, authCredential (encrypted), remotePath, schedule, syncDirection, filePattern.
- **SftpSyncLog** — sftpConfigId, syncStatus, filesSynced, filesFailed, errorDetail.

#### 10. Documentation, AI, Audit, Settings
- **Documentation** — title, slug unique, content (markdown), category, tags, version, isPublished, viewCount.
- **AiConversation** — userId, title, bookmarked, bookmarkedAt, pinned.
- **AiMessage** — conversationId, role, content, tokensUsed.
- **AuditLog** — userId, action, entityType, entityId, moduleName, description, oldValues, newValues, companyId, ipAddress, userAgent.
- **AppSettings** — settingKey unique, settingValue, updatedById.

### 7.4 API Design

**Style:** RESTful, JSON request/response.

**Base URL:** `https://maa-btool.bayhaqy.my.id/api`

**Authentication:**
- Session: `Authorization: Bearer <JWT>` (issued by `/api/auth/login`, 7-day expiry, signed with `JWT_SECRET`).
- Programmatic: `X-API-Key: <api-key>` (for integrations; rate-limited per key).

**Routes** (24 route files under `src/app/api/`):

| Route | Methods | Purpose |
|---|---|---|
| `/api/auth/login` | POST | Authenticate, return JWT |
| `/api/auth/me` | GET | Current user profile + permissions |
| `/api/auth/permissions` | GET | Permission list for current user |
| `/api/auth/change-password` | POST | Change own password |
| `/api/modules` | GET, POST | List/create modules |
| `/api/fields` | GET, POST | List/create fields (supports `?lookupId=` for where-used) |
| `/api/records` | GET, POST, PUT, DELETE | CRUD records |
| `/api/approvals` | GET, POST | List/approve tickets |
| `/api/bulk` | POST | Bulk import |
| `/api/hierarchies` | GET, POST, PUT, DELETE | Hierarchy + node CRUD |
| `/api/admin/lookups` | GET, POST, PUT, DELETE | Lookup master + value CRUD (Super Admin) |
| `/api/admin/users` | GET, POST, PUT | User CRUD (Super Admin) |
| `/api/admin/users/impersonate` | POST | Impersonate user (Super Admin) |
| `/api/admin/users/hard-delete` | POST | Hard-delete user (Super Admin) |
| `/api/admin/roles` | GET, POST, PUT | Role CRUD (Super Admin) |
| `/api/admin/companies` | GET, POST, PUT | Tenant company CRUD (Super Admin) |
| `/api/api-keys` | GET, POST, DELETE | API key management |
| `/api/sftp` | GET, POST, PUT, DELETE | SFTP config management |
| `/api/documentation` | GET, POST, PUT, DELETE | Documentation CRUD (auth required) |
| `/api/documentation/public` | GET | Public published docs (no auth) |
| `/api/doc-upload` | POST | Multi-file upload for docs |
| `/api/images` | POST | Image upload for records |
| `/api/uploads/[path]` | GET | Serve uploaded files |
| `/api/ai/chat` | POST | Non-streaming AI chat |
| `/api/ai/chat/stream` | POST | Streaming AI chat (SSE) |
| `/api/audit` | GET | Audit log query |
| `/api/notifications` | GET, POST | User notifications |
| `/api/settings` | GET, PUT | App settings |
| `/api/health` | GET | Health check (also at `/health`) |
| `/api/deployment-info` | GET | Deployment metadata (Super Admin) |
| `/api/seed` | POST | Initial seed (admin) |
| `/api/seed-data` | POST | Sample data seed (idempotent) |

**Response format:**
```json
{
  "data": { ... } | [ ... ],
  "meta": { "page": 1, "pageSize": 20, "total": 142 }
}
```
Errors:
```json
{
  "error": "Insufficient permissions. Required: hierarchy:write",
  "status": 403
}
```

### 7.5 Authentication & Authorization

**Authentication flow:**
1. User POSTs `/api/auth/login` with `{ username, password }`.
2. Server fetches `SysUser` by username, verifies password with `bcryptjs.compare()`.
3. Server loads user's roles via `UserRole` → `SysRole`.
4. Server signs JWT with `JWT_SECRET` (env var), payload: `{ userId, username, companyId, roles, exp }` (7-day expiry).
5. Client stores JWT in localStorage (or httpOnly cookie — planned v2.2), sends as `Authorization: Bearer <jwt>` on every API call.

**Authorization flow (per request):**
1. API route calls `getTokenFromHeaders(request)` → returns `TokenPayload | null`.
2. If null → 401 Unauthorized.
3. Route calls `checkAuthAndPermission(tokenPayload, '<permission>')` → returns `{ error?, status? }`.
4. If error → return 403 Forbidden with message.
5. For module-specific operations, route calls `checkModulePermission(roles, moduleId, action)` → checks both role-level and granular `RolePermission`.
6. Super Admin (`roles.includes('Super Admin')`) bypasses all checks via `hasPermission(['*'])`.

### 7.6 Database

- **Provider:** PostgreSQL 15+ via Supabase.
- **Connection:** Direct URL (for migrations via `prisma db push`) + pooled URL via PgBouncer (for runtime queries).
- **Connection pooling:** Supabase PgBouncer in transaction mode (max 200 concurrent on Pro tier).
- **Migrations:** `prisma db push --accept-data-loss` (additive-only changes are safe; destructive changes require manual review). Run in Vercel build script: `prisma generate && prisma db push --accept-data-loss && next build`.
- **Backups:** Supabase daily automatic + 7-day PITR (Pro tier).
- **Indexes:** Defined inline in Prisma schema (`@@unique`, `@@index` — planned additions for hot query paths).
- **Multi-tenancy:** Row-level isolation via `companyId` on `DataRecord`, `ApiKey`, `SftpConfig`. Planned v2.2: Row-Level Security (RLS) policies at the database level for defense-in-depth.

### 7.7 Deployment

- **Platform:** Vercel, auto-deploy from `main` branch on GitHub (repo: `bayhaqy/maa-btool`).
- **Region:** `sin1` (Singapore — lowest latency to Indonesia users).
- **Build command:** `bun run build` (= `prisma generate && prisma db push --accept-data-loss && next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/`).
- **Install command:** `bun install`.
- **Output:** `output: "standalone"` — minimal server bundle in `.next/standalone/`.
- **Preview deploys:** Every PR gets a preview deployment at `<branch>.maa-btool.vercel.app` for testing.
- **Production URL:** `https://maa-btool.bayhaqy.my.id` (custom domain) + `https://maa-btool.vercel.app` (default).
- **Environment variables:** 14 vars configured via Vercel API (encrypted, all environments): `DATABASE_URL`, `DIRECT_DATABASE_URL`, `JWT_SECRET`, `NEXTAUTH_SECRET`, `CLERK_SECRET_KEY`, `RESEND_API_KEY`, `PINECONE_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, etc. `ZAI_API_KEY` is intentionally NOT set (demo-mode fallback — see §5.9).

### 7.8 CI/CD

- **CI:** GitHub Actions workflow (`.github/workflows/`).
- **Steps:** `bun install` → `bun run lint` → `bun run type-check`. Both are `continue-on-error: true` (advisory, non-blocking) — matches `next.config.ts` `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true` that Vercel uses.
- **Trigger:** On PR and on push to `main`.
- **CD:** Vercel auto-deploys on push to `main` (production) and on PR (preview).
- **No CI/CD for staging:** Staging IS preview deploys. No separate staging environment.

### 7.9 Monitoring

- **Real-user monitoring (RUM):** Vercel Analytics (`@vercel/analytics`) — page views, top pages, referrers, visitor geography.
- **Performance monitoring:** Vercel Speed Insights (`@vercel/speed-insights`) — Core Web Vitals (LCP, FID, CLS, INP).
- **Health endpoint:** `/api/health` (mapped to `/health` via `vercel.json` rewrite) returns `{ status, database, responseTime, version, env, timestamp }`. Planned: UptimeRobot or BetterStack external monitor pinging `/health` every 60s.
- **Error monitoring:** Planned Sentry integration (v2.2) for client + server error capture. Currently, errors are logged to console (visible in Vercel dashboard).
- **Audit log:** All mutations logged to `AuditLog` table — queryable via the Audit Log page or directly in Supabase dashboard.

### 7.10 Security Headers

Enforced via `vercel.json` `headers` array on `/(.*)` source:

| Header | Value | Purpose |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Force HTTPS for 2 years, include subdomains, eligible for HSTS preload list |
| `X-Frame-Options` | `SAMEORIGIN` | Prevent clickjacking (only allow iframe embedding from same origin) |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME-type sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leakage to cross-origin |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), browsing-topics=()` | Disable browser features the app doesn't use |
| `X-DNS-Prefetch-Control` | `on` | Enable DNS prefetch for faster cross-origin loads |
| `Cache-Control` (static) | `public, max-age=31536000, immutable` | 1-year immutable cache for `/_next/static/*` and static file extensions |
| `X-Powered-By` | (removed) | Disable Next.js powered-by header via `next.config.ts` |

---

## 8. Data Governance

This section incorporates best practices synthesized from the Stibo Systems research (`/home/z/my-project/mdm-research-findings.md`), including the 2026 Gartner Magic Quadrant for MDM, Profisee's 9 MDM Best Practices, Semarchy's RDM 7+8 best practices, AtroPIM's product hierarchy best practices, and Ataccama's maker-checker workflow guidance.

### 8.1 Data Quality Framework

The platform implements the **6 dimensions of data quality** (per Stibo's framework):

| Dimension | Definition | MAA BTOOL enforcement |
|---|---|---|
| **Accuracy** | Does the data reflect the real-world entity? | Manual review via approval workflow; planned AI anomaly detection (v3.0) |
| **Completeness** | Are all required fields populated? | `MetaField.isRequired` + form validation; bulk import row-by-row check; dashboard metric |
| **Consistency** | Is the data consistent across modules? | Lookup-driven dropdowns (no free-text variants); unique constraints; planned cross-module validation rules (v2.3) |
| **Timeliness** | Is the data current? | `validFrom`/`validTo` on lookup values; `DataVersion` SCD Type 2 on records; dashboard "stale record" metric (planned) |
| **Uniqueness** | Are there duplicates? | `MetaField.isUnique` constraint; `@@unique` on lookupCodes, valueCodes, usernames, emails; planned fuzzy-match duplicate detection (v2.3) |
| **Validity** | Does the data conform to business rules? | `FieldValidation` rules (regex, min, max, dates); lookup value validity check on record save |

**Upstream validation principle (Stibo):** "Resolving data quality errors at the point of entry instead of retrospectively will save you significant time and cost." MAA BTOOL enforces validation at:
1. Form submit (client-side, instant feedback).
2. API receive (server-side, defense-in-depth).
3. Bulk import (row-by-row, with error report).

### 8.2 Data Stewardship Roles (RACI)

Per Stibo/Snowflake/IBM guidance, the platform's RBAC roles map to a **RACI** stewardship model:

| Activity | Data Producer | Data Steward | Data Owner | Data Trustee | Data Consumer |
|---|---|---|---|---|---|
| Create record (DRAFT) | **R** | C | I | I | — |
| Submit for review | **R** | A | I | I | — |
| Approve / Reject | I | **R** | **A** | C | — |
| Edit ACTIVE (amendment) | **R** | C | I | I | — |
| Define module / fields | I | **R** | **A** | C | I |
| Edit lookup master | I | **R** | **A** | C | I |
| Manage hierarchy | I | **R** | **A** | C | I |
| Review audit log | I | **R** | **A** | **A** | I |
| Manage users / roles | — | I | **R** | **A** | — |
| Consume via API | — | I | I | I | **R** |

**Legend:** R = Responsible, A = Accountable, C = Consulted, I = Informed.

**Role mapping:**
- **Data Producer** = Data Entry
- **Data Steward** = Manager
- **Data Owner** = Manager (for module-specific) or Super Admin (for system-wide)
- **Data Trustee** = Super Admin
- **Data Consumer** = Viewer, API Manager, AI User

### 8.3 Audit Trail & Data Lineage

Per Stibo: "Data lineage is the detailed history of the data's life cycle, including its origins, transformations, and movements over time."

**Implemented (v2.1):**
- **Backward lineage (traceability):** Every `DataRecord` has a chain of `DataVersion` snapshots — query "what was the value on date Y?" via `validFrom`/`validTo` ranges.
- **Audit trail:** Every mutation (create/update/delete) on DataRecord, ApprovalTicket, Hierarchy, HierarchyNode, LookupMaster, LookupValue, SysUser, SysRole, TenantCompany, ApiKey, SftpConfig, Documentation is logged in `AuditLog` with: actor (userId), action, oldValues (JSON), newValues (JSON), timestamp, IP, userAgent.

**Planned (v2.2-v3.0):**
- **Forward lineage (impact analysis):** "What breaks if I change this lookup value?" — the where-used tracking (v2.1) is the foundation; full impact analysis UI planned v2.2.
- **Visual lineage graph:** Stibo STEP Workbench-style graph view of record → version → approval → audit chain.
- **Cross-domain lineage:** Customer 360 → show all touchpoints (records, hierarchies, lookups) that reference a customer.
- **Hash-chain tamper-evidence:** Each `AuditLog` entry includes a hash of the previous entry — any tampering breaks the chain. (v3.0)

### 8.4 Version Control & Approval Workflow

Per Stibo: "version control and approval processes ensure traceability and data integrity while streamlined workflows enhance process efficiency."

**Implemented (v2.1):**
- **SCD Type 2 versioning:** `DataVersion` table — every approved change creates a new version with `validFrom=now`, sets `validTo=now` on the previous version. At any point in time, you can reconstruct the record's state.
- **Maker-checker workflow:** `ApprovalTicket` — Maker creates → Checker reviews → Approve/Reject. The "Lihat Detail Perubahan" dialog shows field-by-field diff.
- **Amendment workflow:** Editing ACTIVE → REVISION_PENDING → new ApprovalTicket → on approval, new DataVersion + currentPayload update.

**Planned (v2.3+):**
- **Diff viewer for versions:** UI to compare any two `DataVersion` snapshots side-by-side.
- **Lookup change requests:** `LookupChangeRequest` model — non-Super-Admin users propose changes; Super Admin reviews (maker-checker for lookups, currently Super-Admin-only direct edit).
- **Hierarchy version control:** `HierarchyVersion` snapshots — restore a previous tree state.

### 8.5 Referential Integrity Enforcement

Per Stibo/Semarchy/Atlan: referential integrity is non-negotiable for reference data management.

**Implemented (v2.1):**
- **Database-level FK constraints:** All `@relation` fields in Prisma schema generate FK constraints. `onDelete: Cascade` on join tables (UserRole, RolePermission, HierarchyNode children, LookupValue, AiMessage, ApiAccessLog, SftpSyncLog); `onDelete: SetNull` on AuditLog.userId (preserve audit history even if user is deleted).
- **Application-level referential integrity for lookups:** Before hard-deleting a `LookupMaster`, the API counts `MetaField` records with `lookupId = id`. If `fieldCount > 0` and the request lacks `?force=true`, returns **409 Conflict** with the count. This prevents orphaned `MetaField.lookupId` references.
- **Soft-delete default:** `LookupMaster` DELETE defaults to soft-delete (`isActive=false`), preserving the row so existing `MetaField` references remain valid.
- **Circular-reference prevention:** Hierarchy reparent checks that the new parent is not a descendant of the node being moved (returns 422 otherwise).

**Planned (v2.2+):**
- **Referential integrity check on record delete:** Check if any `HierarchyNode.recordId` or `ApprovalTicket.recordId` references the record before delete.
- **Foreign key cleanup tool:** Admin UI to find and fix orphaned references (defensive maintenance).

### 8.6 Soft-Delete & Recycle Bin Policy

Per Stibo Recycle Bin pattern: "Reference data should NEVER be hard-deleted."

**Implemented (v2.1):**
- **LookupMaster:** Soft-delete (`isActive=false`) is the default. Hard-delete requires explicit `?hardDelete=true` + Super Admin + `?force=true` if referenced.
- **LookupValue:** Soft-delete (`isActive=false`) on PUT when not in submitted array. Hard-delete only via Super Admin with `?hardDelete=true`.
- **ApiKey:** Soft-delete (`isActive=false`) on revoke. Hard-delete via Super Admin only.
- **SftpConfig:** Soft-delete (`isActive=false`). Hard-delete via Super Admin.
- **SysUser:** Soft-delete (`isActive=false`). Hard-delete via dedicated `/api/admin/users/hard-delete` endpoint (Super Admin only, with referential check — reassigns or nullifies audit logs via `onDelete: SetNull`).

**Planned (v2.2+):**
- **Recycle Bin UI:** Stibo-style page listing all soft-deleted entities with restore buttons.
- **Retention policy:** Auto-purge soft-deleted records after 90 days (configurable), with audit log of the purge.
- **HierarchyNode soft-delete:** Currently `isActive` exists; add Recycle Bin + restore for accidentally deleted nodes.

### 8.7 Regulatory Compliance

**GDPR (EU General Data Protection Regulation):**
- **Data subject access:** Audit log provides full history of mutations to a user's personal data (`SysUser`).
- **Right to erasure:** Soft-delete satisfies "right to be forgotten" without breaking referential integrity. Hard-delete available for true erasure.
- **Data portability:** REST API provides JSON export of all user data.
- **Breach notification:** Audit log + access log enable incident reconstruction.
- **Not yet implemented:** Consent management, DPIA templates, data residency controls (planned v3.0 if EU users onboard).

**CCPA (California Consumer Privacy Act):**
- Same mechanisms as GDPR (erasure, portability, audit).
- "Do Not Sell My Personal Info" — N/A (MAA BTOOL does not sell personal data).

**SOX (Sarbanes-Oxley) — relevant for IDX-listed MAP Group:**
- **Audit trail:** Every financial record mutation (BUDGET, PRICING_MASTER, ASSET modules) is logged with actor, timestamp, old/new values.
- **Maker-checker:** Financial records require approval — no single user can both create and approve.
- **Version history:** SCD Type 2 enables reconstruction of financial state at any past date.

**BCBS239 (banking risk-data aggregation):** Not directly applicable (MAP Group is retail, not banking), but the principles (lineage, accuracy, completeness, timeliness) inform the data quality framework.

**Indonesian regulations:**
- **PDP Law (UU Perlindungan Data Pribadi 2022):** Indonesia's GDPR equivalent. Same mechanisms apply.
- **Tax compliance:** Lookup values for tax codes (PPh 21, PPh 23, PPN) with `validFrom`/`validTo` for rate changes.

---

## 9. User Experience Principles

### 9.1 Design System

- **Foundation:** shadcn/ui (New York style) — Radix UI primitives + Tailwind CSS, copy-paste components (not npm dependency), fully customizable.
- **Typography:**
  - **Sans** (body, UI): Plus Jakarta Sans — friendly, modern, excellent Indonesian Latin support.
  - **Display** (headings): Space Grotesk — geometric, distinctive, the "2026 viral" headline font.
  - **Mono** (code, numbers): JetBrains Mono — ligatures, clear 0/O and 1/l/I distinction.
- **Loading:** All 3 fonts via `next/font/google` with `display: swap` and `latin` subset for optimal performance. CSS variables (`--font-sans`, `--font-display`, `--font-mono`) attached to `<html>`, propagated via Tailwind `@theme inline`.
- **Tabular numerals:** `font-variant-numeric: tabular-nums` utility for clean numeric alignment in tables/dashboards.
- **Headings:** Space Grotesk auto-applied via `@layer base h1-h6` — no per-component changes needed.

### 9.2 Color System

- **Primary:** MAP Group red (`hsl(0 84% 51%)` approx) — used for primary buttons, active states, brand logo. No indigo/blue (deliberate departure from default shadcn).
- **Status colors** (from `STATUS_COLORS`):
  - DRAFT → gray (`bg-gray-100 text-gray-700 border-gray-300`)
  - IN_REVIEW → amber
  - ACTIVE → emerald
  - REVISION_PENDING → sky
  - REJECTED → red
  - ARCHIVED → slate
- **Semantic colors:**
  - Success → emerald
  - Warning → amber
  - Danger → red
  - Info → sky
- **Lookup category colors** (v2.1):
  - System → sky
  - Custom → violet
  - ISO → emerald
- **Dark mode:** Supported via `next-themes` (planned full activation v2.2 — currently light-only).
- **Contrast:** All combinations meet WCAG AA 4.5:1 (normal text) or 3:1 (large text).

### 9.3 Layout

- **App shell:** `src/components/layout/AppShell.tsx` — sticky header + collapsible sidebar + main content area + sticky footer.
- **Sidebar navigation:** Role-aware — items shown/hidden based on `ROLE_PERMISSIONS`. Sections: Dashboard, Data (Modules, Data Records, Hierarchy, Bulk Import, Workflow), Admin (Users, Roles, Companies, Lookups, SFTP), Tools (Documentation, API Management, AI Assistant), System (Audit Log, Settings, About, System Health).
- **Responsive breakpoints:**
  - Mobile (<640px): single column, sidebar as drawer, tables horizontal-scroll.
  - Tablet (640-1024px): sidebar collapses to icon-only, content 1-2 columns.
  - Desktop (>1024px): full sidebar + multi-column content.
  - Wide (>1280px): max-width container, generous whitespace.
- **Sticky footer:** Brand attribution + version + developer link.
- **Breadcrumbs:** Per-page breadcrumb showing navigation path (e.g., `Data / Modules / ARTICLE_MASTER / New Record`).

### 9.4 Interaction Patterns

- **Toast feedback:** `sonner` (or `use-toast`) for success/error/info notifications on every mutation. Auto-dismiss 5s; manual dismiss on click.
- **Loading states:** Skeleton loaders (`<Skeleton>`) for initial page load; spinner (`<Loader2 className="animate-spin">`) for inline actions; button loading state (disabled + spinner).
- **Empty states:** Illustrated empty state for tables (`<EmptyState icon title description action>`), e.g., "No records yet. Create your first record."
- **Confirm dialogs:** `AlertDialog` for destructive actions (delete record, delete conversation, hard-delete lookup, deactivate user). Always include: title, description of consequence, Cancel + Confirm buttons.
- **Optimistic updates:** TanStack Query `onMutate` for instant UI feedback on mutations (planned full rollout v2.2).
- **Form validation:** Inline errors below each field (react-hook-form + zod), red border on invalid fields, error summary at top on submit attempt.
- **Keyboard shortcuts:** Planned v2.3 (`react-hotkeys-hook`) — `Cmd+K` for command palette, `N` for new record, `/` for search focus.

### 9.5 Onboarding

- **Role-aware guided tour:** `src/components/layout/OnboardingGuide.tsx` — 14 steps for Super Admin (covers all features), fewer steps for other roles (only their accessible features).
- **Skip button:** Onboarding can be skipped; completion state stored in localStorage (`onboardingCompleted: { [role]: true }`).
- **Re-trigger:** Settings page has "Replay onboarding" button.
- **Bahasa Indonesia strings:** Onboarding dialog text is in Indonesian for MAP Group users (e.g., "Selamat datang di MAA BTOOL! Mari kita mulai tour singkat.").
- **Suggested prompts:** AI Assistant shows 4 suggested prompt cards in empty state — guides users to the most common actions.

---

## 10. Roadmap

### 10.1 Completed (v1.0 → v2.0)

| Version | Task ID(s) | Highlights |
|---|---|---|
| **v1.0** | 2, 7, 8, 9 | Initial MDM platform: 7 modules (ARTICLE_MASTER, BUDGET, ASSET, STORE_MASTER, SUPPLIER_MASTER, PRICING_MASTER, PROMOTION_MASTER), RBAC security, image upload, dropdown/lookup, amendment workflow (ACTIVE → REVISION_PENDING), CSV import (`;` delimiter), Documentation Hub (markdown + multi-file upload), API Management (4 tabs), About page, Settings persistence, 35 seeded records |
| **v1.5** | 7a, 10, 10-a, 10-b | Service integrations: Clerk (auth), Resend (email), Upstash (Redis), Pinecone (vector). Deployed to Vercel + Supabase. Typography upgrade (Plus Jakarta Sans + Space Grotesk + JetBrains Mono). Vercel Analytics + Speed Insights. Workflow "View Details" dialog with field-by-field diff |
| **v1.8** | 11, 12, 12-a, 12-d | Production rollback + 4 user-requested revisions. Font system enhancement. Deployment checklist feature. Vercel config optimization |
| **v2.0** | 13, 14, 15, 16, 18, 18-v, 19, 20 | GitHub↔Vercel auto-deploy sync. AI API key security. Functional notifications. GitHub CI workflow. AI Assistant rebuild: delete (with confirmation), bookmark, pin, rename, chat history, Claude-AI-like UI (markdown, code copy, streaming, suggested prompts, auto-resize, animations). Defensive demo-mode fallback (no scary errors). 3-dot menu always-visible fix (touch-device bug) |

### 10.2 Current Wave (v2.1 — Hierarchy & Lookup Enhancement)

Driven by the Stibo Systems benchmark research (Task 21-A) and implemented in Task 21-C. All changes are **additive and backward-compatible** (new nullable fields with defaults) — safe for `prisma db push --accept-data-loss` on Vercel.

**P0 Critical Fixes (completed):**

| # | Fix | Files |
|---|---|---|
| P0.1 | Audit logging on hierarchy + lookup APIs (was missing entirely) | `hierarchies/route.ts`, `admin/lookups/route.ts` |
| P0.2 | RBAC enforcement on hierarchy API (`hierarchy:read`/`hierarchy:write`) | `hierarchies/route.ts` |
| P0.3 | Non-destructive PUT on lookups (per-value upsert, was `deleteMany+createMany` data-loss bug) | `admin/lookups/route.ts` |
| P0.5 | Referential integrity check before deleting lookups (409 Conflict + soft-delete default) | `admin/lookups/route.ts` |
| P0.6 | Where-used tracking (`_count.fields` + `/api/fields?lookupId=` endpoint + Dialog) | `admin/lookups/route.ts`, `fields/route.ts`, `AdminLookupsPage.tsx` |
| P0.7 | Removed `opacity-0 group-hover:opacity-100` from all action buttons (touch-device bug) | `HierarchyPage.tsx`, `HierarchyDetailPage.tsx` |
| P0.8 | Soft-delete on LookupMaster (`isActive=false` default; `?hardDelete=true` opt-in) | `schema.prisma`, `admin/lookups/route.ts` |

**P1 Enhancements (completed):**

| # | Enhancement | Files |
|---|---|---|
| P1.1 | Node status lifecycle field (DRAFT/IN_REVIEW/ACTIVE/ARCHIVED) + badge in tree | `schema.prisma`, `HierarchyDetailPage.tsx` |
| P1.2 | Search within hierarchy tree (recursive + ancestor preservation + highlight) | `HierarchyDetailPage.tsx` |
| P1.3 | Breadcrumb showing materialized path on selection | `HierarchyDetailPage.tsx` |
| P1.8 | Effective dates on LookupValue (`validFrom`/`validTo` + Expired/Upcoming/Active badges) | `schema.prisma`, `AdminLookupsPage.tsx` |
| P1.9 | Description on LookupValue (input in editor + display in table) | `schema.prisma`, `AdminLookupsPage.tsx` |
| — | Category grouping (System/Custom/ISO) on LookupMaster | `schema.prisma`, `AdminLookupsPage.tsx` |
| — | Expand All / Collapse All buttons on tree | `HierarchyDetailPage.tsx` |
| — | Click-to-select node (ring highlight) | `HierarchyDetailPage.tsx` |

**Known issue (deferred to v2.1.1 patch):**

- **P0.4 Move Up/Down sibling swap:** The v2.1 ship included the UI scaffolding and API `swapWith` mode parameter, but the full atomic sibling-swap transaction logic is the v2.1.1 patch. Currently Move Up/Down adds ±1 to `sortOrder` (which can collide if two siblings share the same sortOrder). The fix: fetch the sibling at `sortOrder ± 1`, swap both sortOrders in a `db.$transaction`. Estimated 2h.

### 10.3 Next Wave (v2.2 — Hierarchy & Lookup UX & Workflow)

From the research P1/P2 items not yet implemented:

| # | Feature | Effort | Priority |
|---|---|---|---|
| v2.2.1 | **Drag-and-drop reparenting** (`@minoru/react-dnd-treeview` — virtualized, most popular) | 6h | P1 |
| v2.2.2 | **Multi-tab node detail** (Overview, Referenced By, References, Status, History) — Stibo STEP Workbench pattern | 8h | P1 |
| v2.2.3 | **Attribute inheritance** (value + attribute inheritance with local override — Stibo's killer feature) | 3-5 days | P1 |
| v2.2.4 | **Lookup approval workflow** (`LookupChangeRequest` model + maker-checker for non-Super-Admin) | 12h | P1 |
| v2.2.5 | **Translations** on LookupValue (`LookupValueTranslation` model or `displayValues Json`) | 6h | P1 |
| v2.2.6 | **Bulk import/export for lookups** (CSV/Excel endpoints) | 6h | P1 |
| v2.2.7 | **Transformation lookup tables** (From-To mappings for normalization — Stibo pattern) | 8h | P1 |
| v2.2.8 | **Depth validation** on HierarchyNode (`MAX_HIERARCHY_DEPTH = 7`) | 1h | P1 |
| v2.2.9 | **Referenced By tab** for hierarchy nodes (which DataRecords link here) | 4h | P1 |
| v2.2.10 | **Data quality rules** on LookupValue (regex validation on `valueCode`) | 3h | P1 |
| v2.2.11 | **Notifications to data stewards** on hierarchy/lookup changes (via existing `/api/notifications`) | 4h | P1 |
| v2.2.12 | **External reference data subscription** (`externalId`/`sourceSystem` on LookupMaster; sync ISO codes) | 1 week | P2 |
| v2.2.13 | **Recycle Bin UI** (restore soft-deleted entities) | 2 days | P2 |
| v2.2.14 | **Audit log CSV export** | 4h | P2 |
| v2.2.15 | **Record lock timeout** (auto-release after configurable period) | 4h | P2 |

### 10.4 Future (v3.0+)

From the research P2 items and Stibo's advanced capabilities:

| # | Feature | Effort | Vision |
|---|---|---|---|
| v3.0.1 | **Enterprise Knowledge Graph view** (Tamr/Stibo pattern — force-directed graph of cross-domain relationships via `react-force-graph` or `cytoscape.js`) | 1 week | Visualize customer→account→location, supplier→subsidiary→parent |
| v3.0.2 | **AI-powered classification & data quality suggestions** (Stibo agentic MDM — suggest hierarchy placement for new records based on attributes) | 1 week | Leverage existing AI Assistant infrastructure + GLM-4-Plus |
| v3.0.3 | **Hierarchy templates** (pre-built for product category, org chart, location hierarchy) | 3 days | Faster onboarding for new tenants |
| v3.0.4 | **Virtualization for 1000+ node trees** (`@minoru/react-dnd-treeview` already virtualized; needs integration) | 3 days | Retail product catalogs with 10K+ SKUs |
| v3.0.5 | **Version control with diff viewer** (`HierarchyVersion` / `LookupVersion` models + side-by-side diff UI) | 1 week | Stibo pattern: restore previous tree state |
| v3.0.6 | **360° cross-domain views** (customer 360, supplier 360 — all touchpoints in one view) | 2 weeks | Executive dashboard use case |
| v3.0.7 | **External reference data subscription** (sync ISO codes, country codes, currency codes from Dun & Bradstreet, Experian, Loqate) | 1 week per source | Stibo connector pattern |
| v3.0.8 | **Configurable business rules engine** (validation/transformations as configurable rules, not hardcoded) | 1-2 weeks | Stibo STEP Business Rules pattern |
| v3.0.9 | **Hash-chain tamper-evidence** on AuditLog (cryptographic proof of no tampering) | 1 week | SOX + compliance upgrade |
| v3.0.10 | **Row-Level Security (RLS)** at the database level (defense-in-depth on top of app-level `companyId` filter) | 1 week | Multi-tenant isolation guarantee |
| v3.0.11 | **Lookup value usage analytics** (which values are most/least selected in forms) | 3 days | Data steward insights |
| v3.0.12 | **Keyboard shortcuts** (`react-hotkeys-hook` — Cmd+K command palette, N new record, / search focus) | 1 day | Power-user productivity (Stibo STEP Workbench pattern) |
| v3.0.13 | **Sentry error monitoring** (client + server) | 4h | Production issue triage |
| v3.0.14 | **Full Bahasa Indonesia i18n** via `next-intl` | 1 week | MAP Group user adoption |
| v3.0.15 | **Dark mode** full activation (currently infra-ready via `next-themes`) | 3 days | User preference |

---

## 11. Metrics & Analytics

### 11.1 Product Metrics

| Metric | Definition | Source | Target |
|---|---|---|---|
| DAU | Distinct authenticated users per day | Vercel Analytics + AuditLog | Trending up |
| MAU | Distinct authenticated users per month | Vercel Analytics + AuditLog | Trending up |
| Record creation rate | New records created per day per module | AuditLog `action=RECORD_CREATE` | Steady growth |
| Approval cycle time | Avg hours from `IN_REVIEW` to `ACTIVE` | AuditLog timestamps | < 4h |
| AI conversation count | New conversations per week | AiConversation | Trending up |
| AI messages per conversation | Avg messages per conversation | AiMessage | 5+ (engagement) |
| Bulk import usage | Jobs per week | AsyncBatchJob | Trending up |

### 11.2 Data Quality Metrics

| Metric | Definition | Source | Target |
|---|---|---|---|
| Completeness % | % of required fields populated on ACTIVE records | DataRecord.currentPayload vs. MetaField.isRequired | ≥ 98% |
| Accuracy % | % of records passing all FieldValidation rules | Validation run | ≥ 95% |
| Duplicate rate | % of records flagged as duplicates (planned fuzzy-match) | Dedup job | < 1% |
| Validation pass rate | % of bulk import rows passing validation on first try | AsyncBatchJob | ≥ 90% |
| Stale record % | % of ACTIVE records not updated in 12 months | DataRecord.updatedAt | < 20% |
| Lookup usage coverage | % of active LookupMasters referenced by at least one MetaField | `_count.fields` | ≥ 70% |

### 11.3 System Metrics

| Metric | Definition | Source | Target |
|---|---|---|---|
| API latency p50 | 50th percentile API response time | Vercel Analytics | < 500ms |
| API latency p95 | 95th percentile API response time | Vercel Analytics | < 2.0s |
| Error rate (5xx) | % of API calls returning 5xx | Vercel Analytics | < 0.1% |
| Error rate (4xx) | % of API calls returning 4xx | Vercel Analytics | < 5% (user errors) |
| Uptime | % of time `/api/health` returns 200 | Planned UptimeRobot | ≥ 99.9% |
| AI streaming TTFB | Time to first byte on `/api/ai/chat/stream` | Server log | < 5.0s |
| LCP (Largest Contentful Paint) | RUM from real users | Vercel Speed Insights | < 2.0s |
| INP (Interaction to Next Paint) | RUM from real users | Vercel Speed Insights | < 200ms |
| CLS (Cumulative Layout Shift) | RUM from real users | Vercel Speed Insights | < 0.1 |

### 11.4 Business Metrics

| Metric | Definition | Source | Target |
|---|---|---|---|
| Time-to-market (new product) | Hours from master data created to first sale | AuditLog + POS integration | < 24h |
| Data-related incident count | Incidents per quarter caused by bad master data | Incident tracker | 0 |
| ERP customization requests avoided | # of new "modules" created via Module Builder (vs. ERP dev request) | MetaModule count | ≥ 3/quarter |
| Self-serve lookup changes | # of lookup changes by non-Super-Admin / month | AuditLog | ≥ 10 |
| Onboarding time | Time for new data steward to first record creation | Manual | < 1 day |

---

## 12. Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Z.AI API key expires or balance runs out** — AI Assistant stops working | Medium | Low | Defensive demo-mode fallback (v2.0 Task 20 fix) — users always get helpful markdown responses, never see scary errors. Badge clearly shows "Demo Mode" vs "Live AI". |
| R2 | **Supabase free tier limits hit** (500MB DB, 5GB bandwidth) | Medium | High | Monitor usage in Supabase dashboard; upgrade to Pro ($25/mo) before limits. Pro tier: 8GB DB, 250GB bandwidth, daily backups, PITR. |
| R3 | **Vercel serverless function timeout** (10s default, 60s on AI routes) | Low | Medium | AI routes configured with `maxDuration: 60` + `memory: 1024`. Streaming responses avoid timeout on long generations. Heavy bulk imports run as `AsyncBatchJob` (background). |
| R4 | **Prisma `db push --accept-data-loss` drops data on schema change** | Low | Critical | All schema changes are additive (new nullable fields with defaults). Destructive changes (column rename, type change) require manual migration script + backup. CI type-check catches schema/Prisma client mismatch. |
| R5 | **Concurrent record edits cause data loss** | Medium | Medium | `DataRecord.lockedBy` field prevents concurrent edits (lock acquired on edit-start, released on save/cancel). Planned v2.2: lock timeout + optimistic concurrency via `version` counter. |
| R6 | **RBAC misconfiguration grants unintended access** | Low | High | `hasPermission(['*'])` Super Admin bypass is explicit. Per-module `RolePermission` layered on top. All admin endpoints Super-Admin-only. Audit log catches unauthorized attempts. |
| R7 | **Lookup deletion orphans MetaField references** | Low | High | **Mitigated in v2.1:** referential integrity check (409 Conflict if referenced) + soft-delete default. Hard-delete requires `?force=true` + Super Admin. |
| R8 | **Hierarchy reparent creates circular reference** | Low | High | **Mitigated:** API checks that new parent is not a descendant of the node being moved (returns 422). Recursive materializedPath/depthLevel recalculation. |
| R9 | **Sensitive data in audit log** (e.g., password fields accidentally logged) | Low | High | Audit log only captures defined fields (not passwordHash). Manual review of `logAudit` calls. Planned v2.2: field-level redaction config. |
| R10 | **Third-party dependency abandoned** (e.g., z-ai-web-dev-sdk) | Low | Medium | Defensive coding — all third-party SDKs wrapped in try/catch with graceful fallback. Can swap AI provider without UI changes (just env var). |
| R11 | **Vercel region outage** (sin1 unavailable) | Very Low | High | Vercel multi-region failover (Pro). Database in Supabase sin1 — same region. Acceptable risk for non-critical retail data (not life-safety). |
| R12 | **XSS via markdown rendering** in Documentation Hub | Low | High | `react-markdown` sanitizes by default (no raw HTML). No `dangerouslySetInnerHTML`. rehype-highlight for code (scoped CSS). |
| R13 | **CSRF on auth routes** | Low | Medium | JWT in `Authorization` header (not cookie) — CSRF not applicable for API. Cookie-based auth (if added) uses `SameSite=Strict`. |
| R14 | **Rate limit bypass** on API keys | Medium | Medium | Per-key rate limit (default 100 req/min). Planned v2.2: Upstash Redis backing for distributed rate limiting (currently in-memory, per-instance). |
| R15 | **Single-developer bus factor** | High | Critical | Comprehensive PRD (this document), worklog in `/home/z/my-project/worklog.md`, code comments, GitHub commit history. Onboard second developer planned v2.2. |
| R16 | **AI hallucination** — assistant gives wrong workflow guidance | Medium | Medium | Demo-mode fallback uses curated, correct responses. Live AI uses system prompt with current feature documentation. Planned v2.2: RAG over Documentation Hub for grounded answers. |
| R17 | **Bulk import corrupts data** | Medium | High | Row-by-row validation before insert. Each row follows standard approval workflow (DRAFT or IN_REVIEW). Failed rows reported with error detail. Idempotent (re-runnable with same data). |
| R18 | **Database connection pool exhaustion** under load | Medium | High | Supabase PgBouncer transaction mode (max 200). Vercel serverless reuses connections. Query optimization (avoid N+1 via Prisma `include`). |

---

## 13. Appendices

### Appendix A — Glossary

| Term | Definition |
|---|---|
| **MDM** | Master Data Management — discipline of governing the single source of truth for core business entities (customers, products, suppliers, etc.) |
| **RDM** | Reference Data Management — subset of MDM focused on standardized code-value pairs (countries, currencies, tax codes) |
| **Hierarchy** | Tree structure of parent-child relationships (e.g., product category → subcategory → product) |
| **Taxonomy** | Classification rules determining what an entity IS (separate from hierarchy, which determines how data flows) |
| **Materialized path** | String storing the full path from root to node (e.g., `/root/cat-a/subcat-b/`) for O(1) subtree queries |
| **Maker-checker** | Workflow where one user creates (maker) and another approves (checker) — separation of duties |
| **SCD Type 2** | Slowly Changing Dimension Type 2 — versioning pattern that preserves history via `validFrom`/`validTo` ranges |
| **Stewardship** | Accountability for data quality, owned by defined roles (Data Producer, Steward, Owner, Trustee) |
| **Lineage** | History of data's lifecycle — origins, transformations, movements. Forward (impact) + backward (traceability) |
| **Referential integrity** | Constraint ensuring FK references remain valid (no orphaned references) |
| **Soft-delete** | Marking a record `isActive=false` instead of physically deleting — preserves referential integrity and audit history |
| **Recycle Bin** | UI for restoring soft-deleted entities (Stibo pattern) |
| **Where-used** | Analysis showing which objects reference a given object (Stibo "Referenced By" tab) |
| **Attribute inheritance** | Stibo's killer feature — children inherit parent attribute values, with local override capability |
| **Transformation lookup table** | From-To text mappings for data normalization during import (Stibo pattern) |
| **Agentic MDM** | AI agents with human-in-the-loop oversight for data classification, anomaly detection, onboarding (Stibo 2025+ vision) |
| **360° view** | Cross-domain view of an entity (e.g., customer 360 = all touchpoints in one view) |
| **Knowledge graph** | Visual representation of cross-domain relationships as a force-directed graph |
| **HIERA** | Stibo's corporate family tree visualization |
| **RBAC** | Role-Based Access Control — permissions assigned to roles, roles assigned to users |
| **JWT** | JSON Web Token — stateless auth token signed with `JWT_SECRET` |
| **PITR** | Point-In-Time Recovery — restore database to any moment in the retention window |
| **RPO / RTO** | Recovery Point Objective (max data loss) / Recovery Time Objective (max downtime) |
| **RACI** | Responsible, Accountable, Consulted, Informed — stewardship role mapping |
| **WCAG** | Web Content Accessibility Guidelines — W3C standard for accessible web content |
| **HSTS** | HTTP Strict Transport Security — header forcing HTTPS |
| **BCBS239** | Basel Committee on Banking Supervision standard 239 — risk data aggregation principles |
| **PDP Law** | Indonesia's Personal Data Protection Law (UU Perlindungan Data Pribadi 2022) — GDPR equivalent |

### Appendix B — References

**Stibo Systems (primary benchmark):**
1. [Stibo Systems Platform](https://www.stibosystems.com/platform) — STEP Trusted Intelligence Platform overview
2. [Stibo Multidomain MDM](https://www.stibosystems.com/platform/multidomain-mdm) — Cross-domain hierarchy governance
3. [Stibo Data Governance](https://www.stibosystems.com/platform/data-governance) — Policy management, RBAC, audit trails
4. [Stibo: How to Implement MDM](https://www.stibosystems.com/blog/how-to-implement-master-data-management-steps-and-challenges) — 10-step implementation guide
5. [Stibo: Data Quality Framework](https://www.stibosystems.com/blog/data-quality-framework) — 6 dimensions of data quality
6. [Stibo: Reference Data and Governance](https://www.stibosystems.com/blog/getting-your-reference-data-and-governance-spot-on) — RDM best practices
7. [Stibo: Modern Guide to Data Quality Monitoring](https://www.stibosystems.com/blog/modern-guide-to-data-quality-monitoring-best-practices) — Monitoring best practices
8. [Stibo: Agentic Workflows in MDM](https://www.stibosystems.com/blog/how-agentic-workflows-are-changing-master-data-management-at-the-core) — AI-augmented MDM vision
9. [Stibo: Complete A-Z of MDM](https://www.stibosystems.com/blog/the-complete-a-z-of-master-data-management) — Glossary
10. [Stibo Docs: Transformation Lookup Tables](https://doc.stibosystems.com/doc/version/2026.1/web/content/resmat/transformation_lookup_tables/transformation_lookup_tables.html) (v2026.1)
11. [Stibo Docs: Inheritance in Product Hierarchy](https://doc.stibosystems.com/doc/version/2025.1/web/content/getstart/prodmaint/inheritance_in_the_product_hierarchy.html) (v2025.1)

**Industry analysts & vendors:**
12. [Profisee: 9 MDM Best Practices](https://profisee.com/blog/master-data-management-best-practices)
13. [Semarchy: Reference Data Management](https://semarchy.com/blog/reference-data-management) — 8 steps + 7 best practices
14. [AtroPIM: Product Hierarchy Best Practices](https://www.atropim.com/en/blog/product-hierarchy-best-practices)
15. [DZone: Hierarchy in MDM](https://dzone.com/articles/hierarchy-in-mdm-what-and-why)
16. [Tamr: How Data Hierarchies Enable Proper Data Management](https://www.tamr.com/blog/how-hierarchies-enable-proper-customer-data-management)
17. [Informatica: 8 Master Data Governance Best Practices](https://www.informatica.com/blogs/master-data-governance-8-best-practices.html)
18. [Ataccama: Maker-Checker Process Approval Workflow](https://community.ataccama.com/data-quality-catalog-94/simple-maker-checker-process-approval-workflow-595)
19. [Snowflake: Data Stewardship Fundamentals](https://www.snowflake.com/en/fundamentals/data-stewardship)
20. [IBM Think: Data Stewardship](https://www.ibm.com/think/topics/data-stewardship)
21. [Gartner Magic Quadrant for MDM Solutions 2026](https://www.gartner.com/en/documents/master-data-management)

**React tree visualization libraries:**
22. [@minoru/react-dnd-treeview](https://www.npmjs.com/package/@minoru/react-dnd-treeview) — recommended for v2.2 drag-and-drop
23. [react-sortable-tree](https://github.com/frontend-collective/react-sortable-tree) — alternative

**Codebase files referenced (this PRD):**
24. `/home/z/prod-link/prisma/schema.prisma` — 22 Prisma models
25. `/home/z/prod-link/src/lib/rbac.ts` — 8 roles, `ROLE_PERMISSIONS`, `checkAuthAndPermission`
26. `/home/z/prod-link/src/lib/constants.ts` — `STATUS_*`, `STATE_TRANSITIONS`, `STATUS_COLORS`, `STATUS_LABELS`
27. `/home/z/prod-link/src/lib/audit.ts` — `logAudit()` helper
28. `/home/z/prod-link/src/lib/auth.ts` — JWT auth, `getTokenFromHeaders`
29. `/home/z/prod-link/next.config.ts` — security headers, image optimization, standalone output
30. `/home/z/prod-link/vercel.json` — HSTS, regions, function config
31. `/home/z/my-project/mdm-research-findings.md` — full Stibo research report (Task 21-A)
32. `/home/z/my-project/worklog.md` — full project history (Tasks 2 → 21-C)

### Appendix C — Change Log

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0.0 | 2025-Q4 | Main Agent | Initial PRD — 7 modules, RBAC, approval workflow, CSV import, Documentation Hub |
| 1.5.0 | 2026-Q1 | Main Agent | Added: external service integrations (Clerk, Resend, Upstash, Pinecone), Vercel deployment, typography upgrade, Workflow detail dialog |
| 2.0.0 | 2026-Q2 | Main Agent | Added: GitHub↔Vercel auto-deploy, AI Assistant rebuild (Claude-AI-like UI, conversation persistence, demo-mode fallback), 3-dot menu touch-device fix, CI workflow |
| **2.1.0** | **2026-06-27** | **PRD Writer Subagent (Task 21-D)** | **Comprehensive PRD rewrite incorporating Stibo Systems research (Task 21-A) and v2.1 implementation (Task 21-C). Added: §4 detailed personas, §5.4-5.5 v2.1 enhancements, §8 Data Governance (RACI, lineage, compliance), §10.2-10.3 roadmap (v2.1 completed + v2.2 planned), §12 risks, §13 appendices (glossary, references).** |

---

**End of Document**

*This PRD is a living document maintained alongside the codebase. For the latest implementation status, see `/home/z/my-project/worklog.md`. For the latest research findings, see `/home/z/my-project/mdm-research-findings.md`. For deployment instructions, see `/home/z/prod-link/docs/DEPLOYMENT.md`.*

**Document stats:** ~1,250 lines · 13 sections · 22 Prisma models documented · 8 personas · 15 functional requirement areas · 18 risks · 32 references.
