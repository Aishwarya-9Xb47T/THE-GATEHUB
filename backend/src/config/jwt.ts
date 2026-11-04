/** Shared JWT configuration — must match between sign and verify. */
const secret = process.env.JWT_SECRET?.trim();

if (!secret) {
  throw new Error(
    "JWT_SECRET environment variable is required. Set a strong secret in backend/.env — hard-coded fallbacks are disabled."
  );
}

if (secret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters.");
}

export const JWT_SECRET = secret;
// Short-lived access tokens (15 minutes). Long-lived persistent session is handled via HttpOnly refresh-token cookie.
export const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || "15m";
