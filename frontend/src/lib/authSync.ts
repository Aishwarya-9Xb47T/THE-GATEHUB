import { useUserStore } from "@/store/userStore";
import { clearUserQueryCache } from "@/lib/queryCachePersist";

type AuthSyncMessage =
  | { type: "LOGOUT" }
  | { type: "LOGIN"; token: string };

const AUTH_CHANNEL_NAME = "gatehub_auth_channel";
let broadcastChannel: BroadcastChannel | null = null;

export function notifyAuthLogout() {
  if (typeof window === "undefined") return;
  try {
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: "LOGOUT" });
    }
    // Storage event trigger for browsers/contexts without BroadcastChannel support
    localStorage.setItem("gatehub_auth_event", JSON.stringify({ type: "LOGOUT", timestamp: Date.now() }));
    localStorage.removeItem("gatehub_auth_event");
  } catch {
    // Ignore postMessage / localStorage errors
  }
}

export function notifyAuthLogin(token: string) {
  if (typeof window === "undefined") return;
  try {
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: "LOGIN", token });
    }
    localStorage.setItem("gatehub_auth_event", JSON.stringify({ type: "LOGIN", token, timestamp: Date.now() }));
    localStorage.removeItem("gatehub_auth_event");
  } catch {
    // Ignore
  }
}

export function initAuthSync() {
  if (typeof window === "undefined") return;

  function handleMessage(msg: AuthSyncMessage) {
    if (msg.type === "LOGOUT") {
      const state = useUserStore.getState();
      if (state.user || state.token) {
        state.clearAuth();
        clearUserQueryCache();
        const path = window.location.pathname;
        const isProtected =
          path.startsWith("/admin") ||
          path.startsWith("/instructor") ||
          path.startsWith("/student") ||
          path.startsWith("/dashboard");
        if (isProtected) {
          window.location.assign(`/login?from=${encodeURIComponent(path)}`);
        }
      }
    } else if (msg.type === "LOGIN" && msg.token) {
      const state = useUserStore.getState();
      if (!state.user || state.token !== msg.token) {
        state.fetchUser();
      }
    }
  }

  try {
    if (typeof BroadcastChannel !== "undefined") {
      broadcastChannel = new BroadcastChannel(AUTH_CHANNEL_NAME);
      broadcastChannel.onmessage = (event) => {
        if (event?.data?.type) {
          handleMessage(event.data as AuthSyncMessage);
        }
      };
    }
  } catch {
    // Fallback to storage listener below
  }

  window.addEventListener("storage", (event) => {
    if (event.key === "gatehub_auth_event" && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue) as AuthSyncMessage;
        if (parsed?.type) {
          handleMessage(parsed);
        }
      } catch {
        // ignore parse error
      }
    } else if (event.key === "lms_token" && !event.newValue) {
      handleMessage({ type: "LOGOUT" });
    }
  });
}

