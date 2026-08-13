export type GoogleResourceType = 'google_docs' | 'google_forms' | 'google_drive';

export interface ParsedGoogleResourceClient {
  resourceType: GoogleResourceType;
  resourceId: string;
  isPublishedForm?: boolean;
  needsTypeResolution?: boolean;
}

const GOOGLE_ID_RE = /^[a-zA-Z0-9_-]{10,128}$/;

function stripWrapping(raw: string): string {
  let s = raw.trim();
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

/**
 * Aligns with backend GoogleResourceParser — extract + validate resource ID.
 */
export function parseGoogleResourceUrl(rawInput: string): ParsedGoogleResourceClient | null {
  const trimmed = stripWrapping(rawInput);
  if (!trimmed) return null;

  const urlObj = tryParseUrl(trimmed);
  const haystack = urlObj ? `${urlObj.hostname}${urlObj.pathname}${urlObj.search}` : trimmed;
  const host = (urlObj?.hostname || '').toLowerCase();

  const docMatch = haystack.match(/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/i);
  if (docMatch?.[1] && isValidGoogleResourceId(docMatch[1])) {
    return { resourceType: 'google_docs', resourceId: docMatch[1] };
  }

  const publishedForm =
    haystack.match(/docs\.google\.com\/forms\/(?:u\/\d+\/)?d\/e\/([a-zA-Z0-9_-]+)/i) ||
    haystack.match(/forms\.google\.com\/(?:u\/\d+\/)?forms\/d\/e\/([a-zA-Z0-9_-]+)/i);
  if (publishedForm?.[1] && isValidGoogleResourceId(publishedForm[1])) {
    return {
      resourceType: 'google_forms',
      resourceId: publishedForm[1],
      isPublishedForm: true,
    };
  }

  const editForm =
    haystack.match(/docs\.google\.com\/forms\/(?:u\/\d+\/)?d\/(?!e\/)([a-zA-Z0-9_-]+)/i) ||
    haystack.match(/forms\.google\.com\/(?:u\/\d+\/)?forms\/d\/(?!e\/)([a-zA-Z0-9_-]+)/i);
  if (editForm?.[1] && isValidGoogleResourceId(editForm[1])) {
    return {
      resourceType: 'google_forms',
      resourceId: editForm[1],
      isPublishedForm: false,
    };
  }

  if (host.includes('drive.google.com') || /drive\.google\.com/i.test(haystack)) {
    const fileMatch =
      haystack.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i) ||
      haystack.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
    if (fileMatch?.[1] && isValidGoogleResourceId(fileMatch[1])) {
      return {
        resourceType: 'google_drive',
        resourceId: fileMatch[1],
        needsTypeResolution: true,
      };
    }
  }

  return null;
}

export function parseGoogleDocsUrl(url: string): { valid: boolean; docId?: string; error?: string } {
  const trimmed = url.trim();
  if (!trimmed) return { valid: false, error: 'Please enter a Google Docs URL' };
  const parsed = parseGoogleResourceUrl(trimmed);
  if (parsed?.resourceType === 'google_docs') {
    return { valid: true, docId: parsed.resourceId };
  }
  if (parsed?.resourceType === 'google_drive') {
    // Drive file link may resolve to a Doc after auth — allow submit
    return { valid: true, docId: parsed.resourceId };
  }
  return {
    valid: false,
    error: 'Invalid Google Docs URL. Example: https://docs.google.com/document/d/DOCUMENT_ID/edit',
  };
}

export function parseGoogleFormsUrl(url: string): { valid: boolean; formId?: string; error?: string } {
  const trimmed = url.trim();
  if (!trimmed) return { valid: false, error: 'Please enter a Google Forms URL' };
  const parsed = parseGoogleResourceUrl(trimmed);
  if (parsed?.resourceType === 'google_forms') {
    return { valid: true, formId: parsed.resourceId };
  }
  if (parsed?.resourceType === 'google_drive') {
    return { valid: true, formId: parsed.resourceId };
  }
  return {
    valid: false,
    error: 'Invalid Google Forms URL. Example: https://docs.google.com/forms/d/FORM_ID/viewform',
  };
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_GOOGLE_URL: 'Invalid Google link. Paste a valid Google Docs or Google Forms URL.',
  INVALID_URL: 'Invalid Google link. Paste a valid Google Docs or Google Forms URL.',
  AUTH_REQUIRED:
    "Google couldn't provide access to this document. Please make sure you have permission to view it and that the correct Google account is connected.",
  GOOGLE_AUTH_REQUIRED:
    "Google couldn't provide access to this document. Please make sure you have permission to view it and that the correct Google account is connected.",
  GOOGLE_AUTH_EXPIRED:
    'Your Google connection has expired. Sign in with Google again, then retry the import.',
  GOOGLE_PERMISSION_DENIED:
    "Google Form or Doc found, but this account doesn't have access to it. Open it with the connected Google account and try again.",
  PERMISSION_DENIED:
    "Google Form or Doc found, but this account doesn't have access to it. Open it with the connected Google account and try again.",
  DOCUMENT_NOT_FOUND:
    'Google resource not found. Check the link, or confirm the file was not deleted.',
  GOOGLE_RESOURCE_NOT_FOUND:
    'Google resource not found. Check the link, or confirm the file was not deleted.',
  GOOGLE_RESOURCE_TYPE_UNSUPPORTED:
    'Unsupported Google resource. Only Google Docs and Google Forms are supported for Quiz Builder import.',
  UNSUPPORTED_TYPE:
    'Unsupported Google resource. Only Google Docs and Google Forms are supported for Quiz Builder import.',
  GOOGLE_QUOTA_ERROR: 'Google API quota exceeded. Wait a moment and try again.',
  QUOTA_EXCEEDED: 'Google API quota exceeded. Wait a moment and try again.',
  NO_QUESTIONS: 'The Google resource was reachable, but no quiz-usable content was found.',
  GOOGLE_EMPTY_RESOURCE:
    'The Google resource was reachable, but no quiz-usable content was found.',
  GOOGLE_API_ERROR: 'Google API returned an error while reading this resource. Please try again.',
  GOOGLE_EXTRACTION_FAILED: 'Google import failed while extracting content. Please try again.',
  SERVER_ERROR: 'Google import failed. Please try again.',
};

export function mapGoogleImportError(error: string, errorCode?: string): string {
  const code = (errorCode || '').toUpperCase();
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];

  const upper = error.toUpperCase();
  for (const key of Object.keys(ERROR_MESSAGES)) {
    if (upper.includes(key)) return ERROR_MESSAGES[key];
  }

  const e = error.toLowerCase();
  if (e.includes('auth_required') || e.includes('authenticated') || e.includes('private')) {
    return ERROR_MESSAGES.AUTH_REQUIRED;
  }
  if (e.includes('permission') || e.includes('403')) {
    return ERROR_MESSAGES.GOOGLE_PERMISSION_DENIED;
  }
  if (e.includes('not_found') || e.includes('not found') || e.includes('404')) {
    return ERROR_MESSAGES.DOCUMENT_NOT_FOUND;
  }
  if (e.includes('quota') || e.includes('rate limit') || e.includes('429')) {
    return ERROR_MESSAGES.GOOGLE_QUOTA_ERROR;
  }
  if (e.includes('invalid_url') || e.includes('invalid google')) {
    return ERROR_MESSAGES.INVALID_GOOGLE_URL;
  }
  if (e.includes('no_questions') || e.includes('empty')) {
    return ERROR_MESSAGES.NO_QUESTIONS;
  }
  if (e.includes('unsupported')) {
    return ERROR_MESSAGES.UNSUPPORTED_TYPE;
  }
  return error;
}

export function isGoogleAuthRequiredError(error: string, errorCode?: string): boolean {
  const code = (errorCode || error || '').toUpperCase();
  return (
    code.includes('AUTH_REQUIRED') ||
    code.includes('GOOGLE_AUTH_REQUIRED') ||
    code.includes('GOOGLE_AUTH_EXPIRED') ||
    code.includes('AUTH_EXPIRED')
  );
}
