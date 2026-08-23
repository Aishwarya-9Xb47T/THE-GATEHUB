/**
 * Allowed browser origins for credentialed CORS.
 * CLIENT_URL / FRONTEND_URL stay first-class so existing Render env still works.
 * Do not use origin: "*" — this API uses credentials.
 */

const STATIC_ALLOWED_ORIGINS = [
  "https://gatehub-frontend.onrender.com",
  "http://darkred-viper-851326.hostingersite.com",
  "https://darkred-viper-851326.hostingersite.com",
  "http://localhost:5173",
  "http://localhost:3000",
] as const;

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/$/, "");
}

function extraEnvOrigins(): string[] {
  return [process.env.CLIENT_URL, process.env.FRONTEND_URL]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map(normalizeOrigin);
}

export function getAllowedCorsOrigins(): string[] {
  const isProduction = process.env.NODE_ENV === "production";
  const origins = new Set<string>([
    ...STATIC_ALLOWED_ORIGINS,
    ...extraEnvOrigins(),
    ...(!isProduction ? ["http://localhost:5174"] : []),
  ]);
  return [...origins];
}

/** True when a request Origin is on the allowlist. Missing origin is not evaluated here. */
export function isAllowedCorsOrigin(origin: string | undefined | null): boolean {
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  if (getAllowedCorsOrigins().includes(normalized)) return true;
  if (process.env.NODE_ENV !== "production" && /^http:\/\/localhost:\d+$/.test(normalized)) {
    return true;
  }
  return false;
}
