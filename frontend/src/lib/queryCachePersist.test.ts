import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  isPublicQueryKey,
  isUserPrivateQueryKey,
  restoreQueryCache,
  clearUserQueryCache,
  PUBLIC_CACHE_STORAGE_KEY,
  getUserCacheStorageKey,
} from "./queryCachePersist";

describe("queryCachePersist Security & Classification", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("Query Key Classification", () => {
    it("classifies public catalog keys as public", () => {
      expect(isPublicQueryKey(["landing", "featured-courses"])).toBe(true);
      expect(isPublicQueryKey(["landing", "learning-universes"])).toBe(true);
      expect(isPublicQueryKey(["courses", "browse"])).toBe(true);
      expect(isPublicQueryKey(["categories"])).toBe(true);
      expect(isPublicQueryKey(["help", "faq"])).toBe(true);
      expect(isPublicQueryKey(["resources"])).toBe(true);
    });

    it("NEVER classifies instructor or admin keys as public", () => {
      expect(isPublicQueryKey(["courses", "my-instructor"])).toBe(false);
      expect(isPublicQueryKey(["instructor", "dashboard"])).toBe(false);
      expect(isPublicQueryKey(["admin", "users"])).toBe(false);
      expect(isPublicQueryKey(["admin", "courses"])).toBe(false);
      expect(isPublicQueryKey(["courses", "drafts"])).toBe(false);
      expect(isPublicQueryKey(["courses", "mine"])).toBe(false);
    });

    it("classifies user-private queries correctly", () => {
      expect(isUserPrivateQueryKey(["learning", "my"])).toBe(true);
      expect(isUserPrivateQueryKey(["my-certificates"])).toBe(true);
      expect(isUserPrivateQueryKey(["my-enrollments"])).toBe(true);
      expect(isUserPrivateQueryKey(["courses", "my-instructor"])).toBe(true);
      expect(isUserPrivateQueryKey(["cart"])).toBe(true);
      expect(isUserPrivateQueryKey(["wishlist"])).toBe(true);
    });

    it("does not classify admin queries as user-private (admin remains memory-only)", () => {
      expect(isUserPrivateQueryKey(["admin", "analytics"])).toBe(false);
    });
  });

  describe("Account Switching & Cross-User Data Isolation", () => {
    it("does not restore User A's private data for User B", () => {
      const client = new QueryClient();

      // Seed storage as if User A was previously logged in
      const userAId = "user-a-123";
      const userAKey = getUserCacheStorageKey(userAId);
      localStorage.setItem(
        userAKey,
        JSON.stringify([
          {
            queryKey: ["my-certificates"],
            data: { certificates: [{ id: "cert-A", title: "Cert for A" }] },
            updatedAt: Date.now(),
          },
        ])
      );

      // Current active user is User B
      const userBId = "user-b-456";
      localStorage.setItem("lms-auth", JSON.stringify({ state: { user: { id: userBId } } }));

      // Run restore for the current session
      restoreQueryCache(client);

      // Verify User B did NOT receive User A's certificates
      const certificates = client.getQueryData(["my-certificates"]);
      expect(certificates).toBeUndefined();
    });

    it("restores User A's private data when User A is active", () => {
      const client = new QueryClient();
      const userAId = "user-a-123";
      const userAKey = getUserCacheStorageKey(userAId);
      localStorage.setItem(
        userAKey,
        JSON.stringify([
          {
            queryKey: ["my-certificates"],
            data: { certificates: [{ id: "cert-A", title: "Cert for A" }] },
            updatedAt: Date.now(),
          },
        ])
      );

      localStorage.setItem("lms-auth", JSON.stringify({ state: { user: { id: userAId } } }));

      restoreQueryCache(client);

      const certificates = client.getQueryData<{ certificates: Array<{ id: string }> }>(["my-certificates"]);
      expect(certificates).toBeDefined();
      expect(certificates?.certificates[0].id).toBe("cert-A");
    });

    it("wipes user private cache on logout via clearUserQueryCache", () => {
      const userAId = "user-a-123";
      const userAKey = getUserCacheStorageKey(userAId);
      localStorage.setItem(userAKey, JSON.stringify([{ queryKey: ["cart"], data: [1], updatedAt: Date.now() }]));

      clearUserQueryCache(userAId);

      expect(localStorage.getItem(userAKey)).toBeNull();
    });
  });

  describe("Stale Data & Malformed Cache Resilience", () => {
    it("ignores expired entries older than 24 hours on restore", () => {
      const client = new QueryClient();
      const expiredTime = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago

      localStorage.setItem(
        PUBLIC_CACHE_STORAGE_KEY,
        JSON.stringify([
          {
            queryKey: ["categories"],
            data: { categories: [{ id: "cat-old", name: "Old Category" }] },
            updatedAt: expiredTime,
          },
        ])
      );

      restoreQueryCache(client);

      expect(client.getQueryData(["categories"])).toBeUndefined();
    });

    it("handles corrupted or malformed JSON in localStorage gracefully without crashing", () => {
      const client = new QueryClient();
      localStorage.setItem(PUBLIC_CACHE_STORAGE_KEY, "{ not-valid-json ]");

      expect(() => restoreQueryCache(client)).not.toThrow();
      expect(client.getQueryData(["categories"])).toBeUndefined();
    });
  });
});
