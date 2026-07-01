/**
 * RLS — Row-Level Security
 *
 * Applies data filtering based on user's assigned scope:
 *   - ALL:      Super Admin — no restrictions
 *   - COMPANY:  Only records within the user's company/tenant
 *   - BRAND:    Only records matching assigned brands
 *   - COUNTRY:  Only records matching assigned countries
 *   - TEAM:     Only records matching assigned teams (via record ownership/tags)
 *   - CUSTOM:   Combination of brand + country + team filters
 *
 * Scope resolution order (most permissive wins across roles):
 *   1. If any role grants 'ALL' → unrestricted
 *   2. If any role grants 'COMPANY' → company-scoped (with brand/country narrowing)
 *   3. Otherwise → use the most restrictive combination
 */

import { db } from './db';
import { jsonParse } from './db-json';
import { isSuperAdmin, isCompanyAdmin } from './rbac';
import type { TokenPayload } from './auth';

// ── Types ────────────────────────────────────────────────────────────

export type DataScope = 'ALL' | 'COMPANY' | 'BRAND' | 'COUNTRY' | 'TEAM' | 'CUSTOM';

export interface RLSFilter {
  /** Prisma where clause additions to merge with base query */
  where: Record<string, unknown>;
  /** Whether the filter restricts data (false = no restrictions) */
  isRestricted: boolean;
  /** Human-readable description of the filter for audit logs */
  description: string;
}

export interface UserDataScope {
  scope: DataScope;
  brands: string[];
  countries: string[];
  teams: string[];
  companyId: string | null;
}

// ── Scope Helpers ────────────────────────────────────────────────────

/**
 * Get user's effective data scope by merging their own RLS assignments
 * with the RLS config from all their assigned roles.
 *
 * Resolution: if ANY role has 'ALL', the user gets 'ALL'.
 * Otherwise, brands/countries/teams are unioned across all sources.
 */
export async function getUserDataScope(userId: string): Promise<UserDataScope> {
  const user = await db.sysUser.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: { role: true },
      },
    },
  });

  if (!user) {
    return { scope: 'COMPANY', brands: [], countries: [], teams: [], companyId: null };
  }

  // Parse user-level assignments
  let brands = safeJsonParse<string[]>(user.assignedBrands) || [];
  let countries = safeJsonParse<string[]>(user.assignedCountries) || [];
  let teams = safeJsonParse<string[]>(user.assignedTeams) || [];
  let userScope = (user.dataScope as DataScope) || null;

  // Merge role-level scope configs (union)
  let roleHasAll = false;

  for (const ur of user.userRoles) {
    const role = ur.role;

    // If any role is Super Admin → ALL scope
    if (role.roleName === 'Super Admin') {
      return { scope: 'ALL', brands: [], countries: [], teams: [], companyId: user.companyId };
    }

    const roleScope = (role.dataScope as DataScope) || null;
    if (roleScope === 'ALL') {
      roleHasAll = true;
    }

    // Merge role scope config
    if (role.scopeConfig) {
      const config = safeJsonParse<Record<string, string[]>>(role.scopeConfig);
      if (config) {
        if (config.brands) brands = [...new Set([...brands, ...config.brands])];
        if (config.countries) countries = [...new Set([...countries, ...config.countries])];
        if (config.teams) teams = [...new Set([...teams, ...config.teams])];
      }
    }
  }

  // Determine effective scope
  let effectiveScope: DataScope;

  if (roleHasAll || userScope === 'ALL') {
    effectiveScope = 'ALL';
  } else if (userScope) {
    effectiveScope = userScope;
  } else if (brands.length > 0 || countries.length > 0 || teams.length > 0) {
    // If user has any brand/country/team assignments but no explicit scope → CUSTOM
    effectiveScope = 'CUSTOM';
  } else {
    // Default to COMPANY scope
    effectiveScope = 'COMPANY';
  }

  // Company Admin defaults to COMPANY scope
  const userRoleNames = user.userRoles.map(ur => ur.role.roleName);
  if (isCompanyAdmin(userRoleNames) && effectiveScope !== 'ALL') {
    effectiveScope = effectiveScope || 'COMPANY';
  }

  return {
    scope: effectiveScope,
    brands,
    countries,
    teams,
    companyId: user.companyId,
  };
}

/**
 * Build an RLS filter for a given user and optional module context.
 * Returns a Prisma-compatible `where` clause addition.
 */
export async function getRLSFilter(
  userId: string,
  moduleName?: string,
): Promise<RLSFilter> {
  const scope = await getUserDataScope(userId);

  // Super Admin / ALL scope → no restrictions
  if (scope.scope === 'ALL') {
    return {
      where: {},
      isRestricted: false,
      description: 'Full access (ALL scope)',
    };
  }

  const conditions: Record<string, unknown>[] = [];
  const parts: string[] = [];

  // COMPANY scope is always enforced (unless ALL)
  if (scope.companyId) {
    conditions.push({ companyId: scope.companyId });
    parts.push(`company: ${scope.companyId}`);
  }

  // BRAND scope: filter by brand field
  if ((scope.scope === 'BRAND' || scope.scope === 'CUSTOM') && scope.brands.length > 0) {
    conditions.push({
      OR: [
        { brand: { in: scope.brands } },
        { brand: null }, // Records without brand are visible to everyone
      ],
    });
    parts.push(`brands: [${scope.brands.join(',')}]`);
  }

  // COUNTRY scope: filter by country field
  if ((scope.scope === 'COUNTRY' || scope.scope === 'CUSTOM') && scope.countries.length > 0) {
    conditions.push({
      OR: [
        { country: { in: scope.countries } },
        { country: null }, // Records without country are visible to everyone
      ],
    });
    parts.push(`countries: [${scope.countries.join(',')}]`);
  }

  // TEAM scope: filter by ownerId being in the team or by record tags
  if ((scope.scope === 'TEAM' || scope.scope === 'CUSTOM') && scope.teams.length > 0) {
    // Team filtering: users can see records where:
    // 1. The record has no team restriction (brand/country null)
    // 2. The record's ownerId is a user in the same team
    // For now, we use a simpler approach: team members can see all company records
    // with brand/country filters applied. Team filtering is primarily for
    // "Map Corporate" → all map groups visible
    parts.push(`teams: [${scope.teams.join(',')}]`);
  }

  // Combine all conditions with AND
  const where: Record<string, unknown> = {};
  if (conditions.length === 1) {
    Object.assign(where, conditions[0]);
  } else if (conditions.length > 1) {
    where.AND = conditions;
  }

  return {
    where,
    isRestricted: true,
    description: parts.length > 0 ? parts.join(' AND ') : 'Company-scoped',
  };
}

/**
 * Merge an RLS filter into an existing Prisma where clause.
 * Handles the AND-combining logic properly.
 */
export function applyRLS(
  baseWhere: Record<string, unknown>,
  rlsFilter: RLSFilter,
): Record<string, unknown> {
  if (!rlsFilter.isRestricted) return baseWhere;

  const rlsWhere = rlsFilter.where;
  if (!rlsWhere || Object.keys(rlsWhere).length === 0) return baseWhere;

  // If baseWhere already has AND, extend it
  if (baseWhere.AND) {
    const existingAnd = Array.isArray(baseWhere.AND) ? baseWhere.AND : [baseWhere.AND];
    const rlsAnd = rlsWhere.AND ? (Array.isArray(rlsWhere.AND) ? rlsWhere.AND : [rlsWhere.AND]) : [rlsWhere];
    return {
      ...baseWhere,
      AND: [...existingAnd, ...rlsAnd],
    };
  }

  // Merge rlsWhere into baseWhere
  const merged = { ...baseWhere };
  for (const [key, value] of Object.entries(rlsWhere)) {
    if (key === 'AND') {
      // Flatten AND into merged conditions
      merged.AND = value;
    } else if (merged[key] !== undefined) {
      // Both have the same key — wrap in AND
      merged.AND = merged.AND || [];
      if (!Array.isArray(merged.AND)) merged.AND = [merged.AND as unknown];
      (merged.AND as unknown[]).push({ [key]: value });
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

/**
 * Check if a user can access a specific record.
 * Used for read/write/delete access checks on individual records.
 */
export async function canAccessRecord(
  userId: string,
  recordId: string,
  action: 'read' | 'write' | 'delete' = 'read',
): Promise<boolean> {
  const scope = await getUserDataScope(userId);

  // ALL scope → always allowed
  if (scope.scope === 'ALL') return true;

  const record = await db.dataRecord.findUnique({
    where: { id: recordId },
    select: { companyId: true, brand: true, country: true },
  });

  if (!record) return false;

  // COMPANY scope check
  if (scope.companyId && record.companyId !== scope.companyId) {
    return false;
  }

  // BRAND scope check
  if ((scope.scope === 'BRAND' || scope.scope === 'CUSTOM') && scope.brands.length > 0) {
    if (record.brand && !scope.brands.includes(record.brand)) {
      return false;
    }
  }

  // COUNTRY scope check
  if ((scope.scope === 'COUNTRY' || scope.scope === 'CUSTOM') && scope.countries.length > 0) {
    if (record.country && !scope.countries.includes(record.country)) {
      return false;
    }
  }

  // Write/delete actions may be further restricted by role permissions,
  // but that's handled by the RBAC system, not RLS.
  void action; // RLS doesn't differentiate by action type

  return true;
}

/**
 * Get RLS filter from a TokenPayload directly (avoids extra DB query for common case).
 * This is an optimized path for API routes that already have the token payload.
 */
export function getRLSFilterFromToken(tokenPayload: TokenPayload): RLSFilter {
  if (!tokenPayload) {
    return {
      where: {},
      isRestricted: true,
      description: 'No token — denied',
    };
  }

  // Super Admin → no restrictions
  if (isSuperAdmin(tokenPayload.roles)) {
    return {
      where: {},
      isRestricted: false,
      description: 'Full access (Super Admin)',
    };
  }

  // All non-super-admin users are at minimum company-scoped
  return {
    where: { companyId: tokenPayload.companyId },
    isRestricted: true,
    description: `Company-scoped: ${tokenPayload.companyId}`,
  };
}

/**
 * Extract brand/country/region from a record's currentPayload for denormalization.
 * Called when creating or updating records to populate the RLS fields on DataRecord.
 */
export function extractRLSFieldsFromPayload(
  payload: Record<string, unknown>,
): { brand?: string; country?: string; region?: string } {
  const brandKeys = ['brand', 'brand_name', 'Brand', 'brandName', 'brand_name_en'];
  const countryKeys = ['country', 'country_code', 'Country', 'countryCode', 'country_name'];
  const regionKeys = ['region', 'Region', 'region_name', 'area'];

  let brand: string | undefined;
  let country: string | undefined;
  let region: string | undefined;

  for (const key of brandKeys) {
    if (payload[key] && typeof payload[key] === 'string') {
      brand = payload[key] as string;
      break;
    }
  }

  for (const key of countryKeys) {
    if (payload[key] && typeof payload[key] === 'string') {
      country = payload[key] as string;
      break;
    }
  }

  for (const key of regionKeys) {
    if (payload[key] && typeof payload[key] === 'string') {
      region = payload[key] as string;
      break;
    }
  }

  return { brand, country, region };
}

// ── Helpers ──────────────────────────────────────────────────────────

function safeJsonParse<T>(val: unknown): T | null {
  if (val === null || val === undefined) return null;
  try {
    return jsonParse<T>(val);
  } catch {
    return null;
  }
}
