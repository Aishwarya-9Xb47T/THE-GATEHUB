/**
 * Structured Google extraction errors, classification, and bounded retries.
 * Credentials/tokens must never appear in logged payloads.
 */

export type GoogleExtractionErrorCode =
  | 'INVALID_GOOGLE_URL'
  | 'GOOGLE_AUTH_REQUIRED'
  | 'GOOGLE_AUTH_EXPIRED'
  | 'GOOGLE_PERMISSION_DENIED'
  | 'GOOGLE_RESOURCE_NOT_FOUND'
  | 'GOOGLE_RESOURCE_TYPE_UNSUPPORTED'
  | 'GOOGLE_API_ERROR'
  | 'GOOGLE_QUOTA_ERROR'
  | 'GOOGLE_EMPTY_RESOURCE'
  | 'GOOGLE_EXTRACTION_FAILED'
  // Legacy aliases still emitted for older clients during transition
  | 'INVALID_URL'
  | 'AUTH_REQUIRED'
  | 'DOCUMENT_NOT_FOUND'
  | 'NO_QUESTIONS'
  | 'UNSUPPORTED_TYPE'
  | 'PERMISSION_DENIED'
  | 'QUOTA_EXCEEDED'
  | 'SERVER_ERROR'
  | 'VALIDATION_FAILED';

export class GoogleIngestionError extends Error {
  readonly code: GoogleExtractionErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: GoogleExtractionErrorCode,
    message: string,
    httpStatus = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'GoogleIngestionError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

const USER_MESSAGES: Record<string, string> = {
  INVALID_GOOGLE_URL: 'Invalid Google link. Paste a valid Google Docs or Google Forms URL.',
  INVALID_URL: 'Invalid Google link. Paste a valid Google Docs or Google Forms URL.',
  INVALID_DOCS_URL: 'Invalid Google Docs link. Example: https://docs.google.com/document/d/DOCUMENT_ID/edit',
  INVALID_FORMS_URL: 'Invalid Google Forms link. Example: https://docs.google.com/forms/d/FORM_ID/viewform',
  GOOGLE_AUTH_REQUIRED:
    "Google couldn't provide access to this document. Please make sure you have permission to view it and that the correct Google account is connected.",
  AUTH_REQUIRED:
    "Google couldn't provide access to this document. Please make sure you have permission to view it and that the correct Google account is connected.",
  GOOGLE_AUTH_EXPIRED:
    'Your Google connection has expired. Sign in with Google again, then retry the import.',
  GOOGLE_PERMISSION_DENIED:
    "Google Form or Doc found, but this account doesn't have access to it. Open it with the connected Google account and try again.",
  PERMISSION_DENIED:
    "Google Form or Doc found, but this account doesn't have access to it. Open it with the connected Google account and try again.",
  GOOGLE_RESOURCE_NOT_FOUND:
    'Google resource not found. Check the link, or confirm the file was not deleted.',
  DOCUMENT_NOT_FOUND:
    'Google resource not found. Check the link, or confirm the file was not deleted.',
  GOOGLE_RESOURCE_TYPE_UNSUPPORTED:
    'Unsupported Google resource. Only Google Docs and Google Forms are supported for Quiz Builder import.',
  UNSUPPORTED_TYPE:
    'Unsupported Google resource. Only Google Docs and Google Forms are supported for Quiz Builder import.',
  GOOGLE_QUOTA_ERROR: 'Google API quota exceeded. Wait a moment and try again.',
  QUOTA_EXCEEDED: 'Google API quota exceeded. Wait a moment and try again.',
  GOOGLE_EMPTY_RESOURCE:
    'The Google resource was reachable, but no quiz-usable content was found.',
  NO_QUESTIONS: 'No questions were found in this Google resource.',
  GOOGLE_API_ERROR: 'Google API returned an error while reading this resource. Please try again.',
  GOOGLE_EXTRACTION_FAILED: 'Google import failed while extracting content. Please try again.',
  SERVER_ERROR: 'Google import failed. Please try again.',
  VALIDATION_FAILED: 'Questions were detected but none passed validation.',
};

export function getGoogleExtractionUserMessage(code: string): string {
  return USER_MESSAGES[code] || USER_MESSAGES.GOOGLE_EXTRACTION_FAILED;
}

/** Prefer educator-facing message; never expose stack traces. */
export function toGoogleApiResponse(err: unknown): {
  success: false;
  error: GoogleExtractionErrorCode;
  message: string;
  httpStatus: number;
} {
  if (err instanceof GoogleIngestionError) {
    return {
      success: false,
      error: err.code,
      message: err.message || getGoogleExtractionUserMessage(err.code),
      httpStatus: err.httpStatus,
    };
  }

  const classified = classifyGoogleApiFailure(err);
  return {
    success: false,
    error: classified.code,
    message: getGoogleExtractionUserMessage(classified.code),
    httpStatus: classified.httpStatus,
  };
}

export function classifyGoogleApiFailure(err: unknown): {
  code: GoogleExtractionErrorCode;
  httpStatus: number;
} {
  const anyErr = err as {
    code?: number | string;
    status?: number;
    response?: { status?: number; data?: { error?: { status?: string; message?: string; code?: number } } };
    message?: string;
  };

  const status =
    Number(anyErr?.response?.status) ||
    Number(anyErr?.status) ||
    Number(anyErr?.code) ||
    0;

  const apiStatus = String(anyErr?.response?.data?.error?.status || '').toUpperCase();
  const msg = String(anyErr?.message || anyErr?.response?.data?.error?.message || '').toLowerCase();

  if (status === 401 || apiStatus === 'UNAUTHENTICATED' || msg.includes('invalid_grant') || msg.includes('token')) {
    if (msg.includes('expired') || msg.includes('invalid_grant')) {
      return { code: 'GOOGLE_AUTH_EXPIRED', httpStatus: 401 };
    }
    return { code: 'GOOGLE_AUTH_REQUIRED', httpStatus: 401 };
  }

  if (status === 403 || apiStatus === 'PERMISSION_DENIED' || msg.includes('permission') || msg.includes('forbidden')) {
    if (msg.includes('quota') || msg.includes('rate limit') || apiStatus === 'RESOURCE_EXHAUSTED') {
      return { code: 'GOOGLE_QUOTA_ERROR', httpStatus: 429 };
    }
    return { code: 'GOOGLE_PERMISSION_DENIED', httpStatus: 403 };
  }

  if (status === 404 || apiStatus === 'NOT_FOUND' || msg.includes('not found') || msg.includes('404')) {
    return { code: 'GOOGLE_RESOURCE_NOT_FOUND', httpStatus: 404 };
  }

  if (status === 429 || apiStatus === 'RESOURCE_EXHAUSTED' || msg.includes('quota') || msg.includes('rate limit')) {
    return { code: 'GOOGLE_QUOTA_ERROR', httpStatus: 429 };
  }

  if (status >= 500 || apiStatus === 'UNAVAILABLE' || apiStatus === 'INTERNAL') {
    return { code: 'GOOGLE_API_ERROR', httpStatus: 502 };
  }

  return { code: 'GOOGLE_EXTRACTION_FAILED', httpStatus: 500 };
}

export function isRetryableGoogleFailure(err: unknown): boolean {
  const { code, httpStatus } = classifyGoogleApiFailure(err);
  if (code === 'GOOGLE_QUOTA_ERROR' || code === 'GOOGLE_API_ERROR') return true;
  return httpStatus === 429 || httpStatus >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bounded exponential backoff. Never infinite.
 */
export async function withBoundedRetry<T>(
  label: string,
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 3, 4));
  const baseDelayMs = options.baseDelayMs ?? 400;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable = isRetryableGoogleFailure(err);
      if (!retryable || attempt >= maxAttempts) break;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.warn('[GoogleExtraction] retry', {
        label,
        attempt,
        maxAttempts,
        delayMs: delay,
        code: classifyGoogleApiFailure(err).code,
      });
      await sleep(delay);
    }
  }

  throw lastError;
}

export function sanitizeUrlForLog(url: string): string {
  try {
    const u = new URL(url);
    // Drop tokens/query secrets; keep path for resource identity.
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return url.replace(/([?&#](token|access_token|refresh_token|key)=)[^&#]*/gi, '$1***');
  }
}

export function logGoogleExtractionEvent(
  event: string,
  payload: Record<string, unknown>,
): void {
  const safe: Record<string, unknown> = { event, ...payload };
  for (const key of Object.keys(safe)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('token') ||
      lower.includes('secret') ||
      lower.includes('authorization') ||
      lower.includes('credential')
    ) {
      safe[key] = '[redacted]';
    }
    if (typeof safe[key] === 'string' && /https?:\/\//i.test(safe[key] as string)) {
      safe[key] = sanitizeUrlForLog(safe[key] as string);
    }
  }
  console.log('[GoogleExtraction]', JSON.stringify(safe));
}
