/**
 * Authoritative Google Workspace ingestion orchestrator.
 * Enforces extraction priority: Forms API > public HTML fallback; OAuth DOCX > public DOCX.
 *
 * DO NOT invent content. Preserve structure from Google APIs / export.
 */

import type { GoogleOAuthTokens } from './googleOAuth.js';
import { parseGoogleResourceUrl, type ParsedGoogleResource } from './GoogleResourceParser.js';
import { getValidAccessToken } from './googleOAuth.js';
import { getFileMetadata, exportDocsToBuffer, GOOGLE_MIME_TYPES } from './googleDriveAPI.js';
import { getFormsContent } from './googleFormsAPI.js';
import {
  ingestGoogleFormsApiResponse,
  ingestPublicGoogleFormHtml,
} from './googleFormsIngestion.js';
import { persistGoogleMediaBatch } from './googleMediaService.js';
import { auditExtractionFidelity, countFormsApiSource } from './extractionFidelityAudit.js';
import type { ExtractedQuestionDraft } from '../assessmentStudio/import/unifiedTypes.js';
import { prisma } from '../../utils/prisma.js';
import {
  GoogleIngestionError,
  classifyGoogleApiFailure,
  getGoogleExtractionUserMessage,
  logGoogleExtractionEvent,
  withBoundedRetry,
} from './googleExtractionErrors.js';

export interface GoogleIngestionContext {
  userId: string;
  parsed: ParsedGoogleResource;
  fileName?: string;
  startTime: number;
}

export interface GoogleIngestionFormsResult {
  kind: 'forms';
  drafts: ExtractedQuestionDraft[];
  extractionMethod: 'forms_api' | 'public_html_fallback';
  authenticationMethod: 'oauth' | 'public';
  formTitle?: string;
  fidelity: ReturnType<typeof auditExtractionFidelity>;
}

export interface GoogleIngestionDocsResult {
  kind: 'docs';
  docxBuffer: Buffer;
  fileName: string;
  extractionMethod: 'oauth_docx_export' | 'public_docx_export';
  authenticationMethod: 'oauth' | 'public';
  documentTitle?: string;
}

export type GoogleIngestionResult = GoogleIngestionFormsResult | GoogleIngestionDocsResult;

async function loadUserTokens(userId: string): Promise<GoogleOAuthTokens | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      googleAccessToken: true,
      googleRefreshToken: true,
      googleTokenExpiry: true,
    },
  });
  if (!user?.googleAccessToken || !user.googleRefreshToken) return null;

  const tokens = {
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
    expiry_date: user.googleTokenExpiry?.getTime() || 0,
  };

  try {
    const valid = await getValidAccessToken(tokens);
    if (valid.access_token !== tokens.access_token) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          googleAccessToken: valid.access_token,
          googleTokenExpiry: new Date(valid.expiry_date),
        },
      });
    }
    return valid;
  } catch (err) {
    const classified = classifyGoogleApiFailure(err);
    logGoogleExtractionEvent('oauth_refresh_failed', {
      code: classified.code,
      userId,
    });
    if (classified.code === 'GOOGLE_AUTH_EXPIRED') {
      throw new GoogleIngestionError(
        'GOOGLE_AUTH_EXPIRED',
        getGoogleExtractionUserMessage('GOOGLE_AUTH_EXPIRED'),
        401,
      );
    }
    return null;
  }
}

async function applyPersistedFormMedia(
  drafts: ExtractedQuestionDraft[],
  tokens?: GoogleOAuthTokens,
): Promise<void> {
  const remoteUrls = drafts
    .map((q) => (q.metadata as any)?.mediaUrl as string | undefined)
    .filter(Boolean) as string[];

  const persisted = await persistGoogleMediaBatch(remoteUrls, tokens);

  for (const q of drafts) {
    const meta = q.metadata as Record<string, unknown>;
    const remote = String(meta.mediaUrl || '');
    const local = persisted.get(remote);
    if (!local) continue;

    meta.mediaUrl = local;
    meta.media = { url: local, kind: 'image' };
    meta.images = [{ id: `gimg-${q.id}`, url: local, dataUrl: local, caption: 'Question Image' }];
    meta.mediaPersisted = true;
  }
}

/**
 * Resolve Drive file links (or ambiguous IDs) into Docs/Forms resource identity.
 */
export async function resolveGoogleDriveResource(
  ctx: GoogleIngestionContext,
): Promise<ParsedGoogleResource> {
  const { parsed } = ctx;
  if (!parsed.needsTypeResolution && parsed.resourceType !== 'google_drive') {
    return parsed;
  }

  const tokens = await loadUserTokens(ctx.userId);

  if (tokens) {
    try {
      const metadata = await withBoundedRetry('drive.files.get', () =>
        getFileMetadata(tokens, parsed.resourceId),
      );

      if (metadata.mimeType === GOOGLE_MIME_TYPES.DOCS) {
        return {
          ...parsed,
          resourceType: 'google_docs',
          needsTypeResolution: false,
          normalizedUrl: `https://docs.google.com/document/d/${parsed.resourceId}`,
        };
      }
      if (metadata.mimeType === GOOGLE_MIME_TYPES.FORMS) {
        return {
          ...parsed,
          resourceType: 'google_forms',
          isPublishedForm: false,
          needsTypeResolution: false,
          normalizedUrl: `https://docs.google.com/forms/d/${parsed.resourceId}`,
        };
      }

      throw new GoogleIngestionError(
        'GOOGLE_RESOURCE_TYPE_UNSUPPORTED',
        getGoogleExtractionUserMessage('GOOGLE_RESOURCE_TYPE_UNSUPPORTED'),
        400,
        { mimeType: metadata.mimeType, resourceId: parsed.resourceId },
      );
    } catch (err) {
      if (err instanceof GoogleIngestionError) throw err;
      const classified = classifyGoogleApiFailure(err);
      throw new GoogleIngestionError(
        classified.code,
        getGoogleExtractionUserMessage(classified.code),
        classified.httpStatus,
        { resourceId: parsed.resourceId },
      );
    }
  }

  // Zero-OAuth probe for public Drive file IDs
  try {
    const fetchModule = await import('node-fetch');
    const fetchFn = fetchModule.default || (fetchModule as any);

    const docRes = await fetchFn(
      `https://docs.google.com/document/d/${parsed.resourceId}/export?format=docx`,
      { redirect: 'follow' },
    );
    if (docRes.ok) {
      const buf = Buffer.from(await docRes.arrayBuffer());
      if (buf.length > 500 && buf.slice(0, 4).toString('hex') === '504b0304') {
        return {
          ...parsed,
          resourceType: 'google_docs',
          needsTypeResolution: false,
          normalizedUrl: `https://docs.google.com/document/d/${parsed.resourceId}`,
        };
      }
    }

    for (const formUrl of [
      `https://docs.google.com/forms/d/${parsed.resourceId}/viewform`,
      `https://docs.google.com/forms/d/e/${parsed.resourceId}/viewform`,
    ]) {
      const formRes = await fetchFn(formUrl, { redirect: 'follow' });
      if (!formRes.ok) continue;
      const html = await formRes.text();
      if (html.includes('FB_PUBLIC_LOAD_DATA_')) {
        return {
          ...parsed,
          resourceType: 'google_forms',
          isPublishedForm: formUrl.includes('/d/e/'),
          needsTypeResolution: false,
          normalizedUrl: formUrl.replace(/\/viewform.*/, ''),
        };
      }
    }
  } catch (err) {
    logGoogleExtractionEvent('drive_public_probe_failed', {
      resourceId: parsed.resourceId,
      code: classifyGoogleApiFailure(err).code,
    });
  }

  throw new GoogleIngestionError(
    'GOOGLE_AUTH_REQUIRED',
    getGoogleExtractionUserMessage('GOOGLE_AUTH_REQUIRED'),
    401,
    { resourceId: parsed.resourceId },
  );
}

/**
 * Ingest Google Form with correct priority:
 * - Published /d/e/ URLs → public HTML only (ID is not a Drive form ID)
 * - Edit /d/{id} URLs + OAuth → Forms API (authoritative)
 * - Edit URLs without OAuth → public HTML attempt, then auth required
 */
export async function ingestGoogleForm(ctx: GoogleIngestionContext): Promise<GoogleIngestionFormsResult> {
  const { parsed } = ctx;
  const tokens = await loadUserTokens(ctx.userId);
  const ingestionCtx = {
    formId: parsed.resourceId,
    sourceUrl: parsed.sourceUrl,
  };

  logGoogleExtractionEvent('forms_extraction_started', {
    resourceId: parsed.resourceId,
    isPublishedForm: Boolean(parsed.isPublishedForm),
    authenticationState: tokens ? 'oauth' : 'none',
    sourceUrl: parsed.sourceUrl,
  });

  let lastApiError: unknown;

  // Published form links use a response-collector ID — Forms API requires Drive file ID
  if (!parsed.isPublishedForm && tokens) {
    try {
      const metadata = await withBoundedRetry('forms.drive.metadata', () =>
        getFileMetadata(tokens, parsed.resourceId),
      );

      if (metadata.mimeType !== GOOGLE_MIME_TYPES.FORMS) {
        throw new GoogleIngestionError(
          'GOOGLE_RESOURCE_TYPE_UNSUPPORTED',
          getGoogleExtractionUserMessage('GOOGLE_RESOURCE_TYPE_UNSUPPORTED'),
          400,
          { mimeType: metadata.mimeType },
        );
      }

      const formsContent = await withBoundedRetry('forms.forms.get', () =>
        getFormsContent(tokens, parsed.resourceId),
      );

      let drafts = ingestGoogleFormsApiResponse(formsContent, {
        ...ingestionCtx,
        formTitle: formsContent.info?.title,
        formDescription: formsContent.info?.description,
      }, 'forms_api');

      await applyPersistedFormMedia(drafts, tokens);

      const sourceCounts = countFormsApiSource(formsContent);
      const fidelity = auditExtractionFidelity({
        sourceType: 'google_forms',
        extractionMethod: 'forms_api',
        authenticationMethod: 'oauth',
        sourceCounts,
        questions: drafts,
      });

      logGoogleExtractionEvent('forms_extraction_completed', {
        resourceId: parsed.resourceId,
        extractionMethod: 'forms_api',
        questionCount: drafts.length,
        sectionCount: sourceCounts.sections ?? 0,
        durationMs: Date.now() - ctx.startTime,
      });

      if (drafts.length === 0) {
        throw new GoogleIngestionError(
          'GOOGLE_EMPTY_RESOURCE',
          getGoogleExtractionUserMessage('GOOGLE_EMPTY_RESOURCE'),
          400,
          { extractionMethod: 'forms_api' },
        );
      }

      return {
        kind: 'forms',
        drafts,
        extractionMethod: 'forms_api',
        authenticationMethod: 'oauth',
        formTitle: formsContent.info?.title,
        fidelity,
      };
    } catch (err) {
      if (err instanceof GoogleIngestionError) {
        // Empty / unsupported are final; auth/permission may still try public HTML for shared forms
        if (
          err.code === 'GOOGLE_EMPTY_RESOURCE' ||
          err.code === 'GOOGLE_RESOURCE_TYPE_UNSUPPORTED'
        ) {
          throw err;
        }
      }
      lastApiError = err;
      logGoogleExtractionEvent('forms_api_path_failed', {
        resourceId: parsed.resourceId,
        code: err instanceof GoogleIngestionError ? err.code : classifyGoogleApiFailure(err).code,
      });
    }
  }

  // Public HTML fallback (published forms, or API unavailable)
  const fetchModule = await import('node-fetch');
  const fetchFn = fetchModule.default || (fetchModule as any);
  const formUrls = parsed.isPublishedForm
    ? [
        `https://docs.google.com/forms/d/e/${parsed.resourceId}/viewform`,
        `https://docs.google.com/forms/d/${parsed.resourceId}/viewform`,
      ]
    : [
        `https://docs.google.com/forms/d/${parsed.resourceId}/viewform`,
        `https://docs.google.com/forms/d/e/${parsed.resourceId}/viewform`,
      ];

  for (const url of formUrls) {
    try {
      const res = await withBoundedRetry('forms.public_html', async () => {
        const response = await fetchFn(url, { redirect: 'follow' });
        if (response.status === 429 || response.status >= 500) {
          const err: any = new Error(`Public form fetch failed (${response.status})`);
          err.status = response.status;
          throw err;
        }
        return response;
      });

      if (!res.ok) continue;
      const html = await res.text();
      if (!html.includes('FB_PUBLIC_LOAD_DATA_')) continue;

      let drafts = ingestPublicGoogleFormHtml(html, ingestionCtx, 'public_html_fallback');
      await applyPersistedFormMedia(drafts, tokens ?? undefined);

      const fidelity = auditExtractionFidelity({
        sourceType: 'google_forms',
        extractionMethod: 'public_html_fallback',
        authenticationMethod: tokens ? 'oauth' : 'public',
        sourceCounts: { questions: drafts.length },
        questions: drafts,
      });

      logGoogleExtractionEvent('forms_extraction_completed', {
        resourceId: parsed.resourceId,
        extractionMethod: 'public_html_fallback',
        questionCount: drafts.length,
        durationMs: Date.now() - ctx.startTime,
      });

      if (drafts.length === 0) {
        throw new GoogleIngestionError(
          'GOOGLE_EMPTY_RESOURCE',
          getGoogleExtractionUserMessage('GOOGLE_EMPTY_RESOURCE'),
          400,
          { extractionMethod: 'public_html_fallback' },
        );
      }

      return {
        kind: 'forms',
        drafts,
        extractionMethod: 'public_html_fallback',
        authenticationMethod: tokens ? 'oauth' : 'public',
        formTitle: (drafts[0]?.metadata as any)?.formTitle,
        fidelity,
      };
    } catch (err) {
      if (err instanceof GoogleIngestionError && err.code === 'GOOGLE_EMPTY_RESOURCE') {
        throw err;
      }
      logGoogleExtractionEvent('forms_public_html_failed', {
        resourceId: parsed.resourceId,
        sourceUrl: url,
      });
    }
  }

  if (!tokens) {
    throw new GoogleIngestionError(
      'GOOGLE_AUTH_REQUIRED',
      parsed.isPublishedForm
        ? 'This published Google Form could not be read. Ensure it is shared publicly or sign in with Google.'
        : getGoogleExtractionUserMessage('GOOGLE_AUTH_REQUIRED'),
      401,
    );
  }

  if (lastApiError) {
    const classified = classifyGoogleApiFailure(lastApiError);
    throw new GoogleIngestionError(
      classified.code,
      getGoogleExtractionUserMessage(classified.code),
      classified.httpStatus,
    );
  }

  throw new GoogleIngestionError(
    'GOOGLE_EXTRACTION_FAILED',
    getGoogleExtractionUserMessage('GOOGLE_EXTRACTION_FAILED'),
    500,
  );
}

/**
 * Ingest Google Doc: OAuth DOCX export preferred, then public export.
 * Full DOCX buffer is preserved for Document Intelligence — no arbitrary truncation.
 */
export async function ingestGoogleDoc(ctx: GoogleIngestionContext): Promise<GoogleIngestionDocsResult> {
  const { parsed, fileName } = ctx;
  const tokens = await loadUserTokens(ctx.userId);
  let lastOAuthError: unknown;

  logGoogleExtractionEvent('docs_extraction_started', {
    resourceId: parsed.resourceId,
    authenticationState: tokens ? 'oauth' : 'none',
    sourceUrl: parsed.sourceUrl,
  });

  if (tokens) {
    try {
      const metadata = await withBoundedRetry('docs.drive.metadata', () =>
        getFileMetadata(tokens, parsed.resourceId),
      );

      if (metadata.mimeType !== GOOGLE_MIME_TYPES.DOCS) {
        throw new GoogleIngestionError(
          'GOOGLE_RESOURCE_TYPE_UNSUPPORTED',
          getGoogleExtractionUserMessage('GOOGLE_RESOURCE_TYPE_UNSUPPORTED'),
          400,
          { mimeType: metadata.mimeType },
        );
      }

      const docxBuffer = await withBoundedRetry('docs.export.docx', () =>
        exportDocsToBuffer(tokens, parsed.resourceId),
      );

      if (!docxBuffer?.length) {
        throw new GoogleIngestionError(
          'GOOGLE_EMPTY_RESOURCE',
          getGoogleExtractionUserMessage('GOOGLE_EMPTY_RESOURCE'),
          400,
        );
      }

      const name = (fileName || metadata.name).endsWith('.docx')
        ? (fileName || metadata.name)
        : `${fileName || metadata.name}.docx`;

      logGoogleExtractionEvent('docs_extraction_completed', {
        resourceId: parsed.resourceId,
        extractionMethod: 'oauth_docx_export',
        bytes: docxBuffer.length,
        durationMs: Date.now() - ctx.startTime,
        title: metadata.name,
      });

      return {
        kind: 'docs',
        docxBuffer,
        fileName: name,
        extractionMethod: 'oauth_docx_export',
        authenticationMethod: 'oauth',
        documentTitle: metadata.name,
      };
    } catch (err) {
      if (err instanceof GoogleIngestionError) {
        if (
          err.code === 'GOOGLE_RESOURCE_TYPE_UNSUPPORTED' ||
          err.code === 'GOOGLE_EMPTY_RESOURCE'
        ) {
          throw err;
        }
      }
      lastOAuthError = err;
      logGoogleExtractionEvent('docs_oauth_export_failed', {
        resourceId: parsed.resourceId,
        code: err instanceof GoogleIngestionError ? err.code : classifyGoogleApiFailure(err).code,
      });
    }
  }

  try {
    const fetchModule = await import('node-fetch');
    const fetchFn = fetchModule.default || (fetchModule as any);
    const publicRes = await withBoundedRetry('docs.public_docx', async () => {
      const response = await fetchFn(
        `https://docs.google.com/document/d/${parsed.resourceId}/export?format=docx`,
        { redirect: 'follow' },
      );
      if (response.status === 429 || response.status >= 500) {
        const err: any = new Error(`Public DOCX export failed (${response.status})`);
        err.status = response.status;
        throw err;
      }
      return response;
    });

    if (publicRes.ok) {
      const publicBuffer = Buffer.from(await publicRes.arrayBuffer());
      if (publicBuffer.length > 500 && publicBuffer.slice(0, 4).toString('hex') === '504b0304') {
        const docxFileName = (fileName || 'Google Document').endsWith('.docx')
          ? (fileName || 'Google Document')
          : `${fileName || 'Google Document'}.docx`;

        logGoogleExtractionEvent('docs_extraction_completed', {
          resourceId: parsed.resourceId,
          extractionMethod: 'public_docx_export',
          bytes: publicBuffer.length,
          durationMs: Date.now() - ctx.startTime,
        });

        return {
          kind: 'docs',
          docxBuffer: publicBuffer,
          fileName: docxFileName,
          extractionMethod: 'public_docx_export',
          authenticationMethod: 'public',
          documentTitle: fileName || 'Google Document',
        };
      }
    }
  } catch (err) {
    logGoogleExtractionEvent('docs_public_export_failed', {
      resourceId: parsed.resourceId,
      code: classifyGoogleApiFailure(err).code,
    });
  }

  if (!tokens) {
    throw new GoogleIngestionError(
      'GOOGLE_AUTH_REQUIRED',
      getGoogleExtractionUserMessage('GOOGLE_AUTH_REQUIRED'),
      401,
    );
  }

  if (lastOAuthError) {
    const classified = classifyGoogleApiFailure(lastOAuthError);
    throw new GoogleIngestionError(
      classified.code,
      getGoogleExtractionUserMessage(classified.code),
      classified.httpStatus,
    );
  }

  throw new GoogleIngestionError(
    'GOOGLE_RESOURCE_NOT_FOUND',
    getGoogleExtractionUserMessage('GOOGLE_RESOURCE_NOT_FOUND'),
    404,
  );
}

export async function resolveGoogleTokens(userId: string): Promise<GoogleOAuthTokens | null> {
  return loadUserTokens(userId);
}

export { parseGoogleResourceUrl, type ParsedGoogleResource };
