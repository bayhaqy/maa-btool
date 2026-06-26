/**
 * Branding settings types and helpers for MAA BTOOL.
 *
 * BrandingSettings describes the user-configurable visual identity of the
 * application (company name, colors, fonts, sidebar style, etc.). The values
 * are persisted to the AppSettings DB table (Super Admin only) and to
 * localStorage (any user) so they survive page refreshes and sessions.
 *
 * BrandingProvider applies these settings as CSS custom properties on
 * <html> so that Tailwind/shadcn utilities (e.g. `bg-primary`) and any
 * custom CSS variable consumers (e.g. `var(--brand-secondary)`) update live.
 */

export type SidebarStyle = 'dark' | 'light' | 'transparent';
export type SidebarPosition = 'left' | 'right';

export interface BrandingSettings {
  companyName: string;
  slogan: string;
  description: string;
  website: string;
  industry: string;
  logoUrl: string;
  /** Hex color, e.g. "#DC2626" */
  primaryColor: string;
  /** Hex color */
  secondaryColor: string;
  /** Hex color */
  accentColor: string;
  /** CSS font-family keyword, e.g. "Inter", "Georgia", "system-ui" */
  fontFamily: string;
  /** Border radius in pixels (0-24) */
  borderRadius: number;
  sidebarStyle: SidebarStyle;
  sidebarPosition: SidebarPosition;
  compactMode: boolean;
  showBreadcrumbs: boolean;
  footerText: string;
}

/**
 * Default branding — matches the seed values used by BrandSettingsPage.
 * If you change these, also update the live preview defaults in
 * BrandSettingsPage and the CSS variables in globals.css.
 */
export const DEFAULT_BRANDING: BrandingSettings = {
  companyName: 'MAA BTOOL',
  slogan: 'Enterprise Master Data Management',
  description:
    'MAP Group — PT Mitra Adiperkasa Tbk. Enterprise MDM platform for retail data governance.',
  website: 'https://www.map.co.id',
  industry: 'Retail',
  logoUrl: '/map-active-logo.png',
  primaryColor: '#DC2626',
  secondaryColor: '#1A1A1A',
  accentColor: '#991B1B',
  fontFamily: 'Inter',
  borderRadius: 8,
  sidebarStyle: 'dark',
  sidebarPosition: 'left',
  compactMode: false,
  showBreadcrumbs: true,
  footerText: 'MAA BTOOL Enterprise MDM © 2026 | MAP Group',
};

/** localStorage key used by BrandingProvider and BrandSettingsPage. */
export const BRANDING_STORAGE_KEY = 'maa-btool-branding';

/** Custom window event dispatched after a settings save. */
export const BRANDING_UPDATED_EVENT = 'maa-btool:branding-updated';

/**
 * Validate a hex color string. Accepts #RGB and #RRGGBB (case-insensitive).
 */
export function isValidHex(hex: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex);
}

/**
 * Normalize a hex color to 6-digit form (#RRGGBB). Returns the input
 * unchanged if it is already 6 digits; expands 3-digit shorthand.
 * Falls back to "#000000" if the input is invalid.
 */
function normalizeHex(hex: string): string {
  if (!isValidHex(hex)) return '#000000';
  if (hex.length === 4) {
    // Expand #abc → #aabbcc
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

/**
 * Convert a hex color (#DC2626) to an RGB triplet string "220 38 38"
 * suitable for use in CSS variables that get composed into rgb()/rgba().
 */
export function hexToRgbTriplet(hex: string): string {
  const h = normalizeHex(hex);
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
}

/**
 * Convert a hex color (#DC2626) to an HSL string "0 72% 51%" suitable
 * for shadcn CSS variables that expect `<H> <S>% <L>%` values.
 *
 * The result is intended for `--primary` and friends, which shadcn
 * composes via `hsl(var(--primary))`.
 */
export function hexToHslString(hex: string): string {
  const h = normalizeHex(hex);
  const r = parseInt(h.slice(1, 3), 16) / 255;
  const g = parseInt(h.slice(3, 5), 16) / 255;
  const b = parseInt(h.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === r) {
      hue = ((g - b) / delta) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  const hRounded = Math.round(hue);
  const sRounded = Math.round(saturation * 100);
  const lRounded = Math.round(lightness * 100);
  return `${hRounded} ${sRounded}% ${lRounded}%`;
}

/**
 * Pick a foreground color (black or white) that contrasts well with
 * the given background hex. Returns the RGB triplet form so callers
 * can drop it into a CSS variable that expects space-separated values.
 *
 * Uses the WCAG relative luminance formula.
 */
export function pickContrastForeground(hex: string): string {
  const h = normalizeHex(hex);
  const r = parseInt(h.slice(1, 3), 16) / 255;
  const g = parseInt(h.slice(3, 5), 16) / 255;
  const b = parseInt(h.slice(5, 7), 16) / 255;

  // Linearize RGB
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);

  // Relative luminance
  const L = 0.2126 * R + 0.7152 * G + 0.0722 * B;

  // WCAG contrast threshold: pick white text on dark backgrounds, black on light.
  return L > 0.45 ? '0 0 0' : '255 255 255';
}

/**
 * Merge a partial branding object (e.g. parsed from DB JSON) with the
 * DEFAULT_BRANDING, validating critical fields. This guards against
 * missing/malformed values that could break CSS variables.
 */
export function mergeBranding(partial: unknown): BrandingSettings {
  if (!partial || typeof partial !== 'object') {
    return { ...DEFAULT_BRANDING };
  }
  const p = partial as Partial<BrandingSettings>;
  const merged: BrandingSettings = { ...DEFAULT_BRANDING, ...p };

  // Validate / coerce specific fields
  if (!isValidHex(merged.primaryColor)) merged.primaryColor = DEFAULT_BRANDING.primaryColor;
  if (!isValidHex(merged.secondaryColor)) merged.secondaryColor = DEFAULT_BRANDING.secondaryColor;
  if (!isValidHex(merged.accentColor)) merged.accentColor = DEFAULT_BRANDING.accentColor;

  if (typeof merged.borderRadius !== 'number' || Number.isNaN(merged.borderRadius)) {
    merged.borderRadius = DEFAULT_BRANDING.borderRadius;
  } else {
    merged.borderRadius = Math.max(0, Math.min(24, Math.round(merged.borderRadius)));
  }

  const validSidebarStyles: SidebarStyle[] = ['dark', 'light', 'transparent'];
  if (!validSidebarStyles.includes(merged.sidebarStyle)) {
    merged.sidebarStyle = DEFAULT_BRANDING.sidebarStyle;
  }

  const validSidebarPositions: SidebarPosition[] = ['left', 'right'];
  if (!validSidebarPositions.includes(merged.sidebarPosition)) {
    merged.sidebarPosition = DEFAULT_BRANDING.sidebarPosition;
  }

  if (typeof merged.compactMode !== 'boolean') merged.compactMode = false;
  if (typeof merged.showBreadcrumbs !== 'boolean') merged.showBreadcrumbs = true;

  return merged;
}
