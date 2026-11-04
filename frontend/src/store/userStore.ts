import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiUrl } from "@/lib/api";

export type Role = "student" | "instructor" | "admin" | "super_admin";

export function isAdminRole(role?: string | null): boolean {
  return role === "admin" || role === "super_admin";
}

export function isSuperAdminRole(role?: string | null): boolean {
  return role === "super_admin";
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  avatar?: string | null;
  avatarTimestamp?: number;
  emailVerified?: boolean;
  pendingEmail?: string | null;
  instructorApprovalStatus?: "PENDING" | "APPROVED" | "REJECTED" | string | null;
  instructorApprovedAt?: string | null;
  instructorApprovalNotes?: string | null;
  instructorRejectionReason?: string | null;
}

interface UserState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
}

export function getHomeRoute(role?: string): string {
  if (isAdminRole(role)) return "/admin";
  if (role === "instructor") return "/instructor";
  return "/student";
}

export function isInstructorApproved(user?: User | null): boolean {
  if (!user) return false;
  if (isAdminRole(user.role)) return true;
  if (user.role === "instructor") {
    return user.instructorApprovalStatus === "APPROVED";
  }
  return false;
}

const getStoredToken = (): string | null => {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const qToken = params.get("token");
    if (qToken) {
      localStorage.setItem("lms_token", qToken);
      sessionStorage.setItem("lms_token", qToken);
    }
    return localStorage.getItem("lms_token") || sessionStorage.getItem("lms_token");
  }
  return null;
};

const getInitialAuthState = (): { user: User | null; token: string | null; isLoading: boolean } => {
  if (typeof window === "undefined") {
    return { user: null, token: null, isLoading: true };
  }
  const token = getStoredToken();
  if (!token) {
    return { user: null, token: null, isLoading: false };
  }
  try {
    const raw = localStorage.getItem("lms-auth");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.state?.user) {
        return { user: parsed.state.user, token, isLoading: false };
      }
    }
  } catch {}
  return { user: null, token, isLoading: true };
};

const initialAuth = getInitialAuthState();

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: initialAuth.user,
      token: initialAuth.token,
      isLoading: initialAuth.isLoading,

      setUser: (user) => set({ user: user || null }),

      setToken: (token) => {
        if (token) {
          localStorage.setItem("lms_token", token);
          sessionStorage.setItem("lms_token", token);
          try {
            import("@/lib/authSync").then((m) => m.notifyAuthLogin(token)).catch(() => {});
          } catch {}
        } else {
          localStorage.removeItem("lms_token");
          sessionStorage.removeItem("lms_token");
        }
        set({ token });
      },

      clearAuth: () => {
        localStorage.removeItem("lms_token");
        sessionStorage.removeItem("lms_token");
        localStorage.removeItem("lms-auth");
        set({ user: null, token: null });
      },

      setLoading: (loading) => set({ isLoading: loading }),

      logout: async () => {
        const token = getStoredToken();
        try {
          await fetch(apiUrl("/api/auth/logout"), {
            method: "POST",
            credentials: "include",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
        } catch {
          // ignore logout API errors
        }
        localStorage.removeItem("lms_token");
        sessionStorage.removeItem("lms_token");
        localStorage.removeItem("lms-auth");
        try {
          const { clearUserQueryCache } = await import("@/lib/queryCachePersist");
          clearUserQueryCache();
        } catch {}
        try {
          const { notifyAuthLogout } = await import("@/lib/authSync");
          notifyAuthLogout();
        } catch {}
        set({ user: null, token: null, isLoading: false });
      },

      fetchUser: async () => {
        const state = get();
        const { setLoading, setUser, setToken } = state;

        try {
          let token = getStoredToken();
          if (!token) {
            // Attempt cookie-based persistent session recovery (HttpOnly gatehub_refresh_token)
            try {
              const cookieRefreshRes = await fetch(apiUrl("/api/auth/refresh"), {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
              });
              if (cookieRefreshRes.ok) {
                const refreshData = await cookieRefreshRes.json();
                if (refreshData.success && (refreshData.token || refreshData.accessToken) && refreshData.user) {
                  const restoredToken = (refreshData.token || refreshData.accessToken) as string;
                  setToken(restoredToken);
                  setUser(refreshData.user);
                  setLoading(false);
                  return;
                }
              }
            } catch {
              // No cookie or network down
            }

            setUser(null);
            setToken(null);
            setLoading(false);
            return;
          }

          const hasCachedSession = !state.user && state.token === token;
          if (!hasCachedSession) {
            setLoading(true);
          }

          const response = await fetch(apiUrl("/api/auth/me"), {
            credentials: "include",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.user) {
              setUser(data.user);
              setToken(token);
              setLoading(false);
              return;
            }
          }

          if (response.status === 401) {
            try {
              const refreshRes = await fetch(apiUrl("/api/auth/refresh"), {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token }),
              });
              if (refreshRes.ok) {
                const refreshData = await refreshRes.json();
                if (refreshData.success && (refreshData.token || refreshData.accessToken) && refreshData.user) {
                  const newToken = (refreshData.token || refreshData.accessToken) as string;
                  setToken(newToken);
                  setUser(refreshData.user);
                  setLoading(false);
                  return;
                }
              }
            } catch (refErr) {
              console.warn("[Auth] fetchUser silent refresh failed:", refErr);
            }

            setUser(null);
            setToken(null);
            return;
          }

          // For 500/502/503 during cold boot: retain cached user session
        } catch (error: any) {
          console.warn("[Auth] Network error during session fetch (retaining offline session):", error);
        } finally {
          setLoading(false);
        }
      },
    }),
    {
      name: "lms-auth",
      partialize: (state) => ({
        token: state.token,
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isLoading = false;
        }
      },
    }
  )
);
