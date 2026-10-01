/**
 * Canonical public frontend origin for email links and OAuth redirects.
 * Default production origin is https://thegatehub.com.
 * Never emit localhost links or old Render frontend subdomains when NODE_ENV=production.
 */
export function getFrontendUrl(): string {
  const raw =
    process.env.FRONTEND_URL?.trim() ||
    process.env.CLIENT_URL?.trim() ||
    "";

  if (process.env.NODE_ENV === "production") {
    // If empty or pointing to legacy Render frontend URL, always use the canonical custom domain
    if (!raw || /gatehub-frontend\.onrender\.com/i.test(raw)) {
      return "https://thegatehub.com";
    }
  }

  if (raw && !/localhost|127\.0\.0\.1/i.test(raw)) {
    return raw.replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    return "https://thegatehub.com";
  }

  if (!raw) return "http://localhost:5173";
  return raw.replace(/\/+$/, "");
}

export function getClientUrlSafe(): string {
  return getFrontendUrl();
}
