import { useUserStore, type User as StoreUser, type Role as StoreRole } from "./userStore";

export type Role = StoreRole;
export type User = StoreUser;

/**
 * Legacy compatibility hook delegating to the unified useUserStore.
 * Prevents localStorage key collision on "lms-auth".
 */
export const useAuthStore = Object.assign(
  (selector?: (state: { user: User | null; token: string | null }) => any) => {
    const store = useUserStore();
    const slice = { user: store.user, token: store.token };
    return selector ? selector(slice) : slice;
  },
  {
    getState: () => {
      const s = useUserStore.getState();
      return { user: s.user, token: s.token };
    },
    setState: (partial: any) => {
      if (partial.user !== undefined) useUserStore.getState().setUser(partial.user);
      if (partial.token !== undefined) useUserStore.getState().setToken(partial.token);
    },
    subscribe: (listener: any) => useUserStore.subscribe(listener),
  }
);
