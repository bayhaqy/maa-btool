import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PageView =
  // Home
  | 'dashboard'
  // Data Management
  | 'data-records'
  | 'grid-editor'
  | 'record-detail'
  | 'data-stewardship'
  | 'data-catalog'
  | 'data-quality'
  | 'digital-assets'
  // Schema
  | 'modules'
  | 'module-detail'
  | 'hierarchy'
  | 'hierarchy-detail'
  // Workflow & Governance
  | 'workflow'
  | 'business-rules'
  // Tools
  | 'bulk-import'
  | 'bulk-jobs'
  | 'audit-log'
  | 'documentation'
  // AI Hub
  | 'ai-assistant'
  | 'ai-prompts'
  | 'ai-review'
  | 'ai-settings'
  // Integrations
  | 'api-management'
  | 'data-exchange'
  // Administration
  | 'admin-users'
  | 'admin-roles'
  | 'admin-companies'
  | 'admin-lookups'
  | 'system-health'
  | 'brand-settings'
  | 'settings'
  | 'about';

export interface AuthUser {
  userId: string;
  username: string;
  email: string;
  companyId: string;
  companyCode: string;
  roles: string[];
  /** True when this session was created via impersonation by a Super Admin. */
  impersonated?: boolean;
  /** The original Super Admin user that initiated the impersonation, if any. */
  impersonatedBy?: {
    userId: string;
    username: string;
  } | null;
}

interface AppState {
  currentPage: PageView;
  selectedModuleId: string | null;
  selectedRecordId: string | null;
  selectedHierarchyId: string | null;
  navigate: (page: PageView, params?: { moduleId?: string; recordId?: string; hierarchyId?: string }) => void;

  token: string | null;
  /** Original Super Admin token, preserved while impersonating so the user can restore. */
  originalToken: string | null;
  /** Original Super Admin user, preserved while impersonating. */
  originalUser: AuthUser | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  /** Switch the current session to a target user (impersonation). Preserves original creds. */
  impersonate: (newToken: string, newUser: AuthUser) => void;
  /** Restore the original Super Admin session after impersonation. */
  restoreImpersonation: () => void;
  logout: () => void;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  /** Per-user onboarding completion flag. Keyed by username so each user
   *  gets their own onboarding experience. */
  onboardingCompleted: Record<string, boolean>;
  /** Monotonic counter bumped whenever the user manually requests the
   *  onboarding tour to replay. OnboardingGuide watches this value to
   *  re-open the dialog even if it has already been shown once. */
  onboardingTrigger: number;
  /** Mark onboarding as completed for the given username. */
  completeOnboarding: (username: string) => void;
  /** Reset onboarding for the given username (re-show the guide). */
  resetOnboarding: (username: string) => void;
  /** Returns true if the current user has not yet completed onboarding. */
  needsOnboarding: () => boolean;
  /** Manually replay the onboarding tour for the currently logged-in user.
   *  Resets the completion flag AND bumps the trigger counter so the
   *  OnboardingGuide component re-opens immediately. */
  replayOnboarding: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentPage: 'dashboard' as PageView,
      selectedModuleId: null,
      selectedRecordId: null,
      selectedHierarchyId: null,
      navigate: (page, params = {}) =>
        set({
          currentPage: page,
          selectedModuleId: params.moduleId ?? null,
          selectedRecordId: params.recordId ?? null,
          selectedHierarchyId: params.hierarchyId ?? null,
        }),

      token: null,
      originalToken: null,
      originalUser: null,
      user: null,
      setAuth: (token, user) => set({ token, user, originalToken: null, originalUser: null }),
      impersonate: (newToken, newUser) =>
        set((state) => ({
          // Preserve the original superadmin creds (only on first hop).
          originalToken: state.originalToken ?? state.token,
          originalUser: state.originalUser ?? state.user,
          token: newToken,
          user: newUser,
          currentPage: 'dashboard',
          selectedModuleId: null,
          selectedRecordId: null,
          selectedHierarchyId: null,
        })),
      restoreImpersonation: () =>
        set((state) => {
          if (!state.originalToken || !state.originalUser) return {} as Partial<AppState>;
          return {
            token: state.originalToken,
            user: state.originalUser,
            originalToken: null,
            originalUser: null,
            currentPage: 'admin-users',
            selectedModuleId: null,
            selectedRecordId: null,
            selectedHierarchyId: null,
          } as Partial<AppState>;
        }),
      logout: () =>
        set({
          token: null,
          originalToken: null,
          originalUser: null,
          user: null,
          currentPage: 'dashboard',
          selectedModuleId: null,
          selectedRecordId: null,
          selectedHierarchyId: null,
        }),

      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      onboardingCompleted: {},
      onboardingTrigger: 0,
      completeOnboarding: (username) =>
        set((state) => ({
          onboardingCompleted: { ...state.onboardingCompleted, [username]: true },
        })),
      resetOnboarding: (username) =>
        set((state) => {
          const next = { ...state.onboardingCompleted };
          delete next[username];
          return { onboardingCompleted: next };
        }),
      replayOnboarding: () =>
        set((state) => {
          if (!state.user) return state;
          const next = { ...state.onboardingCompleted };
          delete next[state.user.username];
          return {
            onboardingCompleted: next,
            onboardingTrigger: state.onboardingTrigger + 1,
          };
        }),
      needsOnboarding: () => {
        const state = useAppStore.getState();
        if (!state.user) return false;
        return !state.onboardingCompleted[state.user.username];
      },
    }),
    {
      name: 'maa-btool-storage',
      partialize: (state) => ({
        token: state.token,
        originalToken: state.originalToken,
        originalUser: state.originalUser,
        user: state.user,
        currentPage: state.currentPage,
        onboardingCompleted: state.onboardingCompleted,
      }),
    }
  )
);
