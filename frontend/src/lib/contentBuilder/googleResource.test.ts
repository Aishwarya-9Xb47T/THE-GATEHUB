import { describe, it, expect } from 'vitest';
import {
  parseGoogleDocsUrl,
  parseGoogleFormsUrl,
  parseGoogleResourceUrl,
  mapGoogleImportError,
  isGoogleAuthRequiredError,
} from './googleResource';

const DOC_ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
const FORM_ID = '1FAIpQLSfabcdefghijklmnopqrstuvwxyz012345';

describe('frontend googleResource', () => {
  it('accepts Docs URL variants', () => {
    expect(parseGoogleDocsUrl(`https://docs.google.com/document/d/${DOC_ID}/edit`).valid).toBe(true);
    expect(parseGoogleDocsUrl(`https://docs.google.com/document/d/${DOC_ID}/edit?usp=sharing`).docId).toBe(DOC_ID);
    expect(parseGoogleDocsUrl(`https://docs.google.com/document/d/${DOC_ID}/view`).valid).toBe(true);
    expect(parseGoogleDocsUrl(`https://docs.google.com/document/d/${DOC_ID}`).valid).toBe(true);
  });

  it('accepts Forms URL variants', () => {
    expect(parseGoogleFormsUrl(`https://docs.google.com/forms/d/${FORM_ID}/edit`).valid).toBe(true);
    expect(parseGoogleFormsUrl(`https://docs.google.com/forms/d/${FORM_ID}/viewform`).formId).toBe(FORM_ID);
    expect(parseGoogleFormsUrl(`https://docs.google.com/forms/d/${FORM_ID}/viewform?usp=sharing`).valid).toBe(true);
  });

  it('detects published forms', () => {
    const parsed = parseGoogleResourceUrl(
      `https://docs.google.com/forms/d/e/${FORM_ID}/viewform?usp=sharing`,
    );
    expect(parsed?.isPublishedForm).toBe(true);
  });

  it('maps actionable errors', () => {
    expect(mapGoogleImportError('x', 'GOOGLE_PERMISSION_DENIED')).toMatch(/doesn't have access/i);
    expect(mapGoogleImportError('x', 'GOOGLE_QUOTA_ERROR')).toMatch(/quota/i);
    expect(isGoogleAuthRequiredError('AUTH_REQUIRED')).toBe(true);
    expect(isGoogleAuthRequiredError('nope', 'GOOGLE_PERMISSION_DENIED')).toBe(false);
  });
});
