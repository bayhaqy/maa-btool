import { NextResponse } from 'next/server';

/**
 * GET /api/auth/demo-accounts
 *
 * Returns demo account information for the login page.
 * Includes demo passwords for one-click login convenience on demo systems.
 */
export async function GET() {
  const demoAccounts = [
    { username: 'superadmin', password: 'Admin@123', role: 'Super Admin', scope: 'Full access', icon: 'ShieldCheck', tone: 'red' as const },
    { username: 'admin_mapi', password: 'Admin@123', role: 'Company Admin MAPI', scope: 'MAPI operations + approvals', icon: 'BarChart3', tone: 'violet' as const },
    { username: 'editor_mapi1', password: 'Admin@123', role: 'Editor', scope: 'Create & edit data', icon: 'Database', tone: 'sky' as const },
    { username: 'viewer_mapi', password: 'Admin@123', role: 'Viewer', scope: 'Read-only access', icon: 'Eye', tone: 'slate' as const },
    { username: 'steward_mapi', password: 'Admin@123', role: 'Data Steward', scope: 'Data quality & governance', icon: 'BookOpen', tone: 'amber' as const },
    { username: 'api_manager', password: 'Admin@123', role: 'API Manager', scope: 'API Management only', icon: 'Cpu', tone: 'emerald' as const },
    { username: 'approver_mapi', password: 'Admin@123', role: 'Approver', scope: 'Review & approve data', icon: 'Sparkles', tone: 'rose' as const },
  ];

  return NextResponse.json({ accounts: demoAccounts });
}
