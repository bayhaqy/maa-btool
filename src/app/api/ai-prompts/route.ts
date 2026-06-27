import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ============================================================
// Types
// ============================================================

interface UpsertPromptBody {
  id?: string;
  name: string;
  useCase: string;
  description?: string;
  systemPrompt: string;
  userPromptTemplate: string;
  inputAttributes?: string[];
  outputAttribute?: string;
  maxChars?: number;
  persona?: string;
  audience?: string;
  tone?: string;
  language?: string;
  sortOrder?: number;
  isActive?: boolean;
}

// ============================================================
// GET /api/ai-prompts         → list all prompts
// GET /api/ai-prompts?id=xxx  → single prompt
// ============================================================
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowed =
      tokenPayload.roles.includes('Super Admin') ||
      tokenPayload.roles.includes('Manager');
    if (!allowed) {
      return NextResponse.json(
        { error: 'Access denied. Super Admin or Manager role required.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      const prompt = await db.aiPrompt.findUnique({
        where: { id },
        include: { _count: { select: { outputs: true } } },
      });
      if (!prompt) {
        return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
      }
      return NextResponse.json({ prompt });
    }

    const prompts = await db.aiPrompt.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: { _count: { select: { outputs: true } } },
    });

    return NextResponse.json({ prompts });
  } catch (error) {
    console.error('AI prompts GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================
// POST /api/ai-prompts — create (Super Admin only) or seed defaults
// Body: { action?: 'seed-defaults', ...UpsertPromptBody }
// ============================================================
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!tokenPayload.roles.includes('Super Admin')) {
      return NextResponse.json(
        { error: 'Access denied. Super Admin role required.' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as UpsertPromptBody & {
      action?: 'seed-defaults';
    };

    // ── Seed defaults ──
    if (body.action === 'seed-defaults') {
      const created = await seedDefaultPrompts();
      await logAudit({
        userId: tokenPayload.userId,
        action: 'AI_PROMPT_SEED',
        entityType: 'AiPrompt',
        description: `Seeded ${created.length} default STIBO AI prompt templates`,
        newValues: { count: created.length, codes: created.map((p) => p.useCase) },
        companyId: tokenPayload.companyId,
      });
      return NextResponse.json({ created, count: created.length });
    }

    // ── Create single prompt ──
    const {
      name,
      useCase,
      description,
      systemPrompt,
      userPromptTemplate,
      inputAttributes,
      outputAttribute,
      maxChars,
      persona,
      audience,
      tone,
      language,
      sortOrder,
      isActive,
    } = body;

    if (!name || !useCase || !systemPrompt || !userPromptTemplate) {
      return NextResponse.json(
        {
          error:
            'name, useCase, systemPrompt, and userPromptTemplate are required',
        },
        { status: 400 }
      );
    }

    const prompt = await db.aiPrompt.create({
      data: {
        name,
        useCase,
        description: description || null,
        systemPrompt,
        userPromptTemplate,
        inputAttributes: inputAttributes ? JSON.stringify(inputAttributes) : null,
        outputAttribute: outputAttribute || null,
        maxChars: typeof maxChars === 'number' ? maxChars : 500,
        persona: persona || null,
        audience: audience || null,
        tone: tone || null,
        language: language || null,
        sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
        isActive: isActive !== false,
      },
    });

    await logAudit({
      userId: tokenPayload.userId,
      action: 'AI_PROMPT_CREATE',
      entityType: 'AiPrompt',
      entityId: prompt.id,
      description: `Created AI prompt "${name}" (${useCase})`,
      newValues: { name, useCase, outputAttribute },
      companyId: tokenPayload.companyId,
    });

    return NextResponse.json({ prompt }, { status: 201 });
  } catch (error) {
    console.error('AI prompts POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================
// PUT /api/ai-prompts — update (Super Admin only)
// Body: UpsertPromptBody (with id)
// ============================================================
export async function PUT(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!tokenPayload.roles.includes('Super Admin')) {
      return NextResponse.json(
        { error: 'Access denied. Super Admin role required.' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as UpsertPromptBody;
    const { id, ...rest } = body;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.aiPrompt.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
    }

    const updated = await db.aiPrompt.update({
      where: { id },
      data: {
        name: rest.name,
        useCase: rest.useCase,
        description: rest.description || null,
        systemPrompt: rest.systemPrompt,
        userPromptTemplate: rest.userPromptTemplate,
        inputAttributes: rest.inputAttributes
          ? JSON.stringify(rest.inputAttributes)
          : existing.inputAttributes,
        outputAttribute: rest.outputAttribute || null,
        maxChars: typeof rest.maxChars === 'number' ? rest.maxChars : existing.maxChars,
        persona: rest.persona || null,
        audience: rest.audience || null,
        tone: rest.tone || null,
        language: rest.language || null,
        sortOrder: typeof rest.sortOrder === 'number' ? rest.sortOrder : existing.sortOrder,
        isActive: rest.isActive !== undefined ? rest.isActive : existing.isActive,
      },
    });

    await logAudit({
      userId: tokenPayload.userId,
      action: 'AI_PROMPT_UPDATE',
      entityType: 'AiPrompt',
      entityId: id,
      description: `Updated AI prompt "${rest.name || existing.name}"`,
      companyId: tokenPayload.companyId,
    });

    return NextResponse.json({ prompt: updated });
  } catch (error) {
    console.error('AI prompts PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================
// DELETE /api/ai-prompts?id=xxx — delete (Super Admin only)
// ============================================================
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!tokenPayload.roles.includes('Super Admin')) {
      return NextResponse.json(
        { error: 'Access denied. Super Admin role required.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.aiPrompt.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
    }

    await db.aiPrompt.delete({ where: { id } });

    await logAudit({
      userId: tokenPayload.userId,
      action: 'AI_PROMPT_DELETE',
      entityType: 'AiPrompt',
      entityId: id,
      description: `Deleted AI prompt "${existing.name}" (${existing.useCase})`,
      companyId: tokenPayload.companyId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('AI prompts DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================
// Seed 11 STIBO default prompt templates
// ============================================================

interface SeedTemplate {
  name: string;
  useCase: string;
  description: string;
  systemPrompt: string;
  userPromptTemplate: string;
  outputAttribute: string;
  persona: string;
  audience: string;
  tone: string;
  language: string;
  sortOrder: number;
}

const SEED_TEMPLATES: SeedTemplate[] = [
  {
    name: 'Marketing Description Generator',
    useCase: 'PTTT02',
    description:
      'Generate compelling, conversion-focused marketing copy from core product attributes.',
    systemPrompt:
      'You are an expert e-commerce copywriter for premium retail brands. Write compelling, SEO-friendly marketing descriptions. Highlight benefits (not just features), use sensory language, and keep paragraphs short. Never invent specifications that are not in the input. Output only the description text.',
    userPromptTemplate:
      'Write a marketing description (max 300 words) for the following product.\n\nProduct Name: {{name}}\nBrand: {{brand}}\nCategory: {{category}}\nColor: {{color}}\nMaterial: {{material}}\nKey Features: {{features}}\n\nTarget audience: general consumers. Tone: premium yet approachable.',
    outputAttribute: 'marketing_description',
    persona: 'E-commerce Copywriter',
    audience: 'Consumer',
    tone: 'Premium, approachable',
    language: 'English',
    sortOrder: 1,
  },
  {
    name: 'Keyword Density Optimizer',
    useCase: 'PTTT03',
    description:
      'Audit a description for SEO keyword density and recommend improvements.',
    systemPrompt:
      'You are an SEO specialist. Analyze the given text for keyword density, prominence, and LSI coverage. Suggest up to 5 concrete improvements. Never fabricate search-volume numbers.',
    userPromptTemplate:
      'Audit the following product description for SEO.\n\nPrimary keyword: {{keyword}}\nDescription:\n{{description}}\n\nReport: keyword density %, prominence, and 3-5 improvement suggestions.',
    outputAttribute: 'seo_audit',
    persona: 'SEO Specialist',
    audience: 'Merchandiser',
    tone: 'Analytical',
    language: 'English',
    sortOrder: 2,
  },
  {
    name: 'Missing Attribute Filler',
    useCase: 'PTTT04',
    description:
      'Identify missing critical attributes and suggest default values from category norms.',
    systemPrompt:
      'You are a master-data steward. Identify which required attributes are missing for the product and propose sensible defaults based on category conventions. Mark each proposal as HIGH / MEDIUM / LOW confidence. Never invent brand or SKU-level identifiers.',
    userPromptTemplate:
      'Review the following product record for missing critical attributes.\n\nName: {{name}}\nCategory: {{category}}\nCurrent Attributes: {{attributes_json}}\n\nReturn a JSON list of missing attributes with proposed default values and confidence.',
    outputAttribute: 'missing_attr_suggestions',
    persona: 'Data Steward',
    audience: 'Catalog Manager',
    tone: 'Precise',
    language: 'English',
    sortOrder: 3,
  },
  {
    name: 'Description from Data + Image',
    useCase: 'PTTT05',
    description:
      'Combine structured product data + image alt-text/labels into a unified rich description.',
    systemPrompt:
      'You are a product content enricher. Merge structured product data with information inferred from image alt text and labels into one cohesive, accurate description. If image data is missing, rely on structured data only. Never fabricate features.',
    userPromptTemplate:
      'Compose a unified product description combining structured data and image-derived info.\n\nStructured data:\n{{attributes_json}}\n\nImage alt text / labels:\n{{image_alt_text}}\n\nReturn a single 200-400 word description.',
    outputAttribute: 'rich_description',
    persona: 'Content Enricher',
    audience: 'Consumer',
    tone: 'Informative',
    language: 'English',
    sortOrder: 4,
  },
  {
    name: 'Group Title Generator',
    useCase: 'GAIDGRP01',
    description: 'Generate a concise, human-readable group/title for product groupings.',
    systemPrompt:
      'You are a catalog taxonomist. Generate a short, clear group title (max 8 words) that captures the common theme of the given products. Use Title Case.',
    userPromptTemplate:
      'Generate a group title for the following products:\n{{products_json}}\n\nReturn only the title text.',
    outputAttribute: 'group_title',
    persona: 'Catalog Taxonomist',
    audience: 'Internal',
    tone: 'Neutral',
    language: 'English',
    sortOrder: 5,
  },
  {
    name: 'Group Description Generator',
    useCase: 'GAIDGRP02',
    description: 'Generate a paragraph describing a product group / category.',
    systemPrompt:
      'You are a catalog taxonomist. Write a 1-2 sentence description (max 60 words) that summarizes the products in the group. Avoid marketing fluff.',
    userPromptTemplate:
      'Write a short description for the following product group.\nGroup title: {{group_title}}\nProducts:\n{{products_json}}\n\nReturn only the description text.',
    outputAttribute: 'group_description',
    persona: 'Catalog Taxonomist',
    audience: 'Internal',
    tone: 'Neutral',
    language: 'English',
    sortOrder: 6,
  },
  {
    name: 'Translation',
    useCase: 'TRANSLATION',
    description:
      'Translate product attributes into the target locale while preserving brand voice.',
    systemPrompt:
      'You are a professional translator specializing in retail product content. Preserve brand names, model numbers, and measurements. Translate naturally — do not translate word-by-word.',
    userPromptTemplate:
      'Translate the following product content into {{target_language}}.\n\nName: {{name}}\nDescription: {{description}}\nFeatures: {{features}}\n\nReturn the translated name, description, and features as JSON.',
    outputAttribute: 'translated_content',
    persona: 'Translator',
    audience: 'Consumer',
    tone: 'Natural',
    language: 'Multilingual',
    sortOrder: 7,
  },
  {
    name: 'Image Alt Text',
    useCase: 'IMAGE_ALT_TEXT',
    description: 'Generate accessible, keyword-rich alt text for product images.',
    systemPrompt:
      'You are an accessibility + SEO specialist. Generate concise alt text (max 125 chars) that describes the image and includes the product name + key attribute. Never start with "Image of".',
    userPromptTemplate:
      'Generate alt text for the following product image.\n\nProduct Name: {{name}}\nCategory: {{category}}\nColor: {{color}}\nImage file name: {{image_file_name}}\n\nReturn only the alt text.',
    outputAttribute: 'image_alt_text',
    persona: 'Accessibility + SEO Specialist',
    audience: 'Consumer',
    tone: 'Descriptive',
    language: 'English',
    sortOrder: 8,
  },
  {
    name: 'Image Text Extraction',
    useCase: 'IMAGE_EXTRACT_TEXT',
    description: 'Extract visible text from a product image (packaging, labels).',
    systemPrompt:
      'You are an OCR assistant. Extract ALL visible text from the given product image, preserving reading order. Do not interpret — only transcribe.',
    userPromptTemplate:
      'Extract all visible text from this product image.\nImage file name: {{image_file_name}}\nProduct: {{name}}\n\nReturn only the extracted text.',
    outputAttribute: 'image_extracted_text',
    persona: 'OCR Assistant',
    audience: 'Internal',
    tone: 'Neutral',
    language: 'English',
    sortOrder: 9,
  },
  {
    name: 'Image Full Description',
    useCase: 'IMAGE_FULL_DESC',
    description:
      'Generate a rich, paragraph-style description of a product based on its image.',
    systemPrompt:
      'You are a visual merchandiser. Describe what you see in the product image — color, shape, material, style, notable details. Use 2-3 sentences. Do not invent features not visible.',
    userPromptTemplate:
      'Describe this product image in detail.\nProduct Name: {{name}}\nImage file name: {{image_file_name}}\n\nReturn 2-3 sentences.',
    outputAttribute: 'image_full_description',
    persona: 'Visual Merchandiser',
    audience: 'Consumer',
    tone: 'Descriptive',
    language: 'English',
    sortOrder: 10,
  },
  {
    name: 'Image SEO Keywords',
    useCase: 'IMAGE_SEO_KEYWORDS',
    description: 'Generate SEO keywords/tags from a product image.',
    systemPrompt:
      'You are an SEO specialist. Generate 5-10 relevant search keywords for the given product image. Use lowercase, comma-separated, no duplicates.',
    userPromptTemplate:
      'Generate SEO keywords for this product image.\nProduct Name: {{name}}\nCategory: {{category}}\nImage file name: {{image_file_name}}\n\nReturn only a comma-separated list.',
    outputAttribute: 'image_seo_keywords',
    persona: 'SEO Specialist',
    audience: 'Internal',
    tone: 'Neutral',
    language: 'English',
    sortOrder: 11,
  },
];

async function seedDefaultPrompts(): Promise<
  Array<{
    id: string;
    name: string;
    useCase: string;
  }>
> {
  // Skip prompts that already exist (by useCase).
  const existing = await db.aiPrompt.findMany({
    where: { useCase: { in: SEED_TEMPLATES.map((t) => t.useCase) } },
    select: { useCase: true },
  });
  const existingSet = new Set(existing.map((p) => p.useCase));
  const toCreate = SEED_TEMPLATES.filter((t) => !existingSet.has(t.useCase));

  const created: Array<{ id: string; name: string; useCase: string }> = [];
  for (const tpl of toCreate) {
    const prompt = await db.aiPrompt.create({
      data: {
        name: tpl.name,
        useCase: tpl.useCase,
        description: tpl.description,
        systemPrompt: tpl.systemPrompt,
        userPromptTemplate: tpl.userPromptTemplate,
        outputAttribute: tpl.outputAttribute,
        persona: tpl.persona,
        audience: tpl.audience,
        tone: tpl.tone,
        language: tpl.language,
        sortOrder: tpl.sortOrder,
        isActive: true,
      },
    });
    created.push({ id: prompt.id, name: prompt.name, useCase: prompt.useCase });
  }
  return created;
}
