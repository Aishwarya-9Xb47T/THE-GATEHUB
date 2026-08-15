import { describe, expect, it } from "@jest/globals";
import {
  GOOGLE_AUTH_ERROR,
  googleAuthRedirectCode,
  isUsableGoogleProfile,
} from "../googleOAuthErrors.js";

describe("isUsableGoogleProfile", () => {
  it("rejects missing googleId so Prisma does not omit the lookup filter", () => {
    expect(isUsableGoogleProfile({ email: "user@example.com" })).toBe(false);
    expect(isUsableGoogleProfile({ googleId: "  ", email: "user@example.com" })).toBe(false);
    expect(isUsableGoogleProfile({ googleId: "sub-1", email: "user@example.com" })).toBe(true);
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
