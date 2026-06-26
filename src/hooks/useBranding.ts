'use client';

/**
 * useBranding — convenience hook for accessing the BrandingProvider context.
 *
 * Returns { settings, loading, applySettings, resetSettings }.
 * Throws a helpful error if used outside of <BrandingProvider>.
 */
import { useBrandingContext } from '@/components/providers/BrandingProvider';

export function useBranding() {
  return useBrandingContext();
}
