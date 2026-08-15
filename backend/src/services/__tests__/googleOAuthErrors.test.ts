import { describe, expect, it } from "@jest/globals";
import {
  GOOGLE_AUTH_ERROR,
  googleAuthRedirectCode,
  googleEmailAccountPolicy,
  isUsableGoogleProfile,
} from "../googleOAuthErrors.js";

describe("isUsableGoogleProfile", () => {
  it("rejects missing googleId so Prisma does not omit the lookup filter", () => {
    expect(isUsableGoogleProfile({ email: "user@example.com" })).toBe(false);
    expect(isUsableGoogleProfile({ googleId: "  ", email: "user@example.com" })).toBe(false);
    expect(isUsableGoogleProfile({ googleId: "sub-1", email: "user@example.com" })).toBe(true);
  });
});

describe("googleEmailAccountPolicy", () => {
  it("treats soft-deleted rows as missing so Google can create a new active account", () => {
    expect(googleEmailAccountPolicy(null)).toBe("missing");
    expect(googleEmailAccountPolicy({ deletedAt: new Date(), suspended: true })).toBe("missing");
    expect(googleEmailAccountPolicy({ deletedAt: "2024-01-01", suspended: false })).toBe("missing");
  });

  it("blocks live suspensions and allows active accounts", () => {
    expect(googleEmailAccountPolicy({ deletedAt: null, suspended: true })).toBe("suspended");
    expect(googleEmailAccountPolicy({ deletedAt: null, suspended: false })).toBe("active");
  });
});

describe("googleAuthRedirectCode", () => {
  it("uses structured AppError codes and never forwards raw messages", () => {
    expect(
      googleAuthRedirectCode({
        details: { code: GOOGLE_AUTH_ERROR.USER_SUSPENDED },
      })
    ).toBe("user_suspended");
    expect(googleAuthRedirectCode(new Error("Account suspended or deleted"))).toBe(
      "google_auth_failed"
    );
    expect(googleAuthRedirectCode({ details: { code: "not-a-real-code" } })).toBe(
      "google_auth_failed"
    );
  });
});
