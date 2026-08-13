import crypto from "crypto";

/** Normalize email for storage and lookup (trim + lowercase). */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmailFormat(email: string): boolean {
  // Practical RFC5322-ish check; zod also validates at the edge.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/** Cryptographically random URL-safe token (raw — only send to user; store hash). */
export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}
