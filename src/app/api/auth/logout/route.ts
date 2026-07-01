import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookiesOnResponse } from '@/lib/auth';

/**
 * POST /api/auth/logout
 *
 * Clears auth cookies (access_token, refresh_token) on the server side.
 * The client also clears its localStorage token, but this endpoint ensures
 * the HttpOnly cookies are properly removed.
 */
export async function POST(_request: NextRequest) {
  const response = NextResponse.json({ message: 'Logged out successfully' });
  clearAuthCookiesOnResponse(response);
  return response;
}
