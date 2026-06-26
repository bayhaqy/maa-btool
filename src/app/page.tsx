'use client';

import { useEffect, useState, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppStore } from '@/stores/app-store';
import LoginPage from '@/components/layout/LoginPage';
import AppShell from '@/components/layout/AppShell';
import { BrandingProvider } from '@/components/providers/BrandingProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
    },
  },
});

export default function Home() {
  const { token, logout } = useAppStore();
  const [seeded, setSeeded] = useState(false);
  const seedingRef = useRef(false);

  // Seed database on first mount.
  // The /api/seed and /api/seed-data endpoints allow anonymous access ONLY
  // when the database is empty (first-run bootstrap). On subsequent loads
  // they will return 401 — which is expected and silently ignored here.
  // If the user is already logged in as Super Admin, we attach the token so
  // Super Admins can re-trigger seeding for testing/demo purposes.
  useEffect(() => {
    if (seedingRef.current) return;
    seedingRef.current = true;

    const seed = async () => {
      try {
        const headers: HeadersInit = token
          ? { Authorization: `Bearer ${token}` }
          : {};
        await fetch('/api/seed', { method: 'POST', headers });
        // Also seed sample data for all modules (idempotent - only fills empty modules)
        await fetch('/api/seed-data', { method: 'POST', headers });
        setSeeded(true);
      } catch {
        setSeeded(true);
      }
    };
    seed();
  }, [token]);

  // Verify existing token on mount
  useEffect(() => {
    if (!token) return;
    const verify = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          logout();
        }
      } catch {
        // Network error, keep token
      }
    };
    verify();
  }, [token, logout]);

  // BrandingProvider wraps BOTH LoginPage and AppShell so branding applies
  // on the login screen too. It reads localStorage + /api/settings on mount
  // and sets CSS custom properties + data-* attributes on <html>.
  return (
    <QueryClientProvider client={queryClient}>
      <BrandingProvider>
        {!token ? <LoginPage /> : <AppShell />}
      </BrandingProvider>
    </QueryClientProvider>
  );
}
