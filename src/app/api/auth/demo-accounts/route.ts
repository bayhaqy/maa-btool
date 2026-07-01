import { NextResponse } from 'next/server';

/**
 * GET /api/auth/demo-accounts
 *
 * Returns demo account information for the login page.
 * IMPORTANT: This endpoint does NOT expose passwords — it only returns
 * usernames, roles, and descriptions so users know which demo accounts
 * are available. Users must still type the password manually.
 */
export async function GET() {
  const demoAccounts = [
    { username: 'superadmin', role: 'Super Admin', scope: 'Full access', icon: 'ShieldCheck', tone: 'red' as const },
    { username: 'admin_mapi', role: 'Company Admin MAPI', scope: 'MAPI operations + approvals', icon: 'BarChart3', tone: 'violet' as const },
    { username: 'editor_mapi1', role: 'Editor', scope: 'Create & edit data', icon: 'Database', tone: 'sky' as const },
    { username: 'viewer_mapi', role: 'Viewer', scope: 'Read-only access', icon: 'Eye', tone: 'slate' as const },
    { username: 'steward_mapi', role: 'Data Steward', scope: 'Data quality & governance', icon: 'BookOpen', tone: 'amber' as const },
    { username: 'api_manager', role: 'API Manager', scope: 'API Management only', icon: 'Cpu', tone: 'emerald' as const },
    { username: 'approver_mapi', role: 'Approver', scope: 'Review & approve data', icon: 'Sparkles', tone: 'rose' as const },
  ];

  return NextResponse.json({ accounts: demoAccounts });
}
