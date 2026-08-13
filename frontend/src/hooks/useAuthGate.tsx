import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";
import { AuthModal } from "@/components/auth/AuthModal";
import { useUserStore } from "@/store/userStore";

interface AuthGateState {
  isOpen: boolean;
  message: string;
  onSuccess?: () => void;
  returnTo?: string;
}

interface AuthGateContextValue {
  /** Call this before any protected action. If user is logged in, calls the action immediately.
   *  If not, shows the auth modal and queues the action to run after successful login. */
  requireAuth: (action: () => void, message?: string) => void;
  /** Open the auth gate modal directly without an action callback */
  openAuthGate: (message?: string, returnTo?: string) => void;
}

const AuthGateContext = createContext<AuthGateContextValue | null>(null);

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const { user } = useUserStore();
  const [state, setState] = useState<AuthGateState>({
    isOpen: false,
    message: "Sign in to continue learning",
  });

  const pendingAction = useRef<(() => void) | null>(null);

  const requireAuth = useCallback(
    (action: () => void, message = "Sign in to continue") => {
      const currentUser = useUserStore.getState().user;
      if (currentUser) {
        // Already logged in — run action immediately
        action();
        return;
      }
      // Not logged in — store action and open modal
      pendingAction.current = action;
      setState({
        isOpen: true,
        message,
        onSuccess: () => {
          pendingAction.current?.();
          pendingAction.current = null;
        },
      });
    },
    []
  );

  const openAuthGate = useCallback((message = "Sign in to continue", returnTo?: string) => {
    setState({
      isOpen: true,
      message,
      returnTo,
    });
  }, []);

  const handleClose = useCallback(() => {
    pendingAction.current = null;
    setState((s) => ({ ...s, isOpen: false }));
  }, []);

  return (
    <AuthGateContext.Provider value={{ requireAuth, openAuthGate }}>
      {children}
      <AuthModal
        isOpen={state.isOpen}
        onClose={handleClose}
        onSuccess={state.onSuccess}
        message={state.message}
        returnTo={state.returnTo}
      />
    </AuthGateContext.Provider>
  );
}

/**
 * Hook to trigger the auth gate modal from any component.
 *
 * @example
 * const { requireAuth } = useAuthGate();
 * // In a button handler:
 * requireAuth(() => enrollInCourse(courseId), "Sign in to start learning");
 */
export function useAuthGate(): AuthGateContextValue {
  const ctx = useContext(AuthGateContext);
  if (!ctx) {
    throw new Error("useAuthGate must be used within AuthGateProvider");
  }
  return ctx;
}
