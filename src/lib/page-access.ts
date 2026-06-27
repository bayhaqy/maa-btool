/**
 * Centralized Role-Based Page Access Control
 *
 * Defines which sidebar pages each role is allowed to view. The AppShell
 * uses this map to filter menu items, the global search, and to guard
 * PageContent (redirecting users who try to access a forbidden page back
 * to their first allowed page).
 *
 * Design rules (per user spec):
 *   - Super Admin sees everything.
 *   - Manager sees the operational pages (data, workflow, hierarchy, bulk,
 *     audit, docs, AI, API mgmt) but NOT admin/settings.
 *   - Data Entry sees data-creation pages + docs.
 *   - Viewer sees read-only data + docs + audit.
 *   - Doc Writer sees ONLY Documentation Hub (and Dashboard as a landing).
 *   - API Manager sees ONLY API Management (and Dashboard as a landing).
 *   - SFTP Manager sees ONLY API Management (and Dashboard as a landing).
 *   - AI User sees ONLY AI Assistant (and Dashboard as a landing).
 *
 * Sensitive admin pages (admin-users, admin-roles, admin-companies,
 * admin-lookups, system-health, brand-settings, about) are Super Admin only.
 */

import type { PageView } from '@/stores/app-store';

type RoleName =
  | 'Super Admin'
  | 'Manager'
  | 'Data Entry'
  | 'Viewer'
  | 'Doc Writer'
  | 'API Manager'
  | 'SFTP Manager'
  | 'AI User';

const ROLE_PAGE_ACCESS: Record<RoleName, readonly PageView[]> = {
  'Super Admin': [
    'dashboard',
    'modules',
    'module-detail',
    'data-records',
    'grid-editor',
    'record-detail',
    'workflow',
    'hierarchy',
    'hierarchy-detail',
    'bulk-import',
    'bulk-jobs',
    'audit-log',
    'documentation',
    'ai-assistant',
    'ai-prompts',
    'ai-review',
    'ai-settings',
    'api-management',
    'admin-users',
    'admin-roles',
    'admin-companies',
    'admin-lookups',
    'system-health',
    'brand-settings',
    'about',
    'settings',
  ],
  Manager: [
    'dashboard',
    'data-records',
    'grid-editor',
    'record-detail',
    'workflow',
    'hierarchy',
    'hierarchy-detail',
    'bulk-import',
    'bulk-jobs',
    'audit-log',
    'documentation',
    'ai-assistant',
    'ai-prompts',
    'ai-review',
    'api-management',
    'settings',
  ],
  'Data Entry': [
    'dashboard',
    'data-records',
    'grid-editor',
    'record-detail',
    'workflow',
    'hierarchy',
    'hierarchy-detail',
    'bulk-import',
    'audit-log',
    'documentation',
    'ai-assistant',
    'settings',
  ],
  Viewer: [
    'dashboard',
    'data-records',
    'grid-editor',
    'record-detail',
    'hierarchy',
    'hierarchy-detail',
    'audit-log',
    'documentation',
    'settings',
  ],
  'Doc Writer': ['dashboard', 'documentation', 'settings'],
  'API Manager': ['dashboard', 'api-management', 'settings'],
  'SFTP Manager': ['dashboard', 'api-management', 'settings'],
  'AI User': ['dashboard', 'ai-assistant', 'documentation', 'settings'],
};

/**
 * Returns the set of pages a user (by their role list) is allowed to view.
 * Super Admin always returns the full set.
 */
export function getAllowedPages(roles: string[] | undefined | null): Set<PageView> {
  if (!roles || roles.length === 0) {
    return new Set<PageView>(['dashboard']);
  }
  if (roles.includes('Super Admin')) {
    return new Set<PageView>(ROLE_PAGE_ACCESS['Super Admin']);
  }
  const allowed = new Set<PageView>(['dashboard']);
  for (const role of roles as RoleName[]) {
    const pages = ROLE_PAGE_ACCESS[role];
    if (pages) {
      for (const p of pages) allowed.add(p);
    }
  }
  return allowed;
}

/**
 * Returns true if the user is allowed to view a specific page.
 */
export function canAccessPage(
  roles: string[] | undefined | null,
  page: PageView,
): boolean {
  return getAllowedPages(roles).has(page);
}

/**
 * Returns the first allowed page (other than detail sub-pages) for a user —
 * used as a safe redirect target when the current page is forbidden.
 */
export function getDefaultPage(roles: string[] | undefined | null): PageView {
  const allowed = getAllowedPages(roles);
  // Prefer dashboard if allowed, otherwise the first allowed page.
  if (allowed.has('dashboard')) return 'dashboard';
  const first = Array.from(allowed)[0];
  return (first as PageView) || 'dashboard';
}

/**
 * Returns true if the user is a Super Admin.
 */
export function isSuperAdmin(roles: string[] | undefined | null): boolean {
  return !!roles && roles.includes('Super Admin');
}

/**
 * Sensitive admin pages that must never be exposed to non-superadmin users.
 * Used by the AppShell to hide the entire Admin section.
 */
export const SENSITIVE_ADMIN_PAGES: PageView[] = [
  'admin-users',
  'admin-roles',
  'admin-companies',
  'admin-lookups',
  'system-health',
  'brand-settings',
  'about',
  'ai-settings',
];

/**
 * Helper to filter an arbitrary list of nav items by the user's allowed pages.
 */
export function filterNavByRole<T extends { page: PageView }>(
  items: T[],
  roles: string[] | undefined | null,
): T[] {
  const allowed = getAllowedPages(roles);
  return items.filter((i) => allowed.has(i.page));
}
