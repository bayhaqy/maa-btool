'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppStore } from '@/stores/app-store';
import LoginPage from '@/components/layout/LoginPage';
import AppShell from '@/components/layout/AppShell';
import { BrandingProvider } from '@/components/providers/BrandingProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
    },
  },
});

/** Max consecutive server errors before forcing logout (prevents getting stuck). */
const MAX_SERVER_ERRORS = 3;
/** Delay between token verification retries on server error. */
const RETRY_DELAY_MS = 30_000;

export default function Home() {
  const { token, logout, _hydrated, setAuth } = useAppStore();
  const [seeded, setSeeded] = useState(false);
  const seedingRef = useRef(false);
  const serverErrorCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed database on first mount — only after hydration is complete.
  // Uses AbortController with a 10-second timeout to prevent blocking
  // on slow/timeout responses (Vercel serverless has function timeouts).
  useEffect(() => {
    if (!_hydrated || seedingRef.current) return;
    seedingRef.current = true;

    const SEED_TIMEOUT_MS = 10_000; // 10s max per seed call

    const seed = async () => {
      try {
        const headers: HeadersInit = token
          ? { Authorization: `Bearer ${token}` }
          : {};
        // Fire seed calls with short timeout — they're best-effort bootstrap
        const ac1 = new AbortController();
        const t1 = setTimeout(() => ac1.abort(), SEED_TIMEOUT_MS);
        try {
          await fetch('/api/seed', { method: 'POST', headers, signal: ac1.signal });
        } catch { /* timeout or network error — ignore */ }
        clearTimeout(t1);

        const ac2 = new AbortController();
        const t2 = setTimeout(() => ac2.abort(), SEED_TIMEOUT_MS);
        try {
          await fetch('/api/seed-data', { method: 'POST', headers, signal: ac2.signal });
        } catch { /* timeout or network error — ignore */ }
        clearTimeout(t2);

        setSeeded(true);
      } catch {
        setSeeded(true);
      }
    };
    seed();
  }, [_hydrated, token]);

  // Attempt to refresh an expired access token using the refresh_token cookie.
  // Returns the new access token string on success, or null on failure.
  const tryRefreshToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST' });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.token && data.user) {
        // Update the store with the new token
        setAuth(data.token, data.user);
        return data.token;
      }
      return null;
    } catch {
      return null;
    }
  }, [setAuth]);

  // Verify existing token on mount — only after hydration is complete.
  // Only auto-logout on 401 (Unauthorized). For server errors (5xx),
  // keep the token and show a toast notification with retry logic.
  useEffect(() => {
    if (!_hydrated || !token) return;

    const verify = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          // Token is valid — reset error counter
          serverErrorCountRef.current = 0;
          return;
        }

        if (res.status === 401) {
          // Access token is expired or invalid — try refresh
          const newToken = await tryRefreshToken();
          if (newToken) {
            // Refresh succeeded — reset error counter
            serverErrorCountRef.current = 0;
            return;
          }
          // Refresh also failed — truly logged out
          serverErrorCountRef.current = 0;
          logout();
          return;
        }

        // Server error (5xx, 429, etc.) — don't log out, keep the token
        serverErrorCountRef.current += 1;

        if (serverErrorCountRef.current >= MAX_SERVER_ERRORS) {
          // Too many consecutive server errors — likely the token really is bad
          // or the server is persistently down. Force logout for safety.
          toast.error('Server is unreachable. Please log in again.');
          serverErrorCountRef.current = 0;
          logout();
          return;
        }

        // Show a warning toast and schedule a retry
        toast.error('Connection issue. Retrying…', {
          duration: 4000,
          id: 'auth-verify-retry',
        });

        // Clear any existing retry timeout
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
        }

        retryTimeoutRef.current = setTimeout(() => {
          verify();
        }, RETRY_DELAY_MS);
      } catch {
        // Network error (offline, CORS, etc.) — keep the token
        serverErrorCountRef.current += 1;

        if (serverErrorCountRef.current < MAX_SERVER_ERRORS) {
          // Schedule a retry
          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
          }
          retryTimeoutRef.current = setTimeout(() => {
            verify();
          }, RETRY_DELAY_MS);
        } else {
          toast.error('Network error. Please check your connection and log in again.');
          serverErrorCountRef.current = 0;
          logout();
        }
      }
    };

    verify();

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [_hydrated, token, logout, tryRefreshToken]);

  // Show a loading spinner while Zustand is rehydrating from localStorage.
  // This prevents the "flash of LoginPage" on refresh when the user is already
  // authenticated but the store hasn't loaded the persisted token yet.
  if (!_hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  // BrandingProvider wraps BOTH LoginPage and AppShell so branding applies
  // on the login screen too. It reads localStorage + /api/settings on mount
  // and sets CSS custom properties + data-* attributes on <html>.
  // ErrorBoundary catches any rendering crashes and shows a retry UI instead
  // of a blank white screen.
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrandingProvider>
          {!token ? <LoginPage /> : <AppShell />}
        </BrandingProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
