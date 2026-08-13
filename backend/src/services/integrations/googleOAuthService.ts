import crypto from "crypto";
import { prisma } from "../../utils/prisma.js";
import { encryptToken, decryptToken } from "./tokenCrypto.js";

const PROVIDER_ID = "google-oauth";
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v2/userinfo";

export const GOOGLE_DRIVE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
];

export const GOOGLE_FORMS_IMPORT_SCOPES = [
  ...GOOGLE_DRIVE_SCOPES,
  "https://www.googleapis.com/auth/forms.body.readonly",
];

const pendingStates = new Map<string, { userId: string; returnTo: string; expiresAt: number; scopes?: string[] }>();

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function clientId() {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_CLIENT_ID is not configured");
  return id;
}

function clientSecret() {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET is not configured");
  return secret;
}

function redirectUri() {
  const base = process.env.API_URL || "http://localhost:5000";
  return `${base}/api/integrations/google/callback`;
}

export async function getGoogleConnectionStatus(userId: string) {
  const row = await prisma.userIntegration.findUnique({
    where: { userId_providerId: { userId, providerId: PROVIDER_ID } },
    select: { profileEmail: true, scopes: true, expiresAt: true, updatedAt: true },
  });
  if (!row) return { connected: false, configured: isGoogleOAuthConfigured() };
  return {
    connected: true,
    configured: true,
    email: row.profileEmail,
    scopes: row.scopes,
    expiresAt: row.expiresAt,
    updatedAt: row.updatedAt,
  };
}

export function buildGoogleAuthUrl(userId: string, returnTo: string, scopes: string[] = GOOGLE_DRIVE_SCOPES): string {
  if (!isGoogleOAuthConfigured()) {
    throw new Error("Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }
  const state = crypto.randomBytes(24).toString("base64url");
  pendingStates.set(state, { userId, returnTo, expiresAt: Date.now() + 10 * 60 * 1000, scopes });

  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

export async function handleGoogleCallback(code: string, state: string): Promise<{ returnTo: string }> {
  const pending = pendingStates.get(state);
  pendingStates.delete(state);
  if (!pending || pending.expiresAt < Date.now()) {
    throw new Error("OAuth state expired or invalid");
  }

  const tokenRes = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description || tokenData.error || "Google token exchange failed");
  }

  let profileEmail: string | undefined;
  try {
    const profileRes = await fetch(GOOGLE_USERINFO, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (profileRes.ok) {
      const profile = (await profileRes.json()) as { email?: string };
      profileEmail = profile.email;
    }
  } catch {
    /* optional */
  }

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000)
    : null;

  const existing = await prisma.userIntegration.findUnique({
    where: { userId_providerId: { userId: pending.userId, providerId: PROVIDER_ID } },
  });

  const grantedScopes = pending.scopes || GOOGLE_DRIVE_SCOPES;

  await prisma.userIntegration.upsert({
    where: { userId_providerId: { userId: pending.userId, providerId: PROVIDER_ID } },
    create: {
      userId: pending.userId,
      providerId: PROVIDER_ID,
      accessToken: encryptToken(tokenData.access_token),
      refreshToken: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : null,
      expiresAt,
      scopes: grantedScopes,
      profileEmail,
    },
    update: {
      accessToken: encryptToken(tokenData.access_token),
      refreshToken: tokenData.refresh_token
        ? encryptToken(tokenData.refresh_token)
        : existing?.refreshToken ?? null,
      expiresAt,
      scopes: grantedScopes,
      profileEmail: profileEmail ?? existing?.profileEmail,
    },
  });

  return { returnTo: pending.returnTo };
}

export async function getGoogleAccessToken(userId: string): Promise<string | null> {
  const row = await prisma.userIntegration.findUnique({
    where: { userId_providerId: { userId, providerId: PROVIDER_ID } },
  });
  if (!row) return null;

  const stillValid = row.expiresAt && row.expiresAt.getTime() > Date.now() + 60_000;
  if (stillValid) return decryptToken(row.accessToken);

  if (!row.refreshToken) return decryptToken(row.accessToken);

  const refreshRes = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: decryptToken(row.refreshToken),
      grant_type: "refresh_token",
    }),
  });

  const refreshData = (await refreshRes.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!refreshRes.ok || !refreshData.access_token) {
    return decryptToken(row.accessToken);
  }

  const expiresAt = refreshData.expires_in
    ? new Date(Date.now() + refreshData.expires_in * 1000)
    : row.expiresAt;

  await prisma.userIntegration.update({
    where: { id: row.id },
    data: {
      accessToken: encryptToken(refreshData.access_token),
      expiresAt,
    },
  });

  return refreshData.access_token;
}

export async function disconnectGoogle(userId: string): Promise<void> {
  await prisma.userIntegration.deleteMany({
    where: { userId, providerId: PROVIDER_ID },
  });
}
