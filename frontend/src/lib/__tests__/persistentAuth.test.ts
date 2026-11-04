import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getToken, silentRefreshToken, api } from "@/lib/api";
import { useUserStore } from "@/store/userStore";

describe("Persistent Authentication & Silent Renewal", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("prioritizes persistent localStorage over sessionStorage so sessions survive browser restarts", () => {
    localStorage.setItem("lms_token", "persistent-jwt-token");
    expect(getToken()).toBe("persistent-jwt-token");

    sessionStorage.setItem("lms_token", "temporary-jwt-token");
    // persistent storage takes precedence
    expect(getToken()).toBe("persistent-jwt-token");
  });

  it("renews token silently via /auth/refresh and updates local storage and lms-auth", async () => {
    localStorage.setItem("lms_token", "expiring-token");
    localStorage.setItem(
      "lms-auth",
      JSON.stringify({
        state: { token: "expiring-token", user: { id: "u1", role: "student" } },
      })
    );

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        token: "fresh-new-token",
        user: { id: "u1", role: "student", firstName: "Alex" },
      }),
    } as any);

    const refreshed = await silentRefreshToken();
    expect(refreshed).toBe("fresh-new-token");
    expect(localStorage.getItem("lms_token")).toBe("fresh-new-token");

    const updatedAuth = JSON.parse(localStorage.getItem("lms-auth") || "{}");
    expect(updatedAuth?.state?.token).toBe("fresh-new-token");
    expect(updatedAuth?.state?.user?.firstName).toBe("Alex");
  });

  it("transparently retries API requests on 401 after silent refresh without redirecting", async () => {
    localStorage.setItem("lms_token", "old-token");

    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      if (url.includes("/auth/refresh")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            token: "renewed-token-abc",
            user: { id: "u1", role: "instructor" },
          }),
        };
      }
      if (url.includes("/api/protected-resource")) {
        if (callCount === 1) {
          // First attempt returns 401
          return {
            ok: false,
            status: 401,
            text: async () => JSON.stringify({ error: "Token expired" }),
          };
        }
        // Second attempt with renewed token succeeds
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ success: true, data: "protected content" }),
        };
      }
      return { ok: false, status: 404, text: async () => "{}" };
    });

    const result = await api<{ success: boolean; data: string }>("/protected-resource");
    expect(result.data?.data).toBe("protected content");
    expect(localStorage.getItem("lms_token")).toBe("renewed-token-abc");
  });

  it("retains offline cached session during network error in fetchUser", async () => {
    useUserStore.setState({
      user: { id: "u2", email: "student@test.com", firstName: "Sam", lastName: "Lee", role: "student" },
      token: "saved-token",
      isLoading: false,
    });
    localStorage.setItem("lms_token", "saved-token");

    global.fetch = vi.fn().mockRejectedValue(new Error("Failed to fetch (offline / server booting)"));

    await useUserStore.getState().fetchUser();

    // User session remains intact!
    expect(useUserStore.getState().user?.id).toBe("u2");
    expect(useUserStore.getState().token).toBe("saved-token");
    expect(useUserStore.getState().isLoading).toBe(false);
  });
});
