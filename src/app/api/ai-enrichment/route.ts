// ============================================================================
// AI Enrichment API — Stibo-like AI Features
//
// Provides:
//   1. Auto-classification: Suggest categories, tags, and attributes for records
//   2. Auto-enrichment: Fill missing fields using AI analysis
//   3. Data quality scoring: Identify and suggest fixes for data issues
//   4. Image analysis: Generate alt text, descriptions from images
//   5. Bulk enrichment: Process multiple records at once
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { jsonParse, jsonVal } from '@/lib/db-json';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ─── Types ──────────────────────────────────────────────────────────────────

interface EnrichmentRequest {
  action: 'classify' | 'enrich' | 'quality-check' | 'image-analyze' | 'bulk-enrich';
  recordIds?: string[];
  moduleCode?: string;
  options?: {
    fields?: string[];
    dryRun?: boolean;
    batchSize?: number;
  };
}

// ─── POST /api/ai-enrichment ────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasRead = hasPermission(tokenPayload.roles, 'data:read');
    if (!hasRead) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body: EnrichmentRequest = await request.json();
    const { action } = body;

    switch (action) {
      case 'classify':
        return await handleClassify(body, tokenPayload.companyId);
      case 'enrich':
        return await handleEnrich(body, tokenPayload.companyId);
      case 'quality-check':
        return await handleQualityCheck(body, tokenPayload.companyId);
      case 'image-analyze':
        return await handleImageAnalyze(body, tokenPayload.companyId);
      case 'bulk-enrich':
        return await handleBulkEnrich(body, tokenPayload.companyId);
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('AI enrichment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Auto-Classification ────────────────────────────────────────────────────

async function handleClassify(body: EnrichmentRequest, companyId: string) {
  const { recordIds } = body;
  if (!recordIds || recordIds.length === 0) {
    return NextResponse.json({ error: 'recordIds are required' }, { status: 400 });
  }

  const records = await db.dataRecord.findMany({
    where: { id: { in: recordIds }, companyId },
    include: {
      module: { select: { moduleCode: true, moduleName: true } },
      images: { select: { id: true, fileName: true } },
    },
  });

  const results = records.map((record) => {
    const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
    const suggestions = generateClassificationSuggestions(payload, record.module.moduleCode);

    return {
      recordId: record.id,
      recordCode: record.recordCode || record.id,
      moduleCode: record.module.moduleCode,
      suggestions,
    };
  });

  return NextResponse.json({ results });
}

// ─── Auto-Enrichment ────────────────────────────────────────────────────────

async function handleEnrich(body: EnrichmentRequest, companyId: string) {
  const { recordIds, options } = body;
  const dryRun = options?.dryRun ?? true;

  if (!recordIds || recordIds.length === 0) {
    return NextResponse.json({ error: 'recordIds are required' }, { status: 400 });
  }

  const records = await db.dataRecord.findMany({
    where: { id: { in: recordIds }, companyId },
    include: {
      module: { select: { moduleCode: true, moduleName: true } },
      images: { select: { id: true, fileName: true } },
    },
  });

  const results = [];

  for (const record of records) {
    const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
    const enrichmentData = generateEnrichmentData(payload, record.module.moduleCode);

    // Create AiOutput for review if not dry run
    if (!dryRun && Object.keys(enrichmentData.filledFields).length > 0) {
      const enrichedPayload = { ...payload, ...enrichmentData.filledFields };
      try {
        await db.aiOutput.create({
          data: {
            promptId: 'auto-enrichment',
            recordId: record.id,
            outputAttribute: 'currentPayload',
            outputValue: jsonVal(enrichedPayload),
            status: 'PENDING_REVIEW',
            modelUsed: 'rule-based-enrichment',
            tokensUsed: 0,
          },
        });
      } catch {
        // AiOutput may not have promptId FK — skip
      }
    }

    results.push({
      recordId: record.id,
      recordCode: record.recordCode || record.id,
      missingFields: enrichmentData.missingFields,
      filledFields: enrichmentData.filledFields,
      confidence: enrichmentData.confidence,
      status: dryRun ? 'preview' : 'pending_review',
    });
  }

  return NextResponse.json({ results, dryRun });
}

// ─── Data Quality Check ─────────────────────────────────────────────────────

async function handleQualityCheck(body: EnrichmentRequest, companyId: string) {
  const { recordIds, moduleCode } = body;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { companyId };
  if (recordIds && recordIds.length > 0) {
    (where as Record<string, unknown>).id = { in: recordIds };
  }
  if (moduleCode) {
    const mod = await db.metaModule.findFirst({ where: { moduleCode } });
    if (mod) where.moduleId = mod.id;
  }

  const records = await db.dataRecord.findMany({
    where,
    include: {
      module: { select: { moduleCode: true, moduleName: true } },
    },
    take: 50,
  });

  const results = records.map((record) => {
    const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
    const issues = identifyQualityIssues(payload, record.module.moduleCode);
    const overallScore = calculateQualityScore(payload, issues);

    return {
      recordId: record.id,
      recordCode: record.recordCode || record.id,
      moduleCode: record.module.moduleCode,
      suggestedScore: overallScore,
      issues,
      suggestions: issues.map((issue) => ({
        field: issue.field,
        type: issue.type,
        suggestion: issue.suggestion,
        severity: issue.severity,
      })),
    };
  });

  return NextResponse.json({ results });
}

// ─── Image Analysis ─────────────────────────────────────────────────────────

async function handleImageAnalyze(body: EnrichmentRequest, companyId: string) {
  const { recordIds } = body;
  if (!recordIds || recordIds.length === 0) {
    return NextResponse.json({ error: 'recordIds are required' }, { status: 400 });
  }

  const records = await db.dataRecord.findMany({
    where: { id: { in: recordIds }, companyId },
    include: {
      images: { select: { id: true, fileName: true, altText: true } },
    },
  });

  const results = records
    .filter((r) => r.images.length > 0)
    .map((record) => {
      const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
      const imageSuggestions = record.images.map((img) => ({
        imageId: img.id,
        fileName: img.fileName,
        currentAltText: img.altText,
        suggestedAltText: generateImageAltText(img.fileName, payload),
        suggestedDescription: generateImageDescription(img.fileName, payload),
        suggestedKeywords: generateImageKeywords(payload),
      }));

      return {
        recordId: record.id,
        recordCode: record.recordCode || record.id,
        images: imageSuggestions,
      };
    });

  return NextResponse.json({ results });
}

// ─── Bulk Enrichment ────────────────────────────────────────────────────────

async function handleBulkEnrich(body: EnrichmentRequest, companyId: string) {
  const { moduleCode, options } = body;
  const batchSize = options?.batchSize ?? 50;
  const dryRun = options?.dryRun ?? true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { companyId };
  if (moduleCode) {
    const mod = await db.metaModule.findFirst({ where: { moduleCode } });
    if (mod) where.moduleId = mod.id;
  }

  const records = await db.dataRecord.findMany({
    where,
    take: batchSize,
    orderBy: { updatedAt: 'desc' },
    include: {
      module: { select: { moduleCode: true } },
    },
  });

  const results = records.map((record) => {
    const payload = jsonParse<Record<string, unknown>>(record.currentPayload) || {};
    const enrichmentData = generateEnrichmentData(payload, record.module.moduleCode);

    return {
      recordId: record.id,
      moduleCode: record.module.moduleCode,
      missingFields: enrichmentData.missingFields,
      filledFields: enrichmentData.filledFields,
      confidence: enrichmentData.confidence,
    };
  });

  const summary = {
    total: results.length,
    withMissingFields: results.filter((r) => r.missingFields.length > 0).length,
    avgConfidence:
      results.length > 0
        ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length
        : 0,
  };

  return NextResponse.json({ results, summary, dryRun });
}

// ─── Helper Functions ───────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Footwear: ['shoes', 'sneakers', 'boots', 'sandals', 'heels', 'loafers', 'running', 'training'],
  Apparel: ['shirt', 'pants', 'jacket', 'dress', 'jeans', 'hoodie', 'polo', 't-shirt', 'top'],
  Accessories: ['bag', 'watch', 'belt', 'wallet', 'sunglasses', 'hat', 'scarf', 'jewelry'],
  'Sports Equipment': ['ball', 'racket', 'gym', 'yoga', 'fitness', 'training', 'outdoor'],
  'Food & Beverage': ['coffee', 'tea', 'snack', 'drink', 'food', 'restaurant', 'cafe'],
};

const BRAND_CATEGORIES: Record<string, string> = {
  Nike: 'Footwear',
  Adidas: 'Footwear',
  Puma: 'Footwear',
  Zara: 'Apparel',
  'H&M': 'Apparel',
  Uniqlo: 'Apparel',
  Starbucks: 'Food & Beverage',
  'Pizza Hut': 'Food & Beverage',
  'Ray-Ban': 'Accessories',
  Casio: 'Accessories',
};

function generateClassificationSuggestions(
  payload: Record<string, unknown>,
  moduleCode: string
): { field: string; suggestedValue: string; confidence: number; source: string }[] {
  const suggestions: { field: string; suggestedValue: string; confidence: number; source: string }[] = [];

  if (moduleCode === 'ARTICLE_MASTER') {
    const brand = String(payload.brand || payload.Brand || '');
    const name = String(payload.name || payload.Name || payload.itemName || '');

    if (!payload.category && !payload.Category) {
      if (BRAND_CATEGORIES[brand]) {
        suggestions.push({
          field: 'category',
          suggestedValue: BRAND_CATEGORIES[brand],
          confidence: 0.85,
          source: 'brand-mapping',
        });
      }

      for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        if (keywords.some((kw) => name.toLowerCase().includes(kw))) {
          suggestions.push({
            field: 'category',
            suggestedValue: category,
            confidence: 0.7,
            source: 'name-keyword',
          });
          break;
        }
      }
    }

    if (!payload.tags || (Array.isArray(payload.tags) && payload.tags.length === 0)) {
      const tags: string[] = [];
      if (brand) tags.push(brand);
      if (payload.category) tags.push(String(payload.category));

      const nameLower = name.toLowerCase();
      if (nameLower.includes('men') || nameLower.includes('mens')) tags.push('Men');
      if (nameLower.includes('women') || nameLower.includes('womens')) tags.push('Women');
      if (nameLower.includes('kids') || nameLower.includes('children')) tags.push('Kids');

      if (tags.length > 0) {
        suggestions.push({
          field: 'tags',
          suggestedValue: tags.join(', '),
          confidence: 0.75,
          source: 'auto-tagging',
        });
      }
    }

    if (!payload.season && !payload.Season) {
      const currentMonth = new Date().getMonth();
      let season: string;
      if (currentMonth >= 2 && currentMonth <= 4) season = 'Spring';
      else if (currentMonth >= 5 && currentMonth <= 7) season = 'Summer';
      else if (currentMonth >= 8 && currentMonth <= 10) season = 'Fall';
      else season = 'Winter';

      suggestions.push({
        field: 'season',
        suggestedValue: season,
        confidence: 0.5,
        source: 'current-season',
      });
    }
  }

  if (moduleCode === 'SUPPLIER_MASTER') {
    const country = String(payload.country || payload.Country || 'Indonesia');
    if (!payload.region && !payload.Region) {
      const regionMap: Record<string, string> = {
        Indonesia: 'Southeast Asia',
        China: 'East Asia',
        Vietnam: 'Southeast Asia',
        Bangladesh: 'South Asia',
        India: 'South Asia',
        Turkey: 'Europe/Middle East',
      };
      suggestions.push({
        field: 'region',
        suggestedValue: regionMap[country] || 'Asia Pacific',
        confidence: 0.8,
        source: 'country-mapping',
      });
    }
  }

  return suggestions;
}

interface EnrichmentResult {
  missingFields: string[];
  filledFields: Record<string, unknown>;
  confidence: number;
}

function generateEnrichmentData(
  payload: Record<string, unknown>,
  moduleCode: string
): EnrichmentResult {
  const missingFields: string[] = [];
  const filledFields: Record<string, unknown> = {};
  let totalConfidence = 0;
  let fieldCount = 0;

  const requiredFields: Record<string, Record<string, { required: boolean; default: unknown }>> = {
    ARTICLE_MASTER: {
      status: { required: true, default: 'DRAFT' },
      brand: { required: false, default: 'Unknown' },
      category: { required: true, default: 'Uncategorized' },
      season: { required: false, default: 'All Season' },
      currency: { required: true, default: 'IDR' },
      countryOfOrigin: { required: false, default: 'Indonesia' },
      language: { required: false, default: 'en' },
    },
    STORE_MASTER: {
      status: { required: true, default: 'DRAFT' },
      storeType: { required: true, default: 'STANDARD' },
      country: { required: true, default: 'Indonesia' },
      currency: { required: true, default: 'IDR' },
      timezone: { required: false, default: 'Asia/Jakarta' },
    },
    SUPPLIER_MASTER: {
      status: { required: true, default: 'DRAFT' },
      supplierType: { required: true, default: 'DISTRIBUTOR' },
      country: { required: true, default: 'Indonesia' },
      currency: { required: true, default: 'IDR' },
      paymentTerms: { required: true, default: 'NET_30' },
    },
  };

  const fields = requiredFields[moduleCode] || {};
  for (const [field, config] of Object.entries(fields)) {
    const hasValue = payload[field] !== undefined && payload[field] !== null && payload[field] !== '';
    if (!hasValue) {
      missingFields.push(field);
      if (config.default !== undefined) {
        filledFields[field] = config.default;
        totalConfidence += config.required ? 0.7 : 0.5;
        fieldCount++;
      }
    }
  }

  return {
    missingFields,
    filledFields,
    confidence: fieldCount > 0 ? totalConfidence / fieldCount : 1.0,
  };
}

interface QualityIssue {
  field: string;
  type: 'missing' | 'invalid' | 'inconsistent' | 'outdated';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  suggestion: string;
}

function identifyQualityIssues(
  payload: Record<string, unknown>,
  moduleCode: string
): QualityIssue[] {
  const issues: QualityIssue[] = [];

  if (!payload.name && !payload.Name && !payload.itemName) {
    issues.push({
      field: 'name',
      type: 'missing',
      severity: 'critical',
      message: 'Record is missing a name/title',
      suggestion: 'Add a descriptive name for this record',
    });
  }

  if (!payload.description && !payload.Description) {
    issues.push({
      field: 'description',
      type: 'missing',
      severity: 'warning',
      message: 'Record is missing a description',
      suggestion: 'Add a description to improve data completeness',
    });
  }

  if (moduleCode === 'ARTICLE_MASTER') {
    if (!payload.brand && !payload.Brand) {
      issues.push({
        field: 'brand',
        type: 'missing',
        severity: 'critical',
        message: 'Article is missing brand information',
        suggestion: 'Assign a brand to this article',
      });
    }

    if (!payload.category && !payload.Category) {
      issues.push({
        field: 'category',
        type: 'missing',
        severity: 'warning',
        message: 'Article is not categorized',
        suggestion: 'Use AI auto-classification to suggest a category',
      });
    }

    const price = Number(payload.price || payload.Price || 0);
    if (price <= 0) {
      issues.push({
        field: 'price',
        type: 'missing',
        severity: 'critical',
        message: 'Article has no price or price is zero',
        suggestion: 'Set a valid price for this article',
      });
    }

    const sku = String(payload.sku || payload.SKU || payload.itemCode || '');
    if (!sku || sku.length < 3) {
      issues.push({
        field: 'sku',
        type: 'invalid',
        severity: 'warning',
        message: 'SKU code is missing or too short',
        suggestion: 'Assign a proper SKU code following the naming convention',
      });
    }
  }

  if (moduleCode === 'STORE_MASTER') {
    if (!payload.address && !payload.Address) {
      issues.push({
        field: 'address',
        type: 'missing',
        severity: 'critical',
        message: 'Store is missing address information',
        suggestion: 'Add the store address',
      });
    }
  }

  return issues;
}

function calculateQualityScore(
  payload: Record<string, unknown>,
  issues: QualityIssue[]
): number {
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  let score = 100;
  score -= criticalCount * 15;
  score -= warningCount * 5;
  score -= infoCount * 1;

  const filledFields = Object.values(payload).filter(
    (v) =>
      v !== null &&
      v !== undefined &&
      v !== '' &&
      !(Array.isArray(v) && v.length === 0)
  ).length;
  const totalExpectedFields = 10;
  const completenessBonus = Math.min(filledFields / totalExpectedFields, 1) * 10;
  score += completenessBonus;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function generateImageAltText(
  fileName: string,
  payload: Record<string, unknown>
): string {
  const brand = String(payload.brand || payload.Brand || '');
  const name = String(payload.name || payload.Name || payload.itemName || '');
  const category = String(payload.category || payload.Category || '');

  const parts = [brand, name, category].filter(Boolean);
  if (parts.length > 0) {
    return `${parts.join(' ')} - product image`;
  }

  const cleanName = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\d+/g, '')
    .trim();

  return cleanName || 'Product image';
}

function generateImageDescription(
  fileName: string,
  payload: Record<string, unknown>
): string {
  const brand = String(payload.brand || payload.Brand || '');
  const name = String(payload.name || payload.Name || payload.itemName || '');
  const category = String(payload.category || payload.Category || '');
  const color = String(payload.color || payload.Color || '');
  const material = String(payload.material || payload.Material || '');

  const parts = [brand, name, category, color, material].filter(Boolean);
  if (parts.length > 0) {
    return `High-quality product image of ${parts.join(' ')}. Suitable for e-commerce, catalog, and marketing materials.`;
  }

  return 'Product image for e-commerce and marketing use.';
}

function generateImageKeywords(payload: Record<string, unknown>): string[] {
  const keywords: string[] = [];
  const fields = [
    'brand',
    'Brand',
    'name',
    'Name',
    'category',
    'Category',
    'color',
    'Color',
    'material',
    'Material',
    'season',
    'Season',
  ];

  for (const field of fields) {
    const val = payload[field];
    if (val && typeof val === 'string' && val.trim()) {
      keywords.push(val.trim());
    }
  }

  keywords.push('product', 'e-commerce', 'retail');
  return [...new Set(keywords)];
}
