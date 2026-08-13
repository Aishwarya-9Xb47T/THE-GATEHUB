/**
 * Canonical public frontend origin for email links and OAuth redirects.
 * Never emit localhost links when NODE_ENV=production.
 */
export function getFrontendUrl(): string {
  const raw =
    process.env.FRONTEND_URL?.trim() ||
    process.env.CLIENT_URL?.trim() ||
    "";

  if (process.env.NODE_ENV === "production") {
    if (!raw || /localhost|127\.0\.0\.1/i.test(raw)) {
      throw new Error(
        "FRONTEND_URL (or CLIENT_URL) must be set to the production GateHub domain when NODE_ENV=production"
      );
    }
  }

  if (!raw) return "http://localhost:5173";
  return raw.replace(/\/$/, "");
}

export function getClientUrlSafe(): string {
  try {
    return getFrontendUrl();
  } catch {
    return (process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173").replace(
      /\/$/,
      ""
    );
  }
}
