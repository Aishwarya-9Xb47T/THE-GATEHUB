/**
 * Canonical public frontend origin for email links and OAuth redirects.
 * Never emit localhost links when NODE_ENV=production.
 */
export function getFrontendUrl(): string {
  const raw =
    process.env.FRONTEND_URL?.trim() ||
    process.env.CLIENT_URL?.trim() ||
    "";

  if (raw && !/localhost|127\.0\.0\.1/i.test(raw)) {
    return raw.replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    if (raw) return raw.replace(/\/+$/, "");
    return "https://gatehub-frontend.onrender.com";
  }

  if (!raw) return "http://localhost:5173";
  return raw.replace(/\/+$/, "");
}

export function getClientUrlSafe(): string {
  return getFrontendUrl();
}

