import { create } from "zustand";
import { persist } from "zustand/middleware";

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

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: true,

      setUser: (user) => set({ user: user || null }),

      setToken: (token) => {
        if (token) {
          localStorage.setItem("lms_token", token);
          sessionStorage.setItem("lms_token", token);
        } else {
          localStorage.removeItem("lms_token");
          sessionStorage.removeItem("lms_token");
        }
        set({ token });
      },

      clearAuth: () => {
        localStorage.removeItem("lms_token");
        sessionStorage.removeItem("lms_token");
        set({ user: null, token: null });
      },

      setLoading: (loading) => set({ isLoading: loading }),

      logout: async () => {
        const token = getStoredToken();
        if (token) {
          try {
            await fetch("/api/auth/logout", {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
            });
          } catch {
            // ignore logout API errors
          }
        }
        localStorage.removeItem("lms_token");
        sessionStorage.removeItem("lms_token");
        set({ user: null, token: null });
      },

      fetchUser: async () => {
        const state = get();
        const { setLoading, setUser, setToken } = state;

        try {
          const token = getStoredToken();
          if (!token) {
            setUser(null);
            setToken(null);
            return;
          }

          const hasCachedSession = !!state.user && state.token === token;
          if (!hasCachedSession) {
            setLoading(true);
          }

          const response = await fetch("/api/auth/me", {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            if (response.status === 401) {
              setUser(null);
              setToken(null);
              return;
            }
            throw new Error("Failed to fetch user");
          }

          const data = await response.json();

          if (data.success && data.user) {
            setUser(data.user);
            setToken(token);
          } else {
            setUser(null);
            setToken(null);
          }
        } catch (error: any) {
          console.error("Error fetching user:", error);
          if (!get().user) {
            setUser(null);
            setToken(null);
          }
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
        if (state?.user && state?.token) {
          state.isLoading = false;
        }
      },
    }
  )
);
