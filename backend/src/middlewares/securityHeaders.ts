import type { RequestHandler } from "express";
import helmet from "helmet";

/**
 * Security headers compatible with GateHub (YouTube embeds, PPTX, payment iframes).
 * CSP is report-friendly / moderately permissive — tighten further per deployment.
 */
export function createSecurityHeadersMiddleware(): RequestHandler {
  const isProd = process.env.NODE_ENV === "production";

  return helmet({
    contentSecurityPolicy: false, // SPA + embeds; frontend owns page CSP. API returns JSON.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    frameguard: { action: "sameorigin" },
    hsts: isProd ? { maxAge: 15552000, includeSubDomains: true, preload: false } : false,
    noSniff: true,
    xssFilter: true,
  });
}
