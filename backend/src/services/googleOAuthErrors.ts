/**
 * Public Google sign-in error codes (safe to put in a redirect query string).
 * Never put tokens, emails, or stack traces in these values.
 */
export const GOOGLE_AUTH_ERROR = {
  USER_SUSPENDED: "user_suspended",
  USER_DELETED: "user_deleted",
  REGISTRATIONS_DISABLED: "registrations_disabled",
  INVALID_GOOGLE_PROFILE: "invalid_google_profile",
  SESSION_FAILED: "session_failed",
  GOOGLE_ACCOUNT_MISMATCH: "google_account_mismatch",
  GOOGLE_AUTH_FAILED: "google_auth_failed",
  AUTH_FAILED: "auth_failed",
  NOT_CONFIGURED: "not_configured",
} as const;

export type GoogleAuthErrorCode = (typeof GOOGLE_AUTH_ERROR)[keyof typeof GOOGLE_AUTH_ERROR];

export function isUsableGoogleProfile(profile: { googleId?: string; email?: string }): boolean {
  return Boolean(profile.googleId?.trim() && profile.email?.trim());
}

/**
 * How Google login should treat a row found by email.
 * Soft-deleted rows occupy the unique email and must be treated as absent (tombstone + create).
 * Live suspension (suspended, not deleted) stays blocked.
 */
export function googleEmailAccountPolicy(
  user: { deletedAt: Date | string | null; suspended: boolean } | null
): "missing" | "active" | "suspended" {
  if (!user) return "missing";
  if (user.deletedAt) return "missing";
  if (user.suspended) return "suspended";
  return "active";
}

export function googleAuthRedirectCode(err: unknown): GoogleAuthErrorCode {
  if (err && typeof err === "object" && "details" in err) {
    const code = (err as { details?: { code?: string } }).details?.code;
    if (code && Object.values(GOOGLE_AUTH_ERROR).includes(code as GoogleAuthErrorCode)) {
      return code as GoogleAuthErrorCode;
    }
  }
  return GOOGLE_AUTH_ERROR.GOOGLE_AUTH_FAILED;
}
