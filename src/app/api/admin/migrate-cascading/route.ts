import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';

// POST /api/admin/migrate-cascading
// Idempotent one-time migration that applies Task 21 deltas to an existing DB:
//   1. Replaces CATEGORY lookup values with Indonesian retail taxonomy
//      (Sepatu/Tas/Pakaian/Aksesoris/Makanan/Elektronik)
//   2. Upserts SUB_CATEGORY lookup with 21 cascading child values (parentValueCode)
//   3. Upserts ARTICLE_TAGS lookup with 7 values (for MULTISELECT)
//   4. Ensures `tags` MULTISELECT field exists on Article Master module
//   5. Links `sub_category` field → SUB_CATEGORY lookup + sets cascadesFromFieldCode='category'
//   6. Links `tags` field → ARTICLE_TAGS lookup
// Safe to run multiple times — uses upserts + soft-delete + re-activate.
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json(
        { error: 'Only Super Admin can run this migration' },
        { status: 403 }
      );
    }

    const summary: Record<string, unknown> = {
      startedAt: new Date().toISOString(),
      steps: [] as string[],
    };

    // ── Step 1: Replace CATEGORY lookup values with Indonesian taxonomy ──
    const categoryLookup = await db.lookupMaster.findUnique({
      where: { lookupCode: 'CATEGORY' },
      include: { values: true },
    });
    if (categoryLookup) {
      const newCategoryValues = [
        { valueCode: 'SEPATU', displayValue: 'Sepatu', sortOrder: 0 },
        { valueCode: 'TAS', displayValue: 'Tas', sortOrder: 1 },
        { valueCode: 'PAKAIAN', displayValue: 'Pakaian', sortOrder: 2 },
        { valueCode: 'AKSESORIS', displayValue: 'Aksesoris', sortOrder: 3 },
        { valueCode: 'MAKANAN', displayValue: 'Makanan & Minuman', sortOrder: 4 },
        { valueCode: 'ELEKTRONIK', displayValue: 'Elektronik', sortOrder: 5 },
      ];
      for (const v of newCategoryValues) {
        await db.lookupValue.upsert({
          where: { lookupId_valueCode: { lookupId: categoryLookup.id, valueCode: v.valueCode } },
          create: { lookupId: categoryLookup.id, ...v, isActive: true },
          update: { displayValue: v.displayValue, sortOrder: v.sortOrder, isActive: true },
        });
      }
      // Soft-delete old English values that aren't in the new list
      const newCodes = newCategoryValues.map((v) => v.valueCode);
      const oldDeactivated = await db.lookupValue.updateMany({
        where: { lookupId: categoryLookup.id, valueCode: { notIn: newCodes } },
        data: { isActive: false },
      });
      summary.steps.push(
        `CATEGORY: upserted ${newCategoryValues.length} Indonesian values, soft-deleted ${oldDeactivated.count} old English values`
      );
    }

    // ── Step 2: Upsert SUB_CATEGORY lookup with 21 cascading child values ──
    let subCategoryLookup = await db.lookupMaster.findUnique({
      where: { lookupCode: 'SUB_CATEGORY' },
    });
    if (!subCategoryLookup) {
      subCategoryLookup = await db.lookupMaster.create({
        data: {
          lookupCode: 'SUB_CATEGORY',
          lookupName: 'Article Sub Category',
          description: 'Sub-kategori artikel dengan relasi ke Category (cascading)',
        },
      });
      summary.steps.push('SUB_CATEGORY: created new lookup');
    } else {
      summary.steps.push('SUB_CATEGORY: existing lookup found');
    }

    const subCategoryValues = [
      { valueCode: 'SEPATU_RUNNING', displayValue: 'Sepatu Running', parentValueCode: 'SEPATU', sortOrder: 0 },
      { valueCode: 'SEPATU_SEKOLAH', displayValue: 'Sepatu Sekolah', parentValueCode: 'SEPATU', sortOrder: 1 },
      { valueCode: 'SEPATU_SNEAKERS', displayValue: 'Sepatu Sneakers', parentValueCode: 'SEPATU', sortOrder: 2 },
      { valueCode: 'SEPATU_SANDAL', displayValue: 'Sepatu Sandal', parentValueCode: 'SEPATU', sortOrder: 3 },
      { valueCode: 'SEPATU_BOOT', displayValue: 'Sepatu Boot', parentValueCode: 'SEPATU', sortOrder: 4 },
      { valueCode: 'TAS_SEKOLAH', displayValue: 'Tas Sekolah', parentValueCode: 'TAS', sortOrder: 5 },
      { valueCode: 'TAS_KERJA', displayValue: 'Tas Kerja', parentValueCode: 'TAS', sortOrder: 6 },
      { valueCode: 'TAS_RANSEL', displayValue: 'Tas Ransel', parentValueCode: 'TAS', sortOrder: 7 },
      { valueCode: 'TAS_TANGAN', displayValue: 'Tas Tangan', parentValueCode: 'TAS', sortOrder: 8 },
      { valueCode: 'PAKAIAN_PRIA', displayValue: 'Pakaian Pria', parentValueCode: 'PAKAIAN', sortOrder: 9 },
      { valueCode: 'PAKAIAN_WANITA', displayValue: 'Pakaian Wanita', parentValueCode: 'PAKAIAN', sortOrder: 10 },
      { valueCode: 'PAKAIAN_ANAK', displayValue: 'Pakaian Anak', parentValueCode: 'PAKAIAN', sortOrder: 11 },
      { valueCode: 'AKS_JAM_TANGAN', displayValue: 'Jam Tangan', parentValueCode: 'AKSESORIS', sortOrder: 12 },
      { valueCode: 'AKS_KACAMATA', displayValue: 'Kacamata', parentValueCode: 'AKSESORIS', sortOrder: 13 },
      { valueCode: 'AKS_TOPI', displayValue: 'Topi', parentValueCode: 'AKSESORIS', sortOrder: 14 },
      { valueCode: 'AKS_SABUK', displayValue: 'Sabuk', parentValueCode: 'AKSESORIS', sortOrder: 15 },
      { valueCode: 'MAKANAN_RINGAN', displayValue: 'Makanan Ringan', parentValueCode: 'MAKANAN', sortOrder: 16 },
      { valueCode: 'MINUMAN', displayValue: 'Minuman', parentValueCode: 'MAKANAN', sortOrder: 17 },
      { valueCode: 'ELEK_HP', displayValue: 'Handphone', parentValueCode: 'ELEKTRONIK', sortOrder: 18 },
      { valueCode: 'ELEK_LAPTOP', displayValue: 'Laptop', parentValueCode: 'ELEKTRONIK', sortOrder: 19 },
      { valueCode: 'ELEK_AKSESORIS', displayValue: 'Aksesoris Elektronik', parentValueCode: 'ELEKTRONIK', sortOrder: 20 },
    ];
    for (const v of subCategoryValues) {
      await db.lookupValue.upsert({
        where: { lookupId_valueCode: { lookupId: subCategoryLookup.id, valueCode: v.valueCode } },
        create: { lookupId: subCategoryLookup.id, ...v, isActive: true },
        update: { displayValue: v.displayValue, parentValueCode: v.parentValueCode, sortOrder: v.sortOrder, isActive: true },
      });
    }
    // Resolve parentValueId from parentValueCode (within same lookup)
    const allSubs = await db.lookupValue.findMany({
      where: { lookupId: subCategoryLookup.id, isActive: true },
      select: { id: true, valueCode: true, parentValueCode: true, parentValueId: true },
    });
    const codeToId = new Map(allSubs.map((v) => [v.valueCode, v.id]));
    // Also include category codes → ids (since SUB_CATEGORY parentValueCode points to CATEGORY codes, not SUB_CATEGORY codes)
    if (categoryLookup) {
      const catVals = await db.lookupValue.findMany({
        where: { lookupId: categoryLookup.id, isActive: true },
        select: { id: true, valueCode: true },
      });
      for (const cv of catVals) codeToId.set(cv.valueCode, cv.id);
    }
    for (const v of allSubs) {
      if (v.parentValueCode) {
        const expectedParentId = codeToId.get(v.parentValueCode) ?? null;
        if (v.parentValueId !== expectedParentId) {
          await db.lookupValue.update({
            where: { id: v.id },
            data: { parentValueId: expectedParentId },
          });
        }
      }
    }
    summary.steps.push(`SUB_CATEGORY: upserted ${subCategoryValues.length} cascading child values + resolved parentValueId`);

    // ── Step 3: Upsert ARTICLE_TAGS lookup ──
    let tagsLookup = await db.lookupMaster.findUnique({
      where: { lookupCode: 'ARTICLE_TAGS' },
    });
    if (!tagsLookup) {
      tagsLookup = await db.lookupMaster.create({
        data: {
          lookupCode: 'ARTICLE_TAGS',
          lookupName: 'Article Tags',
          description: 'Multi-select tag list for articles',
        },
      });
      summary.steps.push('ARTICLE_TAGS: created new lookup');
    } else {
      summary.steps.push('ARTICLE_TAGS: existing lookup found');
    }
    const tagValues = [
      { valueCode: 'NEW_ARRIVAL', displayValue: 'New Arrival', sortOrder: 0 },
      { valueCode: 'BEST_SELLER', displayValue: 'Best Seller', sortOrder: 1 },
      { valueCode: 'SALE', displayValue: 'Sale', sortOrder: 2 },
      { valueCode: 'FEATURED', displayValue: 'Featured', sortOrder: 3 },
      { valueCode: 'LIMITED', displayValue: 'Limited Edition', sortOrder: 4 },
      { valueCode: 'EXCLUSIVE', displayValue: 'Exclusive', sortOrder: 5 },
      { valueCode: 'PREMIUM', displayValue: 'Premium', sortOrder: 6 },
    ];
    for (const v of tagValues) {
      await db.lookupValue.upsert({
        where: { lookupId_valueCode: { lookupId: tagsLookup.id, valueCode: v.valueCode } },
        create: { lookupId: tagsLookup.id, ...v, isActive: true },
        update: { displayValue: v.displayValue, sortOrder: v.sortOrder, isActive: true },
      });
    }
    summary.steps.push(`ARTICLE_TAGS: upserted ${tagValues.length} tag values`);

    // ── Step 4-6: Update Article Master fields ──
    const articleModule = await db.metaModule.findUnique({
      where: { moduleCode: 'ARTICLE_MASTER' },
    });
    if (!articleModule) {
      summary.steps.push('WARNING: ARTICLE_MASTER module not found — skipped field updates');
    } else {
      // Ensure `tags` field exists (MULTISELECT)
      let tagsField = await db.metaField.findUnique({
        where: { moduleId_fieldCode: { moduleId: articleModule.id, fieldCode: 'tags' } },
      });
      if (!tagsField) {
        tagsField = await db.metaField.create({
          data: {
            moduleId: articleModule.id,
            fieldCode: 'tags',
            fieldName: 'Tags',
            dataType: 'MULTISELECT',
            placeholder: 'Pick tags',
            description: 'Multi-value list field (New Arrival, Best Seller, etc.)',
            sortOrder: 9,
            lookupId: tagsLookup.id,
          },
        });
        summary.steps.push('tags field: created new MULTISELECT field linked to ARTICLE_TAGS');
      } else {
        await db.metaField.update({
          where: { id: tagsField.id },
          data: { dataType: 'MULTISELECT', lookupId: tagsLookup.id, isActive: true },
        });
        summary.steps.push('tags field: updated to MULTISELECT + linked to ARTICLE_TAGS');
      }

      // Update `sub_category` field: link to SUB_CATEGORY + set cascadesFromFieldCode
      const subField = await db.metaField.findUnique({
        where: { moduleId_fieldCode: { moduleId: articleModule.id, fieldCode: 'sub_category' } },
      });
      if (subField) {
        await db.metaField.update({
          where: { id: subField.id },
          data: {
            lookupId: subCategoryLookup.id,
            cascadesFromFieldCode: 'category',
            description: 'Pilihan sub-kategori tergantung pada Category yang dipilih.',
            isActive: true,
          },
        });
        summary.steps.push('sub_category field: linked to SUB_CATEGORY + cascadesFromFieldCode=category');
      } else {
        summary.steps.push('WARNING: sub_category field not found on Article Master');
      }

      // Update `category` field description for the cascading hint
      const catField = await db.metaField.findUnique({
        where: { moduleId_fieldCode: { moduleId: articleModule.id, fieldCode: 'category' } },
      });
      if (catField && categoryLookup) {
        await db.metaField.update({
          where: { id: catField.id },
          data: {
            lookupId: categoryLookup.id,
            description: 'Pilih kategori utama. Sub Category akan menyesuaikan pilihan.',
            isActive: true,
          },
        });
        summary.steps.push('category field: linked to CATEGORY + description updated');
      }
    }

    summary.completedAt = new Date().toISOString();
    summary.success = true;

    await logAudit({
      userId: tokenPayload.userId,
      action: 'MIGRATE_CASCADING',
      entityType: 'LookupMaster',
      entityId: subCategoryLookup?.id || '',
      moduleName: 'Migration',
      description: 'Task 21 cascading migration: Indonesian categories + SUB_CATEGORY + ARTICLE_TAGS + field linkage',
      newValues: summary,
      companyId: tokenPayload.companyId,
    });

    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    console.error('Migrate cascading error:', error);
    return NextResponse.json(
      { error: 'Migration failed', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
