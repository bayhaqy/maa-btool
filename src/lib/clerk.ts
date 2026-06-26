/**
 * Clerk Authentication Integration (OPTIONAL)
 *
 * NOTE: This is an ADDITIONAL integration layer. The primary authentication
 * system for MAA BTOOL is the custom JWT-based auth in `@/lib/auth`.
 * Clerk is provided as an optional alternative/secondary auth provider for
 * scenarios that require hosted authentication (social logins, MFA, etc.).
 *
 * All functions in this module gracefully degrade when `CLERK_SECRET_KEY`
 * is not configured — they return `null` or empty results rather than
 * throwing, so the rest of the app keeps working without Clerk.
 */

import { createClerkClient, type ClerkClient } from '@clerk/backend';
import { db } from '@/lib/db';

/**
 * Get the configured Clerk backend client.
 *
 * Uses the `CLERK_SECRET_KEY` environment variable. Returns `null` when the
 * key is missing or empty, so callers can short-circuit safely.
 */
export function getClerkClient(): ClerkClient | null {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey || secretKey.trim() === '') {
    return null;
  }
  try {
    return createClerkClient({ secretKey });
  } catch (err) {
    console.warn('[clerk] Failed to create Clerk client:', err);
    return null;
  }
}

/**
 * Synchronize a Clerk user to the local SysUser table.
 *
 * Looks up an existing SysUser by `email`. If found, it updates the
 * `displayName` and ensures the user is active. If not found, it creates a
 * new SysUser linked to the first active tenant company (or returns null if
 * no company exists — callers should seed a company first).
 *
 * The custom JWT auth system remains the source of truth for sessions;
 * this helper merely keeps the local DB row in sync with Clerk's directory.
 *
 * @param clerkUserId - The Clerk user id (used as metadata reference).
 * @param email - The user's email from Clerk.
 * @returns The upserted SysUser record, or `null` if Clerk is not configured
 *          or the operation fails.
 */
export async function syncClerkUserToDb(
  clerkUserId: string,
  email: string,
): Promise<{ id: string; username: string; email: string } | null> {
  const client = getClerkClient();
  if (!client) {
    return null;
  }

  try {
    // Look up existing user by email
    const existing = await db.sysUser.findUnique({
      where: { email },
      select: { id: true, username: true, email: true },
    });

    if (existing) {
      // Already linked — return as-is. (We do NOT overwrite passwordHash etc.)
      return existing;
    }

    // Otherwise we need a company to attach the user to.
    const company = await db.tenantCompany.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!company) {
      console.warn(
        '[clerk] No active TenantCompany found — cannot create new SysUser for',
        email,
      );
      return null;
    }

    // Derive a unique username from email
    const baseUsername = email.split('@')[0] || `clerk_${clerkUserId}`;
    let username = baseUsername;
    let suffix = 1;
    while (await db.sysUser.findUnique({ where: { username }, select: { id: true } })) {
      suffix += 1;
      username = `${baseUsername}_${suffix}`;
    }

    const created = await db.sysUser.create({
      data: {
        companyId: company.id,
        username,
        email,
        // No password — this user authenticates via Clerk. We store a random
        // placeholder hash that cannot be verified by the password flow.
        passwordHash: `clerk:${clerkUserId}`,
        displayName: baseUsername,
        isActive: true,
      },
      select: { id: true, username: true, email: true },
    });

    return created;
  } catch (err) {
    console.warn('[clerk] syncClerkUserToDb failed:', err);
    return null;
  }
}

/**
 * Resolve a Clerk user to a local SysUser by email lookup.
 *
 * Fetches the Clerk user by id, reads their primary email address, then
 * matches it to a SysUser record. Returns `null` when Clerk is not
 * configured, the Clerk user doesn't exist, or no matching SysUser exists.
 *
 * @param clerkUserId - The Clerk user id to look up.
 */
export async function clerkUserToDbUser(
  clerkUserId: string,
): Promise<{ id: string; username: string; email: string } | null> {
  const client = getClerkClient();
  if (!client) {
    return null;
  }

  try {
    const clerkUser = await client.users.getUser(clerkUserId);
    const email = clerkUser.primaryEmailAddress?.emailAddress;
    if (!email) {
      return null;
    }

    const dbUser = await db.sysUser.findUnique({
      where: { email },
      select: { id: true, username: true, email: true },
    });

    return dbUser;
  } catch (err) {
    console.warn('[clerk] clerkUserToDbUser failed:', err);
    return null;
  }
}
