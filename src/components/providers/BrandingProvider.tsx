'use client';

/**
 * BrandingProvider — applies user-configured branding to the entire app.
 *
 * On mount:
 *   1. Tries to fetch /api/settings (with Bearer token if available).
 *      If `brand_settings` JSON exists, it is merged with DEFAULT_BRANDING.
 *   2. Falls back to localStorage['maa-btool-branding'].
 *   3. Applies the branding by setting CSS custom properties on
 *      document.documentElement (e.g. --primary, --radius, --brand-*).
 *   4. Sets data-sidebar-style and data-compact attributes on <html> so
 *      that globals.css selectors can target them.
 *
 * Listens for the custom 'maa-btool:branding-updated' window event so
 * BrandSettingsPage can trigger an immediate refresh after a save.
 *
 * Exposes { settings, loading, applySettings, resetSettings } via context.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  BRANDING_STORAGE_KEY,
  BRANDING_UPDATED_EVENT,
  DEFAULT_BRANDING,
  hexToHslString,
  mergeBranding,
  pickContrastForeground,
  type BrandingSettings,
} from '@/lib/branding';

interface BrandingContextValue {
  settings: BrandingSettings;
  loading: boolean;
  /** Apply + persist new settings (CSS vars, localStorage, /api/settings). */
  applySettings: (next: BrandingSettings) => Promise<void>;
  /** Reset to DEFAULT_BRANDING (clears localStorage; does NOT delete DB rows). */
  resetSettings: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextValue | null>(null);

/**
 * Read the persisted JWT token from the Zustand persist storage.
 * The key 'maa-btool-storage' stores JSON like { state: { token: "..." }, version: N }.
 * Returns null when no token is available (e.g. on the login screen).
 */
function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('maa-btool-storage');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { token?: string | null } };
    return parsed.state?.token ?? null;
  } catch {
    return null;
  }
}

/**
 * Apply a BrandingSettings object to the document by setting CSS custom
 * properties and data-* attributes on <html>. This is safe to call from
 * the client only.
 */
function applySettingsToDom(settings: BrandingSettings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  // shadcn primary color (HSL string "H S% L%")
  root.style.setProperty('--primary', hexToHslString(settings.primaryColor));
  // Foreground picked for contrast (RGB triplet)
  root.style.setProperty('--primary-foreground', pickContrastForeground(settings.primaryColor));
  // shadcn ring/border often track primary
  root.style.setProperty('--ring', hexToHslString(settings.primaryColor));

  // Border radius — shadcn expects a rem/px string
  root.style.setProperty('--radius', `${settings.borderRadius}px`);

  // Brand-specific variables (raw hex so consumers can use them directly)
  root.style.setProperty('--brand-secondary', settings.secondaryColor);
  root.style.setProperty('--brand-accent', settings.accentColor);
  root.style.setProperty('--brand-company-name', settings.companyName);
  root.style.setProperty('--brand-slogan', settings.slogan);
  root.style.setProperty('--brand-footer', settings.footerText);
  root.style.setProperty('--brand-font-family', settings.fontFamily);

  // Data attributes for CSS targeting (see globals.css)
  root.setAttribute('data-sidebar-style', settings.sidebarStyle);
  root.setAttribute('data-compact', settings.compactMode ? 'true' : 'false');
}

interface BrandingProviderProps {
  children: ReactNode;
}

export function BrandingProvider({ children }: BrandingProviderProps) {
  const [settings, setSettings] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);
  // Avoid refetching on every render in StrictMode double-invoke
  const initRef = useRef(false);

  // Initial load: try DB → localStorage → defaults
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    let cancelled = false;

    const load = async () => {
      // Always start from localStorage so the very first paint matches the
      // user's last-known preferences (faster than waiting for the API).
      try {
        const stored = window.localStorage.getItem(BRANDING_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          const merged = mergeBranding(parsed);
          if (!cancelled) {
            setSettings(merged);
            applySettingsToDom(merged);
          }
        } else {
          // Apply defaults immediately so data-* attributes are present
          applySettingsToDom(DEFAULT_BRANDING);
        }
      } catch {
        applySettingsToDom(DEFAULT_BRANDING);
      }

      // Then try the DB (Super Admin can store cross-session settings).
      const token = getStoredToken();
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/settings', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const data = (await res.json()) as {
          settings?: Record<string, string>;
        };
        const dbSettings = data.settings;
        if (dbSettings?.brand_settings) {
          const parsed = JSON.parse(dbSettings.brand_settings);
          const merged = mergeBranding(parsed);
          if (cancelled) return;
          setSettings(merged);
          applySettingsToDom(merged);
          // Keep localStorage in sync with the DB value
          try {
            window.localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(merged));
          } catch {
            // localStorage may be full or blocked — ignore
          }
        }
      } catch {
        // Network/parse error — the localStorage or default values remain in effect
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for cross-component save events from BrandSettingsPage.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<BrandingSettings>).detail;
      if (!detail) return;
      const merged = mergeBranding(detail);
      setSettings(merged);
      applySettingsToDom(merged);
    };
    window.addEventListener(BRANDING_UPDATED_EVENT, handler);
    return () => window.removeEventListener(BRANDING_UPDATED_EVENT, handler);
  }, []);

  const applySettings = useCallback(async (next: BrandingSettings) => {
    const merged = mergeBranding(next);
    setSettings(merged);
    applySettingsToDom(merged);
    try {
      window.localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // ignore storage errors
    }

    // Persist to DB if a token is available (Super Admin only endpoint).
    const token = getStoredToken();
    if (!token) return;
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          settings: {
            brand_settings: JSON.stringify(merged),
            company_name: merged.companyName,
            slogan: merged.slogan,
            footer_text: merged.footerText,
            primary_color: merged.primaryColor,
          },
        }),
      });
    } catch {
      // DB save failed but localStorage + CSS already applied — non-fatal
    }
  }, []);

  const resetSettings = useCallback(async () => {
    setSettings(DEFAULT_BRANDING);
    applySettingsToDom(DEFAULT_BRANDING);
    try {
      window.localStorage.removeItem(BRANDING_STORAGE_KEY);
    } catch {
      // ignore
    }
    // Dispatch event so any mounted BrandSettingsPage also resets its local state
    window.dispatchEvent(
      new CustomEvent(BRANDING_UPDATED_EVENT, { detail: DEFAULT_BRANDING })
    );
  }, []);

  const value = useMemo<BrandingContextValue>(
    () => ({ settings, loading, applySettings, resetSettings }),
    [settings, loading, applySettings, resetSettings]
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

/**
 * Internal hook used by useBranding. Exported so other providers could
 * consume the context directly if needed, but the public API is
 * /src/hooks/useBranding.ts.
 */
export function useBrandingContext(): BrandingContextValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) {
    throw new Error(
      'useBrandingContext must be used inside <BrandingProvider>. Wrap your component tree with <BrandingProvider> (typically in src/app/page.tsx).'
    );
  }
  return ctx;
}
