'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  BookOpen, Search, Plus, Eye, Calendar, User, Tag, ChevronRight, FileText,
  Edit3, FileCode, Upload, X, Star, Image as ImageIcon, Paperclip, Trash2, Loader2,
  Code, List, Bold, Italic, Heading1, Heading2, Heading3, Link as LinkIcon, Quote,
  ExternalLink, Check, Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

/* ----------------------------------------------------------------------------
 * Shared markdown rendering configuration
 * --------------------------------------------------------------------------
 * Uses remark-gfm (GitHub-Flavored Markdown → tables, strikethrough, task
 * lists, autolinks) and rehype-highlight (syntax highlighting via
 * highlight.js). The visual styling lives in the `.md-render` class in
 * globals.css (no @tailwindcss/typography dependency required).
 * -------------------------------------------------------------------------- */

/**
 * Extract a human-readable language label from a fenced code block className
 * (e.g. `"hljs language-typescript"` → `"typescript"`).
 */
function getLanguage(className?: string): string | null {
  if (!className) return null;
  const match = /language-(\w+)/.exec(className);
  return match ? match[1] : null;
}

/** Tiny self-contained copy button rendered in the top-right of each code block. */
function CopyCodeButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Code copied to clipboard');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Failed to copy code');
    }
  }, [text]);
  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : 'Copy code'}
      className="absolute top-2 right-2 inline-flex items-center justify-center h-7 w-7 rounded-md
                 bg-slate-800/70 hover:bg-slate-700 text-slate-200 hover:text-white
                 border border-slate-700/60 transition-colors
                 opacity-0 group-hover:opacity-100 focus:opacity-100"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/**
 * Code block renderer with a "copy to clipboard" button.
 * Inline code (`code` without a parent `pre`) is left to the CSS.
 */
const MarkdownCode: Components['code'] = ({ className, children, ...props }) => {
  const text = String(children ?? '');
  const isInline = !className && !text.includes('\n');
  if (isInline) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }
  const lang = getLanguage(className);
  const raw = text.replace(/\n$/, '');
  return (
    <code className={className} data-lang={lang ?? undefined} {...props}>
      {children}
      <CopyCodeButton text={raw} />
    </code>
  );
};

const markdownComponents: Components = {
  // External links open safely in a new tab; same-origin links stay in-tab.
  a: ({ node: _node, ...props }) => {
    const href = props.href ?? '';
    const isExternal = /^https?:\/\//i.test(href) || href.startsWith('mailto:');
    if (isExternal) {
      return (
        <a {...props} target="_blank" rel="noopener noreferrer">
          {props.children}
        </a>
      );
    }
    return <a {...props}>{props.children}</a>;
  },
  // Images: responsive + lazy-loaded + accessible alt text. The .md-render CSS handles the rest.
  img: ({ node: _node, alt, ...props }) => (
    <img alt={alt ?? ''} loading="lazy" {...props} />
  ),
  // Wrap <pre> so the copy button can be absolutely positioned inside it.
  pre: ({ node: _node, ...props }) => (
    <pre className="group" {...props} />
  ),
  code: MarkdownCode,
};

/**
 * remark-gfm enables GFM tables, strikethrough, task lists, and autolinks.
 *
 * `PluggableList` (from `unified`, a transitive dep of react-markdown) is the
 * exact type react-markdown expects for both `remarkPlugins` and
 * `rehypePlugins`. Using it directly avoids the readonly/mutable array
 * mismatch that arises when tuple literals are inferred.
 */
const REMARK_PLUGINS: import('unified').PluggableList = [remarkGfm];

/**
 * rehype-highlight performs syntax highlighting on fenced code blocks via
 * highlight.js. `detect: true` auto-detects the language for blocks without
 * an explicit fence language; `ignoreMissing: true` skips unknown languages
 * instead of throwing.
 */
const REHYPE_PLUGINS: import('unified').PluggableList = [
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
];

const CATEGORIES = [
  { value: 'GETTING_STARTED', label: 'Getting Started', color: 'bg-red-100 text-red-700 border-red-300' },
  { value: 'HOW_TO', label: 'How-To', color: 'bg-teal-100 text-teal-700 border-teal-300' },
  { value: 'API_DOCS', label: 'API Docs', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { value: 'BEST_PRACTICES', label: 'Best Practices', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { value: 'FEATURE_GUIDES', label: 'Feature Guides', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'FAQ', label: 'FAQ', color: 'bg-rose-100 text-rose-700 border-rose-300' },
];

// Default documentation content for MAA BTOOL features
const DEFAULT_DOCS = [
  {
    title: 'Getting Started with MAA BTOOL',
    slug: 'getting-started',
    category: 'GETTING_STARTED',
    content: `# Getting Started with MAA BTOOL

Welcome to **MAA BTOOL** — the Enterprise Master Data Management platform for **MAP Group (PT Mitra Adiperkasa Tbk)**.

## Overview

MAA BTOOL provides a comprehensive MDM solution with:

- **Dynamic Module Builder** — Create custom data modules with any field structure
- **Maker-Checker Workflow** — Amendment approval process with version history
- **Hierarchy Management** — Build and manage organizational/brand hierarchies
- **Bulk Import/Export** — CSV-based data import with semicolon delimiter
- **API Management** — RESTful API access with key-based authentication
- **Row-Level Security** — Data access filtered by user attributes
- **Documentation Hub** — Markdown-based knowledge base (you're here!)

## Quick Start

1. **Login** with your assigned credentials
2. **Navigate** to Data Records to view your assigned modules
3. **Create** new records or edit existing ones
4. **Submit** changes for approval through the workflow
5. **Use** the Documentation Hub for reference

## User Roles

| Role | Access Level |
|------|-------------|
| Super Admin | Full access to all features |
| Manager | Data read/write, approval authority |
| Data Entry | Create and edit data records |
| Viewer | Read-only data access |
| Doc Writer | Manage documentation content |
| API Manager | Manage API keys and access |
| AI User | Access AI assistant features |

## Need Help?

Contact your system administrator or check the FAQ section.`,
    isPublished: true,
    tags: 'welcome,introduction,quickstart',
  },
  {
    title: 'Data Records & CRUD Operations',
    slug: 'data-records-guide',
    category: 'FEATURE_GUIDES',
    content: `# Data Records & CRUD Operations

## Creating Records

1. Navigate to **Data Records** from the sidebar
2. Select a module from the dropdown
3. Click **Create Record** button
4. Fill in the required fields (marked with *)
5. Click **Save** to create as Draft, or submit for approval

## Editing Records

- **Draft records** can be edited directly
- **Active records** require an amendment request (Request Amendment button)
- The amendment creates a **Revision Pending** status with version tracking

## Field Types

| Type | Description |
|------|-------------|
| TEXT | Free text input |
| NUMBER | Numeric values |
| DATE | Date picker |
| BOOLEAN | True/False toggle |
| SELECT | Dropdown with predefined values |
| MULTISELECT | Multiple selection dropdown |
| EMAIL | Email validation |
| URL | URL validation |
| LOOKUP | Reference to lookup master data |
| IMAGE | Image upload with multiple file support |

## Image Upload

- Supports: JPG, PNG, GIF, WebP, HEIC, AVIF, SVG
- Maximum file size: 20MB per image
- Multiple images per IMAGE field
- Drag & drop or click to browse
- Set primary image with star button`,
    isPublished: true,
    tags: 'records,crud,create,edit,fields',
  },
  {
    title: 'Approval Workflow',
    slug: 'approval-workflow-guide',
    category: 'FEATURE_GUIDES',
    content: `# Approval Workflow

MAA BTOOL implements a **Maker-Checker** workflow to ensure data quality and governance.

## How It Works

\`\`\`
DRAFT → IN_REVIEW → ACTIVE
                ↓       ↑
            REJECTED   REVISION_PENDING
                ↓
            (Back to DRAFT)
\`\`\`

## Status Definitions

| Status | Description |
|--------|-------------|
| **DRAFT** | Initial state, can be edited freely |
| **IN_REVIEW** | Submitted for approval |
| **ACTIVE** | Approved and live in production |
| **REVISION_PENDING** | Amendment requested on active record |
| **REJECTED** | Rejected by reviewer |
| **ARCHIVED** | Soft-deleted, hidden from views |

## Amendment Process

1. **Active** record → Click "Request Amendment"
2. Edit the desired fields
3. Save changes → Record becomes **Revision Pending**
4. An approval ticket is automatically created
5. Reviewer sees the **diff** between old and new values
6. Approve → Changes go live, version increments
7. Reject → Record stays Active with original values

## Version History

Every approval creates a version snapshot:
- Version number auto-increments
- Changed by user is recorded
- Change reason/review notes are preserved
- Full payload snapshot is stored for audit`,
    isPublished: true,
    tags: 'workflow,approval,amendment,maker-checker',
  },
  {
    title: 'Bulk Import Guide',
    slug: 'bulk-import-guide',
    category: 'HOW_TO',
    content: `# Bulk Import Guide

## CSV Format

MAA BTOOL uses **CSV format with semicolon (;) delimiter** for bulk imports.

## Using Paste Mode

1. Navigate to **Bulk Import** from the sidebar
2. Select the target module
3. Choose **Paste Mode**
4. Paste your CSV data directly into the text area

## CSV Format Example

\`\`\`csv
ARTICLE_CODE;ARTICLE_NAME;BRAND;CATEGORY;SEASON
ART001;Nike Air Max;NIKE;SHOES;SS2024
ART002;Adidas Ultraboost;ADIDAS;SHOES;FW2024
\`\`\`

## Important Notes

- First row must be the **header** with field codes
- Use **semicolon (;)** as delimiter
- Text values should not be quoted unless they contain semicolons
- Empty values are treated as null
- All records are created in **DRAFT** status
- After import, submit records for approval via the Workflow page`,
    isPublished: true,
    tags: 'import,bulk,csv,upload',
  },
  {
    title: 'API Documentation',
    slug: 'api-documentation',
    category: 'API_DOCS',
    content: `# API Documentation

## Base URL

\`\`\`
https://your-domain.com/api
\`\`\`

## Authentication

All API requests require a Bearer token in the Authorization header:

\`\`\`
Authorization: Bearer YOUR_API_KEY
\`\`\`

## Endpoints

### Records

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/records?moduleId=xxx | List records |
| GET | /api/records?action=detail&id=xxx | Get record detail |
| POST | /api/records | Create record |
| PUT | /api/records?action=update | Update record |
| PUT | /api/records?action=transition | Change status |
| DELETE | /api/records | Archive record |

### Modules

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/modules | List modules |
| GET | /api/modules?action=detail&id=xxx | Get module with fields |

### Images

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/images?recordId=xxx | List images |
| POST | /api/images | Upload image (multipart) |
| DELETE | /api/images?imageId=xxx | Delete image |

## Rate Limiting

Default rate limit: **100 requests per minute** per API key.

## Error Responses

\`\`\`json
{
  "error": "Description of the error"
}
\`\`\`

Common HTTP status codes:
- **400** — Bad request / validation error
- **401** — Unauthorized / invalid token
- **403** — Insufficient permissions
- **404** — Resource not found
- **422** — Validation failed
- **429** — Rate limit exceeded`,
    isPublished: true,
    tags: 'api,rest,documentation,authentication',
  },
  {
    title: 'Hierarchy Manager Guide',
    slug: 'hierarchy-manager-guide',
    category: 'FEATURE_GUIDES',
    content: `# Hierarchy Manager

## Overview

The Hierarchy Manager allows you to build and manage organizational structures, brand hierarchies, and category trees.

## Creating Hierarchies

1. Navigate to **Hierarchy Manager**
2. Click **Create Hierarchy**
3. Select a module and name your hierarchy
4. Add nodes to build the tree structure

## Node Operations

- **Add root node** — Top-level entry
- **Add child node** — Under an existing node
- **Link to record** — Connect hierarchy node to a data record
- **Reorder** — Change the sort order of sibling nodes

## Use Cases

- **Brand Hierarchy** — Brand → Sub-brand → Product Line
- **Store Hierarchy** — Region → City → Store
- **Category Hierarchy** — Department → Category → Sub-category
- **Organization** — Division → Department → Team`,
    isPublished: true,
    tags: 'hierarchy,tree,structure,organization',
  },
];

interface DocArticle {
  id: string;
  title: string;
  slug: string;
  content: string;
  category: string;
  tags: string | null;
  authorId: string | null;
  version: number;
  sortOrder: number;
  isPublished: boolean;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  author?: { id: string; username: string; displayName: string | null } | null;
}

// Markdown toolbar buttons
const MD_TOOLBAR = [
  { icon: Bold, label: 'Bold', prefix: '**', suffix: '**' },
  { icon: Italic, label: 'Italic', prefix: '_', suffix: '_' },
  { icon: Heading1, label: 'H1', prefix: '# ', suffix: '' },
  { icon: Heading2, label: 'H2', prefix: '## ', suffix: '' },
  { icon: Heading3, label: 'H3', prefix: '### ', suffix: '' },
  { icon: List, label: 'List', prefix: '- ', suffix: '' },
  { icon: Code, label: 'Code', prefix: '`', suffix: '`' },
  { icon: LinkIcon, label: 'Link', prefix: '[', suffix: '](url)' },
  { icon: Quote, label: 'Quote', prefix: '> ', suffix: '' },
];

export default function DocumentationPage() {
  const { token, user } = useAppStore();
  const [docs, setDocs] = useState<DocArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingDoc, setViewingDoc] = useState<DocArticle | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<DocArticle | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ fileName: string; filePath: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [form, setForm] = useState({
    title: '', slug: '', content: '', category: 'GETTING_STARTED',
    tags: '', isPublished: false,
  });

  const canWrite = user?.roles?.some(r => ['Super Admin', 'Doc Writer'].includes(r)) ?? false;

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      // Public access: no token needed, but use if available
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const res = await fetch('/api/documentation?public=true', { headers });
      const data = await res.json();
      if (res.ok) {
        setDocs(data.docs || []);
      } else {
        toast.error(data.error || 'Failed to load documentation');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const filteredDocs = useMemo(() => {
    return docs.filter((doc) => {
      if (selectedCategory !== 'ALL' && doc.category !== selectedCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          doc.title.toLowerCase().includes(q) ||
          doc.content.toLowerCase().includes(q) ||
          (doc.tags || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [docs, selectedCategory, searchQuery]);

  const categoryConfig = (cat: string) => CATEGORIES.find(c => c.value === cat) || CATEGORIES[0];

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const openCreate = () => {
    setEditDoc(null);
    setForm({ title: '', slug: '', content: '', category: 'GETTING_STARTED', tags: '', isPublished: false });
    setUploadedFiles([]);
    setDialogOpen(true);
  };

  const openEdit = (doc: DocArticle) => {
    setEditDoc(doc);
    setForm({
      title: doc.title,
      slug: doc.slug,
      content: doc.content,
      category: doc.category,
      tags: doc.tags || '',
      isPublished: doc.isPublished,
    });
    setUploadedFiles([]);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.content || !form.category) {
      toast.error('Title, content, and category are required');
      return;
    }
    setSaving(true);
    try {
      if (editDoc) {
        const res = await fetch('/api/documentation', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            id: editDoc.id,
            title: form.title,
            content: form.content,
            category: form.category,
            tags: form.tags,
            isPublished: form.isPublished,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to update'); return; }
        toast.success('Article updated');
      } else {
        const slug = form.slug || form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const res = await fetch('/api/documentation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...form, slug }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to create'); return; }
        toast.success('Article created');
      }
      setDialogOpen(false);
      setEditDoc(null);
      loadDocs();
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm('Delete this article?')) return;
    try {
      const res = await fetch(`/api/documentation?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to delete'); return; }
      toast.success('Article deleted');
      setViewingDoc(null);
      loadDocs();
    } catch {
      toast.error('Network error');
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      const res = await fetch('/api/doc-upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Upload failed'); return; }
      
      const newFiles = data.files as Array<{ fileName: string; filePath: string }>;
      setUploadedFiles(prev => [...prev, ...newFiles]);
      
      // Insert markdown for uploaded images/files
      const textarea = contentRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const before = form.content.substring(0, start);
        const after = form.content.substring(start);
        const inserts = newFiles.map(f => {
          const isImage = /\.(jpg|jpeg|png|gif|webp|heic|heif|avif|svg|bmp|tiff)$/i.test(f.fileName);
          return isImage ? `![${f.fileName}](${f.filePath})` : `[${f.fileName}](${f.filePath})`;
        }).join('\n');
        const newContent = before + inserts + '\n' + after;
        setForm(prev => ({ ...prev, content: newContent }));
      }
      
      toast.success(`${newFiles.length} file(s) uploaded`);
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const insertMarkdown = (prefix: string, suffix: string) => {
    const textarea = contentRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = form.content.substring(start, end);
    const before = form.content.substring(0, start);
    const after = form.content.substring(end);
    const newContent = before + prefix + selected + suffix + after;
    setForm(prev => ({ ...prev, content: newContent }));
    // Focus back and set cursor
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = start + prefix.length;
      textarea.selectionEnd = start + prefix.length + selected.length;
    }, 0);
  };

  // Seed default documentation if no docs exist
  const handleSeedDefaults = async () => {
    if (!token) return;
    setSaving(true);
    try {
      let created = 0;
      for (const doc of DEFAULT_DOCS) {
        // Check if already exists
        const existing = docs.find(d => d.slug === doc.slug);
        if (!existing) {
          const res = await fetch('/api/documentation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(doc),
          });
          if (res.ok) created++;
        }
      }
      if (created > 0) {
        toast.success(`${created} documentation articles created`);
        loadDocs();
      } else {
        toast.info('All default documentation already exists');
      }
    } catch {
      toast.error('Failed to seed documentation');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96 lg:col-span-3" />
        </div>
      </div>
    );
  }

  // Article View Mode
  if (viewingDoc) {
    const catConfig = categoryConfig(viewingDoc.category);
    return (
      <div className="p-4 lg:p-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setViewingDoc(null)} className="h-9 w-9">
            <ChevronRight className="w-4 h-4 rotate-180" />
          </Button>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Badge className={cn('text-xs border font-medium', catConfig.color)}>
                {catConfig.label}
              </Badge>
              <Badge variant="outline" className="text-xs">v{viewingDoc.version}</Badge>
              <Badge variant="outline" className="text-xs">
                <Eye className="w-3 h-3 mr-1" /> {viewingDoc.viewCount} views
              </Badge>
            </div>
            <h1 className="text-2xl font-bold">{viewingDoc.title}</h1>
          </div>
          {canWrite && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(viewingDoc)} className="h-8">
                <Edit3 className="w-3.5 h-3.5 mr-1" /> Edit
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-destructive hover:text-destructive" onClick={() => handleDelete(viewingDoc.id)}>
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {viewingDoc.author && (
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              {viewingDoc.author.displayName || viewingDoc.author.username}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {formatDate(viewingDoc.updatedAt)}
          </span>
          {viewingDoc.tags && (
            <span className="flex items-center gap-1">
              <Tag className="w-3.5 h-3.5" />
              {viewingDoc.tags}
            </span>
          )}
        </div>

        <Separator />

        {/* Markdown Rendered Content */}
        <div className="md-render max-w-none">
          <ReactMarkdown
            remarkPlugins={REMARK_PLUGINS}
            rehypePlugins={REHYPE_PLUGINS}
            components={markdownComponents}
          >
            {viewingDoc.content}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  // List Mode
  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-red-600" />
            Documentation Hub
          </h2>
          <p className="text-muted-foreground text-sm mt-1">Knowledge base, feature guides, and how-to documentation</p>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && docs.length === 0 && (
            <Button variant="outline" size="sm" onClick={handleSeedDefaults} disabled={saving} className="h-9">
              <Star className="w-4 h-4 mr-1" /> Load Defaults
            </Button>
          )}
          {canWrite && (
            <Button className="bg-red-600 hover:bg-red-700 text-white h-9" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" /> Write Article
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search articles..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Category Sidebar */}
        <Card className="shadow-sm lg:col-span-1 h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Categories</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={cn(
                'w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                selectedCategory === 'ALL'
                  ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                  : 'text-muted-foreground hover:bg-accent/50'
              )}
            >
              <span>All Articles</span>
              <Badge variant="outline" className="text-xs">{docs.length}</Badge>
            </button>
            {CATEGORIES.map((cat) => {
              const count = docs.filter(d => d.category === cat.value).length;
              if (count === 0) return null;
              return (
                <button
                  key={cat.value}
                  onClick={() => setSelectedCategory(cat.value)}
                  className={cn(
                    'w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    selectedCategory === cat.value
                      ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      : 'text-muted-foreground hover:bg-accent/50'
                  )}
                >
                  <span>{cat.label}</span>
                  <Badge variant="outline" className="text-xs">{count}</Badge>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Article List */}
        <div className="lg:col-span-3 space-y-3">
          {filteredDocs.length === 0 ? (
            <Card className="shadow-sm">
              <CardContent className="py-16 text-center">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No articles found</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  {searchQuery ? 'Try adjusting your search query' : 'No articles available yet'}
                </p>
                {canWrite && !searchQuery && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <Button variant="outline" onClick={handleSeedDefaults} disabled={saving}>
                      <Star className="w-4 h-4 mr-2" /> Load Default Docs
                    </Button>
                    <Button variant="outline" onClick={openCreate}>
                      <Plus className="w-4 h-4 mr-2" /> Write First Article
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            filteredDocs.map((doc) => {
              const catConfig = categoryConfig(doc.category);
              // Get first 120 chars of content as preview (strip markdown)
              const contentPreview = doc.content
                .replace(/[#*`\[\]()>|_-]/g, '')
                .replace(/\n+/g, ' ')
                .substring(0, 150) + (doc.content.length > 150 ? '...' : '');
              return (
                <Card 
                  key={doc.id} 
                  className="shadow-sm hover:shadow-md transition-all cursor-pointer group"
                  onClick={() => setViewingDoc(doc)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <Badge className={cn('text-[10px] border font-medium', catConfig.color)}>
                            {catConfig.label}
                          </Badge>
                          {!doc.isPublished && (
                            <Badge className="text-[10px] border bg-yellow-100 text-yellow-700 border-yellow-300">
                              Draft
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px]">
                            v{doc.version}
                          </Badge>
                        </div>
                        <h3 className="font-semibold text-base group-hover:text-red-600 transition-colors">{doc.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{contentPreview}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-2.5 text-xs text-muted-foreground">
                          {doc.author && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {doc.author.displayName || doc.author.username}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(doc.updatedAt)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {doc.viewCount} views
                          </span>
                          {doc.tags && (
                            <span className="flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              {doc.tags}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 group-hover:text-red-600 transition-colors" />
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Create/Edit Dialog with Markdown Editor */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editDoc ? 'Edit Article' : 'Write New Article'}</DialogTitle>
            <DialogDescription>
              {editDoc ? 'Update the article content and settings' : 'Create a new knowledge base article using Markdown'}
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="edit" className="w-full">
            <div className="flex items-center justify-between mb-2">
              <TabsList>
                <TabsTrigger value="edit"><Edit3 className="w-3.5 h-3.5 mr-1" /> Edit</TabsTrigger>
                <TabsTrigger value="preview"><Eye className="w-3.5 h-3.5 mr-1" /> Preview</TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-1">
                {/* Markdown toolbar */}
                {MD_TOOLBAR.map((tool) => (
                  <Button
                    key={tool.label}
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => insertMarkdown(tool.prefix, tool.suffix)}
                    title={tool.label}
                    type="button"
                  >
                    <tool.icon className="w-3.5 h-3.5" />
                  </Button>
                ))}
                <Separator orientation="vertical" className="h-6 mx-1" />
                {/* File upload */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload images/files"
                  type="button"
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.md,.heic,.heif,.avif"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files)}
                />
              </div>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
              {/* Title & Meta */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    placeholder="Article title"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </div>
                {!editDoc && (
                  <div className="space-y-2">
                    <Label>Slug (URL-friendly)</Label>
                    <Input
                      placeholder="auto-generated-from-title"
                      value={form.slug}
                      onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tags (comma-separated)</Label>
                  <Input
                    placeholder="e.g. tutorial, getting-started, mdm"
                    value={form.tags}
                    onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  />
                </div>
              </div>

              {/* Uploaded files display */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs">Uploaded Files</Label>
                  <div className="flex flex-wrap gap-2">
                    {uploadedFiles.map((f, i) => (
                      <Badge key={i} variant="outline" className="text-xs flex items-center gap-1">
                        <Paperclip className="w-3 h-3" />
                        {f.fileName}
                        <button onClick={() => setUploadedFiles(prev => prev.filter((_, j) => j !== i))} className="ml-1 hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Content editor / preview */}
              <TabsContent value="edit" className="mt-0">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5" />
                    Content (Markdown)
                  </Label>
                  <Textarea
                    ref={contentRef}
                    placeholder="Write your article content in Markdown..."
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    className="min-h-[350px] font-mono text-sm"
                  />
                </div>
              </TabsContent>

              <TabsContent value="preview" className="mt-0">
                <div className="border rounded-lg p-4 min-h-[350px] bg-background">
                  <div className="md-render max-w-none">
                    {form.content ? (
                      <ReactMarkdown
                        remarkPlugins={REMARK_PLUGINS}
                        rehypePlugins={REHYPE_PLUGINS}
                        components={markdownComponents}
                      >
                        {form.content}
                      </ReactMarkdown>
                    ) : (
                      <p className="text-muted-foreground italic">Start writing to see the preview...</p>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Publish toggle */}
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label>Publish</Label>
                  <p className="text-xs text-muted-foreground">Make this article visible to all users (including unauthenticated)</p>
                </div>
                <Switch checked={form.isPublished} onCheckedChange={(c) => setForm({ ...form, isPublished: c })} />
              </div>
            </div>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? 'Saving...' : editDoc ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
