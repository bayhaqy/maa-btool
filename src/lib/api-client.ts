/**
 * Authenticated API Client
 *
 * A thin wrapper around `fetch` that:
 *   1. Automatically attaches the `Authorization: Bearer <token>` header
 *   2. Intercepts 401 responses and attempts a silent token refresh via
 *      `/api/auth/refresh` before retrying the original request
 *   3. If the refresh also fails, calls `logout()` from the app store
 *
 * Usage:
 *   import { apiFetch } from '@/lib/api-client';
 *   const res = await apiFetch('/api/dashboard/stats');
 *   const data = await res.json();
 */

import { useAppStore } from '@/stores/app-store';

let refreshPromise: Promise<string | null> | null = null;

/**
 * Attempt to refresh the access token using the refresh_token cookie.
 * Deduplicates concurrent refresh attempts.
 */
async function refreshToken(): Promise<string | null> {
  // If a refresh is already in progress, reuse it
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST' });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.token && data.user) {
        const { setAuth } = useAppStore.getState();
        setAuth(data.token, data.user);
        return data.token;
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Authenticated fetch wrapper.
 *
 * Automatically adds the Authorization header from the Zustand store.
 * On 401, attempts a silent token refresh and retries the request once.
 * If the refresh fails, logs the user out.
 */
export async function apiFetch(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const { token } = useAppStore.getState();

  // Merge auth header
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(input, { ...init, headers });

  // If not 401, return as-is
  if (res.status !== 401) return res;

  // Attempt silent refresh
  const newToken = await refreshToken();
  if (!newToken) {
    // Refresh failed — force logout
    const { logout } = useAppStore.getState();
    logout();
    return res; // Return the original 401 response
  }

  // Retry the original request with the new token
  const retryHeaders = new Headers(init.headers);
  retryHeaders.set('Authorization', `Bearer ${newToken}`);

  return fetch(input, { ...init, headers: retryHeaders });
}
