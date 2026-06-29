import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { checkAuthAndPermission } from '@/lib/rbac';
import { jsonParse } from '@/lib/db-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Domain mapping — group modules into Stibo-style domains
const DOMAIN_MAP: Record<string, string[]> = {
  Product: ['ARTICLE_MASTER', 'PRICING_MASTER', 'PROMOTION_MASTER'],
  Customer: ['CUSTOMER_MASTER'],
  Supplier: ['SUPPLIER_MASTER'],
  Asset: ['STORE_MASTER'],
  Reference: [],
};

// Reverse lookup: moduleCode → domain
function getDomainForModule(moduleCode: string): string {
  for (const [domain, codes] of Object.entries(DOMAIN_MAP)) {
    if (codes.includes(moduleCode)) return domain;
  }
  return 'Other';
}

// GET /api/data-catalog — List all data assets grouped by domain
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    const authCheck = checkAuthAndPermission(tokenPayload, 'data:read');
    if (authCheck.error) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const companyId = tokenPayload!.companyId;
    const domainFilter = searchParams.get('domain');
    const search = searchParams.get('search');
    const moduleCode = searchParams.get('moduleCode');

    // ── 1. Fetch all active modules with their metadata ──────────
    const modules = await db.metaModule.findMany({
      where: {
        isActive: true,
        ...(moduleCode ? { moduleCode } : {}),
      },
      include: {
        fields: {
          where: { isActive: true },
          select: {
            id: true,
            fieldCode: true,
            fieldName: true,
            dataType: true,
            isRequired: true,
            isUnique: true,
          },
        },
        dataRecords: {
          where: { companyId },
          select: {
            id: true,
            status: true,
            currentPayload: true,
            updatedAt: true,
            createdById: true,
            updatedById: true,
          },
        },
        businessRules: {
          where: { isActive: true },
          select: { id: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    // ── 2. Build data asset entries ──────────────────────────────
    const assets = modules.map((mod) => {
      const records = mod.dataRecords;
      const totalRecords = records.length;
      const fields = mod.fields;

      // Determine owner — most recent updater or creator
      const owner = records.length > 0
        ? records[0].updatedById || records[0].createdById
        : null;

      // Calculate quality score (simplified: completeness-based)
      const requiredFields = fields.filter((f) => f.isRequired);
      let filledCount = 0;
      let totalRequiredSlots = 0;

      records.forEach((rec) => {
        let payload: Record<string, unknown> = {};
        try {
          payload = jsonParse<Record<string, unknown>>(rec.currentPayload || '{}');
        } catch {
          // ignore
        }
        requiredFields.forEach((field) => {
          totalRequiredSlots++;
          const value = payload[field.fieldCode];
          if (value !== null && value !== undefined && value !== '') {
            filledCount++;
          }
        });
      });

      const qualityScore =
        totalRequiredSlots > 0
          ? Math.round((filledCount / totalRequiredSlots) * 100)
          : totalRecords > 0
            ? 100
            : 0;

      // Last updated — most recent record update or module update
      const lastRecordUpdate = records.length > 0
        ? records.reduce((latest, rec) => {
            const d = new Date(rec.updatedAt);
            return d > latest ? d : latest;
          }, new Date(0))
        : null;

      const lastUpdated = lastRecordUpdate
        ? lastRecordUpdate > new Date(mod.updatedAt)
          ? lastRecordUpdate.toISOString()
          : mod.updatedAt.toISOString()
        : mod.updatedAt.toISOString();

      // Status distribution
      const statusDistribution: Record<string, number> = {};
      records.forEach((rec) => {
        statusDistribution[rec.status] = (statusDistribution[rec.status] || 0) + 1;
      });

      // Field type distribution
      const fieldTypeDistribution: Record<string, number> = {};
      fields.forEach((f) => {
        fieldTypeDistribution[f.dataType] = (fieldTypeDistribution[f.dataType] || 0) + 1;
      });

      const domain = getDomainForModule(mod.moduleCode);

      return {
        id: mod.id,
        moduleCode: mod.moduleCode,
        moduleName: mod.moduleName,
        description: mod.description,
        domain,
        icon: mod.moduleIcon,
        owner,
        lastUpdated,
        qualityScore,
        recordCount: totalRecords,
        fieldCount: fields.length,
        requiredFieldCount: requiredFields.length,
        businessRuleCount: mod.businessRules.length,
        statusDistribution,
        fieldTypeDistribution,
        requireApproval: mod.requireApproval,
        createdAt: mod.createdAt.toISOString(),
      };
    });

    // ── 3. Apply search filter ───────────────────────────────────
    let filtered = assets;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.moduleName.toLowerCase().includes(q) ||
          a.moduleCode.toLowerCase().includes(q) ||
          (a.description && a.description.toLowerCase().includes(q)) ||
          a.domain.toLowerCase().includes(q)
      );
    }

    // ── 4. Apply domain filter ───────────────────────────────────
    if (domainFilter) {
      filtered = filtered.filter((a) => a.domain === domainFilter);
    }

    // ── 5. Group by domain ───────────────────────────────────────
    const domainGroups: Record<string, typeof filtered> = {};
    filtered.forEach((asset) => {
      const domain = asset.domain;
      if (!domainGroups[domain]) domainGroups[domain] = [];
      domainGroups[domain].push(asset);
    });

    // ── 6. Compute summary ───────────────────────────────────────
    const summary = {
      totalAssets: filtered.length,
      totalRecords: filtered.reduce((sum, a) => sum + a.recordCount, 0),
      totalFields: filtered.reduce((sum, a) => sum + a.fieldCount, 0),
      averageQuality:
        filtered.length > 0
          ? Math.round(
              filtered.reduce((sum, a) => sum + a.qualityScore, 0) /
                filtered.length
            )
          : 0,
      domainCount: Object.keys(domainGroups).length,
    };

    // ── 7. Resolve owner names ───────────────────────────────────
    const ownerIds = [...new Set(filtered.map((a) => a.owner).filter(Boolean))] as string[];
    const owners = await db.sysUser.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, username: true, displayName: true, email: true },
    });
    const ownerMap = new Map(owners.map((o) => [o.id, o]));

    const enrichedAssets = filtered.map((a) => ({
      ...a,
      owner: a.owner
        ? {
            id: a.owner,
            username: ownerMap.get(a.owner)?.username,
            displayName: ownerMap.get(a.owner)?.displayName,
            email: ownerMap.get(a.owner)?.email,
          }
        : null,
    }));

    const enrichedGroups: Record<string, typeof enrichedAssets> = {};
    for (const [domain, group] of Object.entries(domainGroups)) {
      enrichedGroups[domain] = group.map((a) => ({
        ...a,
        owner: a.owner
          ? {
              id: a.owner,
              username: ownerMap.get(a.owner)?.username,
              displayName: ownerMap.get(a.owner)?.displayName,
              email: ownerMap.get(a.owner)?.email,
            }
          : null,
      }));
    }

    return NextResponse.json({
      summary,
      domains: enrichedGroups,
      assets: enrichedAssets,
      availableDomains: Object.keys(DOMAIN_MAP),
    });
  } catch (error) {
    console.error('DataCatalog GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
