import { prisma } from "../utils/prisma.js";
import { generateSecureToken, hashToken } from "../utils/emailNormalize.js";

export type AuthTokenType =
  | "email_verify"
  | "password_reset"
  | "email_change"
  | "oauth_exchange";

const DEFAULT_TTL_MS: Record<AuthTokenType, number> = {
  email_verify: 24 * 60 * 60 * 1000,
  password_reset: 60 * 60 * 1000,
  email_change: 24 * 60 * 60 * 1000,
  oauth_exchange: 2 * 60 * 1000,
};

export async function issueAuthToken(opts: {
  userId: string;
  type: AuthTokenType;
  payload?: Record<string, unknown>;
  ttlMs?: number;
}): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = generateSecureToken(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + (opts.ttlMs ?? DEFAULT_TTL_MS[opts.type]));

  // Invalidate prior unused tokens of same type for this user (except oauth_exchange)
  if (opts.type !== "oauth_exchange") {
    await prisma.authToken.updateMany({
      where: { userId: opts.userId, type: opts.type, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  await prisma.authToken.create({
    data: {
      userId: opts.userId,
      type: opts.type,
      tokenHash,
      payload: opts.payload ?? undefined,
      expiresAt,
    },
  });

  return { rawToken, expiresAt };
}

export async function consumeAuthToken(opts: {
  rawToken: string;
  type: AuthTokenType;
}): Promise<{
  userId: string;
  payload: Record<string, unknown> | null;
  tokenId: string;
} | null> {
  const tokenHash = hashToken(opts.rawToken);
  const row = await prisma.authToken.findUnique({ where: { tokenHash } });
  if (!row || row.type !== opts.type) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;

  await prisma.authToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });

  return {
    userId: row.userId,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    tokenId: row.id,
  };
}

export async function peekAuthToken(opts: {
  rawToken: string;
  type: AuthTokenType;
}): Promise<boolean> {
  const tokenHash = hashToken(opts.rawToken);
  const row = await prisma.authToken.findUnique({ where: { tokenHash } });
  if (!row || row.type !== opts.type) return false;
  if (row.usedAt) return false;
  if (row.expiresAt.getTime() < Date.now()) return false;
  return true;
}
