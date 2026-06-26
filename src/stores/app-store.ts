import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PageView =
  | 'dashboard'
  | 'modules'
  | 'module-detail'
  | 'data-records'
  | 'record-detail'
  | 'workflow'
  | 'hierarchy'
  | 'hierarchy-detail'
  | 'admin-users'
  | 'admin-roles'
  | 'admin-companies'
  | 'admin-lookups'
  | 'bulk-import'
  | 'audit-log'
  | 'settings'
  | 'documentation'
  | 'ai-assistant'
  | 'api-management'
  | 'brand-settings'
  | 'system-health'
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
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentPage: 'dashboard',
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
    }),
    {
      name: 'maa-btool-storage',
      partialize: (state) => ({
        token: state.token,
        originalToken: state.originalToken,
        originalUser: state.originalUser,
        user: state.user,
        currentPage: state.currentPage,
      }),
    }
  )
);
