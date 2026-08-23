import { afterEach, describe, expect, it } from "@jest/globals";
import { getAllowedCorsOrigins, isAllowedCorsOrigin } from "../corsOrigins.js";

const REQUIRED_ORIGINS = [
  "https://gatehub-frontend.onrender.com",
  "http://darkred-viper-851326.hostingersite.com",
  "https://darkred-viper-851326.hostingersite.com",
  "http://localhost:5173",
  "http://localhost:3000",
];

describe("corsOrigins", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalClientUrl = process.env.CLIENT_URL;
  const originalFrontendUrl = process.env.FRONTEND_URL;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalClientUrl === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = originalClientUrl;
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
  });

  it("allows Render, Hostinger, and local origins in production", () => {
    process.env.NODE_ENV = "production";
    process.env.CLIENT_URL = "https://gatehub-frontend.onrender.com";
    process.env.FRONTEND_URL = "https://gatehub-frontend.onrender.com";

    const allowed = getAllowedCorsOrigins();
    for (const origin of REQUIRED_ORIGINS) {
      expect(allowed).toContain(origin);
      expect(isAllowedCorsOrigin(origin)).toBe(true);
    }
  });

  it("still honors extra CLIENT_URL / FRONTEND_URL values", () => {
    process.env.NODE_ENV = "production";
    process.env.CLIENT_URL = "https://custom-client.example/";
    process.env.FRONTEND_URL = "https://custom-frontend.example";

    expect(isAllowedCorsOrigin("https://custom-client.example")).toBe(true);
    expect(isAllowedCorsOrigin("https://custom-frontend.example/")).toBe(true);
    expect(getAllowedCorsOrigins()).toContain("https://gatehub-frontend.onrender.com");
  });

  it("rejects untrusted origins in production", () => {
    process.env.NODE_ENV = "production";
    expect(isAllowedCorsOrigin("https://evil.example")).toBe(false);
    expect(isAllowedCorsOrigin("http://localhost:9999")).toBe(false);
  });

  it("allows other localhost ports only outside production", () => {
    process.env.NODE_ENV = "development";
    expect(isAllowedCorsOrigin("http://localhost:5174")).toBe(true);
    expect(isAllowedCorsOrigin("http://localhost:4173")).toBe(true);
  });
});
