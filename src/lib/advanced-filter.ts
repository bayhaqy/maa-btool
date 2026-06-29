import { parsePayload } from '@/lib/parse-payload';

/**
 * Advanced multi-column filter logic — shared between the client-side
 * GridEditorPage (Task 23-D) and the server-side Bulk Update engine
 * (Task 24-C). Mirrors the same shape ({ id, fieldCode, operator, value,
 * connector }) so a saved filter on the grid can be replayed server-side
 * against the same record set.
 *
 * NOTE: The GridEditorPage keeps its own inline copy of this logic for
 * backwards-compatibility — this module is the canonical server-side
 * version used by /api/bulk-update.
 */

export type FilterOperator =
  | 'contains'
  | 'equals'
  | 'not_equals'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than'
  | 'greater_or_equal'
  | 'less_or_equal'
  | 'is_true'
  | 'is_false';

export type FilterConnector = 'AND' | 'OR';

export interface AdvancedFilter {
  id: string;
  fieldCode: string;
  operator: FilterOperator;
  value: string;
  connector: FilterConnector;
}

/** Minimal field shape — only what the filter evaluator needs. */
export interface FilterableField {
  fieldCode: string;
  dataType: string;
}

/** Returns the list of valid operators for a given field dataType. */
export function getOperatorsForDataType(dataType: string): FilterOperator[] {
  switch (dataType) {
    case 'TEXT':
    case 'EMAIL':
    case 'URL':
      return [
        'contains',
        'equals',
        'not_equals',
        'starts_with',
        'ends_with',
        'is_empty',
        'is_not_empty',
      ];
    case 'NUMBER':
    case 'DATE':
      return [
        'equals',
        'not_equals',
        'greater_than',
        'less_than',
        'greater_or_equal',
        'less_or_equal',
        'is_empty',
        'is_not_empty',
      ];
    case 'BOOLEAN':
      return ['is_true', 'is_false'];
    case 'SELECT':
    case 'MULTISELECT':
    case 'LOOKUP':
      return ['equals', 'not_equals', 'is_empty', 'is_not_empty'];
    default:
      return ['equals', 'is_empty', 'is_not_empty'];
  }
}

/** Evaluate a single advanced-filter condition against a payload. */
export function evaluateCondition(
  payload: Record<string, unknown>,
  cond: AdvancedFilter,
  fields: FilterableField[]
): boolean {
  const field = fields.find((f) => f.fieldCode === cond.fieldCode);
  if (!field) return true; // unknown field → don't filter out
  const rawVal = payload[cond.fieldCode] ?? '';
  const strVal = String(rawVal ?? '');
  const isEmpty =
    rawVal === null ||
    rawVal === undefined ||
    strVal === '' ||
    strVal === 'null' ||
    strVal === 'undefined';
  const condVal = cond.value || '';

  switch (cond.operator) {
    case 'is_empty':
      return isEmpty;
    case 'is_not_empty':
      return !isEmpty;
    case 'is_true':
      return rawVal === true || strVal === 'true' || rawVal === 1 || strVal === '1';
    case 'is_false':
      return rawVal === false || strVal === 'false' || rawVal === 0 || strVal === '0' || isEmpty;
    case 'contains':
      return !isEmpty && strVal.toLowerCase().includes(condVal.toLowerCase());
    case 'equals':
      return strVal.toLowerCase() === condVal.toLowerCase();
    case 'not_equals':
      return strVal.toLowerCase() !== condVal.toLowerCase();
    case 'starts_with':
      return !isEmpty && strVal.toLowerCase().startsWith(condVal.toLowerCase());
    case 'ends_with':
      return !isEmpty && strVal.toLowerCase().endsWith(condVal.toLowerCase());
    case 'greater_than':
    case 'less_than':
    case 'greater_or_equal':
    case 'less_or_equal': {
      if (isEmpty) return false;
      if (field.dataType === 'DATE') {
        const a = new Date(strVal).getTime();
        const b = new Date(condVal).getTime();
        if (isNaN(a) || isNaN(b)) return false;
        if (cond.operator === 'greater_than') return a > b;
        if (cond.operator === 'less_than') return a < b;
        if (cond.operator === 'greater_or_equal') return a >= b;
        return a <= b;
      }
      const aNum = Number(strVal);
      const bNum = Number(condVal);
      if (isNaN(aNum) || isNaN(bNum)) return false;
      if (cond.operator === 'greater_than') return aNum > bNum;
      if (cond.operator === 'less_than') return aNum < bNum;
      if (cond.operator === 'greater_or_equal') return aNum >= bNum;
      return aNum <= bNum;
    }
  }
  return false;
}

/**
 * Evaluate a list of advanced-filter conditions against a payload,
 * combining left-to-right with the per-condition connector (the first
 * condition has no connector). Returns true if the payload passes.
 * Empty list → true.
 */
export function evaluateAdvancedFilters(
  payload: Record<string, unknown>,
  conds: AdvancedFilter[],
  fields: FilterableField[]
): boolean {
  if (!conds || conds.length === 0) return true;
  let result = evaluateCondition(payload, conds[0], fields);
  for (let i = 1; i < conds.length; i++) {
    const c = conds[i];
    const r = evaluateCondition(payload, c, fields);
    if (c.connector === 'AND') result = result && r;
    else result = result || r;
  }
  return result;
}

/**
 * Filter a list of records in-memory using the advanced filter. Each
 * record's `currentPayload` (JSON string) is parsed, evaluated against
 * the conditions, and either kept or dropped. Returns the matched
 * records (preserves the original shape).
 */
export function filterRecords<T extends { currentPayload: string }>(
  records: T[],
  conds: AdvancedFilter[],
  fields: FilterableField[]
): T[] {
  if (!conds || conds.length === 0) return records;
  return records.filter((rec) => {
    const payload = parsePayload(rec.currentPayload);
    return evaluateAdvancedFilters(payload, conds, fields);
  });
}
