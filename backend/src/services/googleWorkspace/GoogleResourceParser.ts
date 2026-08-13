/**
 * Unified Google Workspace URL identification and normalization.
 * Used by content-builder analyze-google and frontend validation.
 *
 * Does NOT rely on fragile whole-string equality — extracts and validates
 * the Google resource ID from reasonable URL variations.
 */

import {
  getGoogleExtractionUserMessage,
  type GoogleExtractionErrorCode,
} from './googleExtractionErrors.js';

export type GoogleResourceType = 'google_docs' | 'google_forms' | 'google_drive';

export interface ParsedGoogleResource {
  resourceType: GoogleResourceType;
  resourceId: string;
  sourceUrl: string;
  /** Canonical URL used for dedupe / identity (no fragment, stripped tracking params). */
  normalizedUrl: string;
  isPublishedForm?: boolean;
  /** Drive file link — mime type must be resolved via Drive API. */
  needsTypeResolution?: boolean;
}

/** Google file IDs are typically long base64url-ish tokens. */
const GOOGLE_ID_RE = /^[a-zA-Z0-9_-]{10,128}$/;

const TRACKING_PARAMS = new Set([
  'usp',
  'pli',
  'authuser',
  'ouid',
  'rtpof',
  'sd',
  'fbclid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
]);

function stripWrapping(raw: string): string {
  let s = raw.trim();
  // Teachers sometimes paste markdown/HTML wrapped links
  const md = s.match(/\]\((https?:\/\/[^)\s]+)\)/i);
  if (md?.[1]) s = md[1];
  const href = s.match(/href=["'](https?:\/\/[^"']+)["']/i);
  if (href?.[1]) s = href[1];
  if ((s.startsWith('<') && s.endsWith('>')) || (s.startsWith('"') && s.endsWith('"'))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function tryParseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    try {
      return new URL(`https://${raw}`);
    } catch {
      return null;
    }
  }
}

export function isValidGoogleResourceId(id: string | undefined | null): boolean {
  if (!id) return false;
  return GOOGLE_ID_RE.test(id);
}

function canonicalizeGoogleUrl(parsed: URL, resourceType: GoogleResourceType, resourceId: string, isPublishedForm?: boolean): string {
  const host = parsed.hostname.toLowerCase();
  if (resourceType === 'google_docs') {
    return `https://docs.google.com/document/d/${resourceId}`;
  }
  if (resourceType === 'google_forms') {
    if (isPublishedForm) {
      return `https://docs.google.com/forms/d/e/${resourceId}/viewform`;
    }
    return `https://docs.google.com/forms/d/${resourceId}`;
  }
  if (host.includes('drive.google.com')) {
    return `https://drive.google.com/file/d/${resourceId}`;
  }
  return `https://drive.google.com/file/d/${resourceId}`;
}

function cleanQuery(u: URL): void {
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
      u.searchParams.delete(key);
    }
  }
}

/**
 * Parse Docs / Forms / Drive file links into a stable resource identity.
 */
export function parseGoogleResourceUrl(rawInput: string): ParsedGoogleResource | null {
  const trimmed = stripWrapping(rawInput);
  if (!trimmed) return null;

  const urlObj = tryParseUrl(trimmed);
  const haystack = urlObj ? `${urlObj.hostname}${urlObj.pathname}${urlObj.search}` : trimmed;
  const host = (urlObj?.hostname || '').toLowerCase();

  // --- Google Docs ---
  // Covers /edit, /view, /preview, bare /d/{id}, ?usp=sharing, /u/N/, fragments
  const docPatterns = [
    /docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/i,
  ];
  for (const pattern of docPatterns) {
    const match = haystack.match(pattern);
    if (match?.[1] && isValidGoogleResourceId(match[1])) {
      const resourceId = match[1];
      const sourceUrl = urlObj ? urlObj.toString() : trimmed;
      const normalizedUrl = canonicalizeGoogleUrl(
        urlObj || new URL(`https://docs.google.com/document/d/${resourceId}`),
        'google_docs',
        resourceId,
      );
      return {
        resourceType: 'google_docs',
        resourceId,
        sourceUrl,
        normalizedUrl,
      };
    }
  }

  // --- Google Forms (published /d/e/ first) ---
  const publishedFormPatterns = [
    /(?:docs\.google\.com)\/forms\/(?:u\/\d+\/)?d\/e\/([a-zA-Z0-9_-]+)/i,
    /(?:forms\.google\.com)\/(?:u\/\d+\/)?forms\/d\/e\/([a-zA-Z0-9_-]+)/i,
  ];
  for (const pattern of publishedFormPatterns) {
    const match = haystack.match(pattern);
    if (match?.[1] && isValidGoogleResourceId(match[1])) {
      const resourceId = match[1];
      const sourceUrl = urlObj ? urlObj.toString() : trimmed;
      return {
        resourceType: 'google_forms',
        resourceId,
        sourceUrl,
        normalizedUrl: canonicalizeGoogleUrl(
          urlObj || new URL(`https://docs.google.com/forms/d/e/${resourceId}/viewform`),
          'google_forms',
          resourceId,
          true,
        ),
        isPublishedForm: true,
      };
    }
  }

  const editFormPatterns = [
    /(?:docs\.google\.com)\/forms\/(?:u\/\d+\/)?d\/(?!e\/)([a-zA-Z0-9_-]+)/i,
    /(?:forms\.google\.com)\/(?:u\/\d+\/)?forms\/d\/(?!e\/)([a-zA-Z0-9_-]+)/i,
  ];
  for (const pattern of editFormPatterns) {
    const match = haystack.match(pattern);
    if (match?.[1] && isValidGoogleResourceId(match[1])) {
      const resourceId = match[1];
      const sourceUrl = urlObj ? urlObj.toString() : trimmed;
      return {
        resourceType: 'google_forms',
        resourceId,
        sourceUrl,
        normalizedUrl: canonicalizeGoogleUrl(
          urlObj || new URL(`https://docs.google.com/forms/d/${resourceId}`),
          'google_forms',
          resourceId,
          false,
        ),
        isPublishedForm: false,
      };
    }
  }

  // --- Drive file / open links (resolve type later) ---
  if (host.includes('drive.google.com') || /drive\.google\.com/i.test(haystack)) {
    const fileMatch =
      haystack.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i) ||
      haystack.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
    if (fileMatch?.[1] && isValidGoogleResourceId(fileMatch[1])) {
      const resourceId = fileMatch[1];
      const sourceUrl = urlObj ? urlObj.toString() : trimmed;
      return {
        resourceType: 'google_drive',
        resourceId,
        sourceUrl,
        normalizedUrl: `https://drive.google.com/file/d/${resourceId}`,
        needsTypeResolution: true,
      };
    }
  }

  // --- Docs/Forms open?id= on docs host ---
  if (urlObj) {
    const idParam = urlObj.searchParams.get('id');
    if (idParam && isValidGoogleResourceId(idParam)) {
      if (/\/document/i.test(urlObj.pathname) || host.includes('docs.google.com')) {
        // Ambiguous: could be docs — only treat as docs if path says document
        if (/\/document/i.test(urlObj.pathname)) {
          return {
            resourceType: 'google_docs',
            resourceId: idParam,
            sourceUrl: urlObj.toString(),
            normalizedUrl: canonicalizeGoogleUrl(urlObj, 'google_docs', idParam),
          };
        }
      }
    }
  }

  return null;
}

/**
 * Normalize a URL string for duplicate detection (resource identity).
 */
export function normalizeGoogleResourceKey(rawInput: string): string | null {
  const parsed = parseGoogleResourceUrl(rawInput);
  if (!parsed) return null;
  return `${parsed.resourceType}:${parsed.resourceId}`;
}

export function getGoogleResourceErrorMessage(code: string): string {
  // Prefer shared catalog; keep legacy codes working.
  const mapped = getGoogleExtractionUserMessage(code);
  if (mapped) return mapped;

  switch (code as GoogleExtractionErrorCode | string) {
    case 'INVALID_URL':
    case 'INVALID_GOOGLE_URL':
      return 'Invalid Google link. Paste a valid Google Docs or Google Forms URL.';
    case 'INVALID_DOCS_URL':
      return 'Invalid Google Docs link. Example: https://docs.google.com/document/d/DOCUMENT_ID/edit';
    case 'INVALID_FORMS_URL':
      return 'Invalid Google Forms link. Example: https://docs.google.com/forms/d/FORM_ID/viewform';
    case 'AUTH_REQUIRED':
    case 'GOOGLE_AUTH_REQUIRED':
      return getGoogleExtractionUserMessage('GOOGLE_AUTH_REQUIRED');
    case 'DOCUMENT_NOT_FOUND':
    case 'GOOGLE_RESOURCE_NOT_FOUND':
      return getGoogleExtractionUserMessage('GOOGLE_RESOURCE_NOT_FOUND');
    case 'UNSUPPORTED_TYPE':
    case 'GOOGLE_RESOURCE_TYPE_UNSUPPORTED':
      return getGoogleExtractionUserMessage('GOOGLE_RESOURCE_TYPE_UNSUPPORTED');
    case 'PERMISSION_DENIED':
    case 'GOOGLE_PERMISSION_DENIED':
      return getGoogleExtractionUserMessage('GOOGLE_PERMISSION_DENIED');
    case 'QUOTA_EXCEEDED':
    case 'GOOGLE_QUOTA_ERROR':
      return getGoogleExtractionUserMessage('GOOGLE_QUOTA_ERROR');
    case 'NO_QUESTIONS':
    case 'GOOGLE_EMPTY_RESOURCE':
      return getGoogleExtractionUserMessage('GOOGLE_EMPTY_RESOURCE');
    default:
      return getGoogleExtractionUserMessage('GOOGLE_EXTRACTION_FAILED');
  }
}

export { cleanQuery };
