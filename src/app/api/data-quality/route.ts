import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { checkAuthAndPermission } from '@/lib/rbac';
import { jsonParse } from '@/lib/db-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/data-quality — Return data quality metrics across all modules
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    const authCheck = checkAuthAndPermission(tokenPayload, 'data:read');
    if (authCheck.error) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const companyId = tokenPayload!.companyId;
    const moduleFilter = searchParams.get('moduleId');

    // ── 1. Fetch all active modules ──────────────────────────────
    const modules = await db.metaModule.findMany({
      where: {
        isActive: true,
        ...(moduleFilter ? { id: moduleFilter } : {}),
      },
      include: {
        fields: { where: { isActive: true } },
        dataRecords: {
          where: { companyId },
          select: {
            id: true,
            currentPayload: true,
            status: true,
            updatedAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    // ── 2. Fetch existing quality scores ─────────────────────────
    const qualityScores = await db.dataQualityScore.findMany({
      where: {
        ...(moduleFilter ? { moduleId: moduleFilter } : {}),
      },
    });

    // ── 3. Fetch business rules for accuracy calculation ─────────
    const businessRules = await db.businessRule.findMany({
      where: { isActive: true },
    });

    // ── 4. Calculate per-module quality metrics ──────────────────
    const moduleBreakdown = modules.map((mod) => {
      const records = mod.dataRecords;
      const totalRecords = records.length;

      if (totalRecords === 0) {
        return {
          moduleId: mod.id,
          moduleCode: mod.moduleCode,
          moduleName: mod.moduleName,
          totalRecords: 0,
          completeness: 100,
          accuracy: 100,
          consistency: 100,
          timeliness: 100,
          uniqueness: 100,
          overall: 100,
        };
      }

      const requiredFields = mod.fields.filter((f) => f.isRequired);
      const totalRequired = requiredFields.length;

      // ── Completeness: % of required fields filled across all records ──
      let filledCount = 0;
      let totalRequiredSlots = 0;

      records.forEach((rec) => {
        let payload: Record<string, unknown> = {};
        try {
          payload = jsonParse<Record<string, unknown>>(rec.currentPayload || '{}');
        } catch {
          // ignore parse errors
        }

        requiredFields.forEach((field) => {
          totalRequiredSlots++;
          const value = payload[field.fieldCode];
          if (value !== null && value !== undefined && value !== '') {
            filledCount++;
          }
        });
      });

      const completeness =
        totalRequiredSlots > 0
          ? Math.round((filledCount / totalRequiredSlots) * 100)
          : 100;

      // ── Accuracy: % of records passing validation rules ──
      const moduleRules = businessRules.filter(
        (r) => r.moduleId === mod.id
      );
      let validRecords = totalRecords;

      if (moduleRules.length > 0) {
        validRecords = 0;
        records.forEach((rec) => {
          let payload: Record<string, unknown> = {};
          try {
            payload = jsonParse<Record<string, unknown>>(rec.currentPayload || '{}');
          } catch {
            // Parse errors count as invalid
          }
          let passesAllRules = true;
          for (const rule of moduleRules) {
            try {
              const condition = jsonParse(rule.conditionJson);
              if (!evaluateRuleCondition(condition, payload)) {
                passesAllRules = false;
                break;
              }
            } catch {
              // If rule can't be parsed, skip it
            }
          }
          if (passesAllRules) validRecords++;
        });
      }

      const accuracy = Math.round((validRecords / totalRecords) * 100);

      // ── Consistency: % of records with consistent cross-field values ──
      // Check that records with status ACTIVE have all required fields,
      // and that lookup values match expected patterns
      let consistentRecords = 0;
      records.forEach((rec) => {
        let payload: Record<string, unknown> = {};
        try {
          payload = jsonParse<Record<string, unknown>>(rec.currentPayload || '{}');
        } catch {
          // Parse error = inconsistent
          return;
        }

        let isConsistent = true;

        // ACTIVE records should have all required fields filled
        if (rec.status === 'ACTIVE') {
          for (const field of requiredFields) {
            const value = payload[field.fieldCode];
            if (value === null || value === undefined || value === '') {
              isConsistent = false;
              break;
            }
          }
        }

        // Check EMAIL fields have valid format
        mod.fields
          .filter((f) => f.dataType === 'EMAIL')
          .forEach((field) => {
            const val = payload[field.fieldCode];
            if (
              val &&
              typeof val === 'string' &&
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)
            ) {
              isConsistent = false;
            }
          });

        // Check NUMBER fields contain valid numbers
        mod.fields
          .filter((f) => f.dataType === 'NUMBER')
          .forEach((field) => {
            const val = payload[field.fieldCode];
            if (val !== null && val !== undefined && val !== '') {
              const num = Number(val);
              if (isNaN(num)) {
                isConsistent = false;
              }
            }
          });

        if (isConsistent) consistentRecords++;
      });

      const consistency = Math.round((consistentRecords / totalRecords) * 100);

      // ── Timeliness: % of records updated within expected timeframe ──
      // Consider timely if updated within last 90 days
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const timelyRecords = records.filter(
        (r) => new Date(r.updatedAt) >= ninetyDaysAgo
      ).length;
      const timeliness = Math.round((timelyRecords / totalRecords) * 100);

      // ── Uniqueness: 100% - (duplicate records / total records) ──
      // Detect duplicates by comparing payload signatures on unique fields
      const uniqueFields = mod.fields.filter((f) => f.isUnique);
      let duplicateCount = 0;

      if (uniqueFields.length > 0) {
        const seen = new Map<string, number>();
        records.forEach((rec) => {
          let payload: Record<string, unknown> = {};
          try {
            payload = jsonParse<Record<string, unknown>>(rec.currentPayload || '{}');
          } catch {
            return;
          }
          const key = uniqueFields
            .map((f) => String(payload[f.fieldCode] ?? ''))
            .join('||');
          if (key && seen.has(key)) {
            duplicateCount++;
          } else if (key) {
            seen.set(key, 1);
          }
        });
      }

      const uniqueness = Math.round(
        Math.max(0, 100 - (duplicateCount / totalRecords) * 100)
      );

      // ── Overall: weighted average ──
      const overall = Math.round(
        completeness * 0.3 +
          accuracy * 0.25 +
          consistency * 0.2 +
          timeliness * 0.15 +
          uniqueness * 0.1
      );

      return {
        moduleId: mod.id,
        moduleCode: mod.moduleCode,
        moduleName: mod.moduleName,
        totalRecords,
        completeness,
        accuracy,
        consistency,
        timeliness,
        uniqueness,
        overall,
        duplicateCount,
      };
    });

    // ── 5. Calculate overall quality score ───────────────────────
    const totalAllRecords = moduleBreakdown.reduce(
      (sum, m) => sum + m.totalRecords,
      0
    );

    const overallQuality =
      totalAllRecords > 0
        ? Math.round(
            moduleBreakdown.reduce(
              (sum, m) =>
                sum + m.overall * (m.totalRecords / totalAllRecords),
              0
            )
          )
        : 100;

    const totalDuplicates = moduleBreakdown.reduce(
      (sum, m) => sum + (m.duplicateCount ?? 0),
      0
    );

    // ── 6. Quality trend (last 30 days) ──────────────────────────
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentScores = qualityScores.filter(
      (s) => new Date(s.calculatedAt) >= thirtyDaysAgo
    );

    // Build daily trend buckets
    const trendMap = new Map<string, { sum: number; count: number }>();
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = date.toISOString().split('T')[0];
      trendMap.set(key, { sum: 0, count: 0 });
    }

    recentScores.forEach((score) => {
      const key = new Date(score.calculatedAt).toISOString().split('T')[0];
      const bucket = trendMap.get(key);
      if (bucket) {
        bucket.sum += score.score;
        bucket.count++;
      }
    });

    const qualityTrend = Array.from(trendMap.entries()).map(
      ([date, { sum, count }]) => ({
        date,
        score: count > 0 ? Math.round(sum / count) : null,
      })
    );

    // ── 7. Deduplication stats ───────────────────────────────────
    // Identify merge candidates (records that might be duplicates)
    const mergeCandidates: Array<{
      moduleId: string;
      moduleCode: string;
      recordIds: string[];
      reason: string;
    }> = [];

    modules.forEach((mod) => {
      const uniqueFields = mod.fields.filter((f) => f.isUnique);
      if (uniqueFields.length === 0) return;

      const groups = new Map<string, string[]>();
      mod.dataRecords.forEach((rec) => {
        let payload: Record<string, unknown> = {};
        try {
          payload = jsonParse<Record<string, unknown>>(rec.currentPayload || '{}');
        } catch {
          return;
        }
        const key = uniqueFields
          .map((f) => String(payload[f.fieldCode] ?? ''))
          .join('||');
        if (key) {
          const group = groups.get(key) || [];
          group.push(rec.id);
          groups.set(key, group);
        }
      });

      groups.forEach((ids) => {
        if (ids.length > 1) {
          mergeCandidates.push({
            moduleId: mod.id,
            moduleCode: mod.moduleCode,
            recordIds: ids,
            reason: `Duplicate values on unique fields: ${uniqueFields
              .map((f) => f.fieldCode)
              .join(', ')}`,
          });
        }
      });
    });

    // ── 8. Quality dimension summary ─────────────────────────────
    const dimensions = {
      completeness: {
        score:
          totalAllRecords > 0
            ? Math.round(
                moduleBreakdown.reduce(
                  (sum, m) =>
                    sum + m.completeness * (m.totalRecords / totalAllRecords),
                  0
                )
              )
            : 100,
        description:
          'Percentage of required fields that are filled across all records',
      },
      accuracy: {
        score:
          totalAllRecords > 0
            ? Math.round(
                moduleBreakdown.reduce(
                  (sum, m) =>
                    sum + m.accuracy * (m.totalRecords / totalAllRecords),
                  0
                )
              )
            : 100,
        description:
          'Percentage of records passing all business validation rules',
      },
      consistency: {
        score:
          totalAllRecords > 0
            ? Math.round(
                moduleBreakdown.reduce(
                  (sum, m) =>
                    sum + m.consistency * (m.totalRecords / totalAllRecords),
                  0
                )
              )
            : 100,
        description:
          'Percentage of records with consistent cross-field values',
      },
      timeliness: {
        score:
          totalAllRecords > 0
            ? Math.round(
                moduleBreakdown.reduce(
                  (sum, m) =>
                    sum + m.timeliness * (m.totalRecords / totalAllRecords),
                  0
                )
              )
            : 100,
        description:
          'Percentage of records updated within the expected 90-day timeframe',
      },
      uniqueness: {
        score:
          totalAllRecords > 0
            ? Math.round(
                moduleBreakdown.reduce(
                  (sum, m) =>
                    sum + m.uniqueness * (m.totalRecords / totalAllRecords),
                  0
                )
              )
            : 100,
        description: 'Percentage of non-duplicate records in the system',
      },
    };

    return NextResponse.json({
      overallQuality,
      dimensions,
      moduleBreakdown: moduleBreakdown.map((m) => ({
        moduleId: m.moduleId,
        moduleCode: m.moduleCode,
        moduleName: m.moduleName,
        totalRecords: m.totalRecords,
        completeness: m.completeness,
        accuracy: m.accuracy,
        consistency: m.consistency,
        timeliness: m.timeliness,
        uniqueness: m.uniqueness,
        overall: m.overall,
        duplicateCount: m.duplicateCount,
      })),
      deduplication: {
        totalDuplicates,
        mergeCandidateGroups: mergeCandidates.length,
        mergeCandidates: mergeCandidates.slice(0, 20), // Limit to 20 groups
      },
      qualityTrend,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('DataQuality GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/data-quality — Run quality check and persist scores
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    const authCheck = checkAuthAndPermission(tokenPayload, 'data:read');
    if (authCheck.error) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const companyId = tokenPayload!.companyId;

    // Fetch all active modules
    const modules = await db.metaModule.findMany({
      where: { isActive: true },
      include: {
        fields: { where: { isActive: true } },
        dataRecords: {
          where: { companyId },
          select: {
            id: true,
            currentPayload: true,
            status: true,
            updatedAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const businessRules = await db.businessRule.findMany({
      where: { isActive: true },
    });

    let totalScoresSaved = 0;

    for (const mod of modules) {
      const records = mod.dataRecords;
      const totalRecords = records.length;

      if (totalRecords === 0) continue;

      const requiredFields = mod.fields.filter((f) => f.isRequired);

      // Calculate completeness
      let filledCount = 0;
      let totalRequiredSlots = 0;
      records.forEach((rec) => {
        let payload: Record<string, unknown> = {};
        try { payload = jsonParse<Record<string, unknown>>(rec.currentPayload || '{}'); } catch { /* ignore */ }
        requiredFields.forEach((field) => {
          totalRequiredSlots++;
          const value = payload[field.fieldCode];
          if (value !== null && value !== undefined && value !== '') {
            filledCount++;
          }
        });
      });
      const completeness = totalRequiredSlots > 0 ? Math.round((filledCount / totalRequiredSlots) * 100) : 100;

      // Calculate accuracy
      const moduleRules = businessRules.filter((r) => r.moduleId === mod.id);
      let validRecords = totalRecords;
      if (moduleRules.length > 0) {
        validRecords = 0;
        records.forEach((rec) => {
          let payload: Record<string, unknown> = {};
          try { payload = jsonParse<Record<string, unknown>>(rec.currentPayload || '{}'); } catch { /* */ }
          let passesAllRules = true;
          for (const rule of moduleRules) {
            try {
              const condition = jsonParse(rule.conditionJson);
              if (!evaluateRuleCondition(condition, payload)) {
                passesAllRules = false;
                break;
              }
            } catch { /* skip */ }
          }
          if (passesAllRules) validRecords++;
        });
      }
      const accuracy = Math.round((validRecords / totalRecords) * 100);

      // Calculate consistency
      let consistentRecords = 0;
      records.forEach((rec) => {
        let payload: Record<string, unknown> = {};
        try { payload = jsonParse<Record<string, unknown>>(rec.currentPayload || '{}'); } catch { return; }
        let isConsistent = true;
        if (rec.status === 'ACTIVE') {
          for (const field of requiredFields) {
            const value = payload[field.fieldCode];
            if (value === null || value === undefined || value === '') {
              isConsistent = false;
              break;
            }
          }
        }
        mod.fields.filter((f) => f.dataType === 'EMAIL').forEach((field) => {
          const val = payload[field.fieldCode];
          if (val && typeof val === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
            isConsistent = false;
          }
        });
        mod.fields.filter((f) => f.dataType === 'NUMBER').forEach((field) => {
          const val = payload[field.fieldCode];
          if (val !== null && val !== undefined && val !== '') {
            if (isNaN(Number(val))) isConsistent = false;
          }
        });
        if (isConsistent) consistentRecords++;
      });
      const consistency = Math.round((consistentRecords / totalRecords) * 100);

      // Calculate timeliness
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const timelyRecords = records.filter((r) => new Date(r.updatedAt) >= ninetyDaysAgo).length;
      const timeliness = Math.round((timelyRecords / totalRecords) * 100);

      // Calculate uniqueness
      const uniqueFields = mod.fields.filter((f) => f.isUnique);
      let duplicateCount = 0;
      if (uniqueFields.length > 0) {
        const seen = new Map<string, number>();
        records.forEach((rec) => {
          let payload: Record<string, unknown> = {};
          try { payload = jsonParse<Record<string, unknown>>(rec.currentPayload || '{}'); } catch { return; }
          const key = uniqueFields.map((f) => String(payload[f.fieldCode] ?? '')).join('||');
          if (key && seen.has(key)) {
            duplicateCount++;
          } else if (key) {
            seen.set(key, 1);
          }
        });
      }
      const uniqueness = Math.round(Math.max(0, 100 - (duplicateCount / totalRecords) * 100));

      // Overall
      const overall = Math.round(
        completeness * 0.3 + accuracy * 0.25 + consistency * 0.2 + timeliness * 0.15 + uniqueness * 0.1
      );

      // Save OVERALL score for the module
      // Use upsert on the unique constraint [recordId, metricType, metricCode]
      // Since DataQualityScore is per-record, we'll save one score per module as a summary
      // Using a synthetic recordId for module-level scores
      const existingModuleScore = await db.dataQualityScore.findFirst({
        where: { moduleId: mod.id, metricType: 'MODULE_OVERALL' },
      });

      if (existingModuleScore) {
        await db.dataQualityScore.update({
          where: { id: existingModuleScore.id },
          data: { score: overall, calculatedAt: new Date() },
        });
      } else {
        // Need a recordId since it's required — use first record or create a placeholder
        const firstRecord = records[0];
        if (firstRecord) {
          await db.dataQualityScore.create({
            data: {
              recordId: firstRecord.id,
              moduleId: mod.id,
              metricType: 'MODULE_OVERALL',
              score: overall,
              calculatedAt: new Date(),
            },
          });
        }
      }

      // Save individual dimension scores
      const dimensions = [
        { code: 'completeness', score: completeness },
        { code: 'accuracy', score: accuracy },
        { code: 'consistency', score: consistency },
        { code: 'timeliness', score: timeliness },
        { code: 'uniqueness', score: uniqueness },
      ];

      for (const dim of dimensions) {
        const firstRecord = records[0];
        if (!firstRecord) continue;

        const existing = await db.dataQualityScore.findFirst({
          where: { moduleId: mod.id, metricType: 'DIMENSION', metricCode: dim.code },
        });

        if (existing) {
          await db.dataQualityScore.update({
            where: { id: existing.id },
            data: { score: dim.score, calculatedAt: new Date() },
          });
        } else {
          await db.dataQualityScore.create({
            data: {
              recordId: firstRecord.id,
              moduleId: mod.id,
              metricType: 'DIMENSION',
              metricCode: dim.code,
              score: dim.score,
              calculatedAt: new Date(),
            },
          });
        }
      }

      totalScoresSaved += dimensions.length + 1;
    }

    return NextResponse.json({
      success: true,
      message: `Quality check completed. ${totalScoresSaved} scores saved across ${modules.length} modules.`,
      modulesChecked: modules.length,
      scoresSaved: totalScoresSaved,
    });
  } catch (error) {
    console.error('DataQuality POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ── Helper: Evaluate a business rule condition against a record payload ──
function evaluateRuleCondition(
  condition: {
    leftFieldCode?: string;
    operator?: string;
    rightFieldCode?: string;
    constantValue?: unknown;
  },
  payload: Record<string, unknown>
): boolean {
  const leftValue = condition.leftFieldCode
    ? payload[condition.leftFieldCode]
    : undefined;
  const rightValue = condition.rightFieldCode
    ? payload[condition.rightFieldCode]
    : condition.constantValue;

  const operator = condition.operator || '=';

  switch (operator) {
    case '=':
    case '==':
      return String(leftValue) === String(rightValue);
    case '!=':
      return String(leftValue) !== String(rightValue);
    case '>': {
      const l = Number(leftValue);
      const r = Number(rightValue);
      return !isNaN(l) && !isNaN(r) && l > r;
    }
    case '<': {
      const l = Number(leftValue);
      const r = Number(rightValue);
      return !isNaN(l) && !isNaN(r) && l < r;
    }
    case '>=': {
      const l = Number(leftValue);
      const r = Number(rightValue);
      return !isNaN(l) && !isNaN(r) && l >= r;
    }
    case '<=': {
      const l = Number(leftValue);
      const r = Number(rightValue);
      return !isNaN(l) && !isNaN(r) && l <= r;
    }
    case 'contains':
      return String(leftValue).includes(String(rightValue));
    case 'starts_with':
      return String(leftValue).startsWith(String(rightValue));
    case 'ends_with':
      return String(leftValue).endsWith(String(rightValue));
    case 'is_empty':
      return (
        leftValue === null ||
        leftValue === undefined ||
        leftValue === ''
      );
    case 'is_not_empty':
      return (
        leftValue !== null &&
        leftValue !== undefined &&
        leftValue !== ''
      );
    default:
      return true;
  }
}
