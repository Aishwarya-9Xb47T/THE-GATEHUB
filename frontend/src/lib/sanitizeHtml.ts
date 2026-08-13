import DOMPurify from "isomorphic-dompurify";

/** Sanitize untrusted HTML before any dangerouslySetInnerHTML usage. */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
  });
}
