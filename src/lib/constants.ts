// Client-safe constants - no server-only imports (no next/headers)

export const STATUS_DRAFT = 'DRAFT';
export const STATUS_IN_REVIEW = 'IN_REVIEW';
export const STATUS_ACTIVE = 'ACTIVE';
export const STATUS_REVISION_PENDING = 'REVISION_PENDING';
export const STATUS_REJECTED = 'REJECTED';
export const STATUS_ARCHIVED = 'ARCHIVED';

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In Review',
  ACTIVE: 'Active',
  REVISION_PENDING: 'Revision Pending',
  REJECTED: 'Rejected',
  ARCHIVED: 'Archived',
};

export const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-300',
  IN_REVIEW: 'bg-amber-50 text-amber-700 border-amber-300',
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  REVISION_PENDING: 'bg-sky-50 text-sky-700 border-sky-300',
  REJECTED: 'bg-red-50 text-red-700 border-red-300',
  ARCHIVED: 'bg-slate-100 text-slate-500 border-slate-300',
};

// Valid state transitions
export const STATE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['IN_REVIEW', 'ARCHIVED'],
  IN_REVIEW: ['ACTIVE', 'REJECTED', 'DRAFT'],
  ACTIVE: ['REVISION_PENDING', 'ARCHIVED'],
  REVISION_PENDING: ['IN_REVIEW', 'ACTIVE'],
  REJECTED: ['DRAFT', 'ARCHIVED'],
  ARCHIVED: [],
};

// ============================================================================
// Stibo Systems Terminology Alignment
// Traditional MDM terms → Stibo-aligned terms
// ============================================================================

export const STIBO_TERMINOLOGY: Record<string, string> = {
  // Core entity terms
  'Record': 'Entity Instance',
  'Data Record': 'Entity Instance',
  'Records': 'Entity Instances',
  'Data Records': 'Entity Instances',
  'New Record': 'New Entity Instance',
  'Create Record': 'Create Entity Instance',
  'Record Detail': 'Entity Instance Detail',
  'Record Data': 'Attribute Values',
  'Record Preview': 'Instance Preview',

  // Field/attribute terms
  'Field': 'Attribute',
  'Fields': 'Attributes',
  'Field Code': 'Attribute Code',
  'Field Name': 'Attribute Name',
  'Field Type': 'Attribute Type',
  'Field Value': 'Attribute Value',

  // Status/workflow terms
  'Status': 'Workflow State',
  'Status Change': 'State Transition',
  'Available state transitions': 'Available workflow transitions',

  // Quality terms
  'Quality Score': 'Quality Score',
  'Completeness': 'Completeness',
  'Accuracy': 'Accuracy',
  'Consistency': 'Consistency',
};

// Stibo Workflow State labels (enhanced with workflow context)
export const WORKFLOW_STATE_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In Review',
  ACTIVE: 'Active',
  REVISION_PENDING: 'Revision Pending',
  REJECTED: 'Rejected',
  ARCHIVED: 'Archived',
};

// Stibo Workflow State descriptions
export const WORKFLOW_STATE_DESCRIPTIONS: Record<string, string> = {
  DRAFT: 'Entity instance is being authored or edited',
  IN_REVIEW: 'Pending approval before publishing',
  ACTIVE: 'Published and available for consumption',
  REVISION_PENDING: 'Active record requires amendments',
  REJECTED: 'Changes were rejected during review',
  ARCHIVED: 'No longer active, retained for audit',
};
