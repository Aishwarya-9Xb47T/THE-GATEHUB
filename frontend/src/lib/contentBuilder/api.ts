/**
 * Content Builder — Frontend API Layer
 */

import { api, apiFormData } from '@/lib/api';
import type {
  ContentBuilderReviewPayload,
  ContentBuilderCommitResult,
  ReviewQuestion,
} from './types';

const BASE = '/content-builder';

/** Upload a file for content analysis */
export async function analyzeFile(
  file: File,
  onProgress?: (step: number) => void
): Promise<{ data?: { data: ContentBuilderReviewPayload }; error?: string }> {
  console.log('[analyzeFile API] ENTRY', { fileName: file.name, fileSize: file.size, fileType: file.type });
  try {
    const formData = new FormData();
    formData.append('source', 'file');
    formData.append('file', file);
    console.log('[analyzeFile API] FormData prepared', { source: 'file', hasFile: !!file });

    // Simulate step progress while request is in flight
    let step = 0;
    const interval = setInterval(() => {
      if (step < 5) onProgress?.(step++);
    }, 1800);

    console.log('[analyzeFile API] Sending POST request to', `${BASE}/analyze`);
    const res = await apiFormData<{ success: boolean; data: ContentBuilderReviewPayload }>(
      `${BASE}/analyze`,
      formData
    );
    console.log('[analyzeFile API] Response received', { 
      hasData: !!res.data, 
      success: res.data?.success,
      error: res.error
    });
    clearInterval(interval);
    onProgress?.(5);

    if (res.error) {
      console.log('[analyzeFile API] EXIT - error from API', { error: res.error });
      return { error: res.error };
    }

    console.log('[analyzeFile API] EXIT - success', { dataKeys: Object.keys(res.data || {}) });
    return { data: res.data };
  } catch (err: any) {
    console.log('[analyzeFile API] EXIT - error', { error: err });
    const msg = err instanceof Error ? err.message : 'Analysis failed';
    return { error: msg };
  }
}

/** Analyze content from a URL (website or YouTube) */
export async function analyzeUrl(
  url: string,
  onProgress?: (step: number) => void
): Promise<{ data?: { data: ContentBuilderReviewPayload }; error?: string }> {
  try {
    const formData = new FormData();
    formData.append('source', 'url');
    formData.append('url', url);

    let step = 0;
    const interval = setInterval(() => {
      if (step < 5) onProgress?.(step++);
    }, 1800);

    const res = await apiFormData<{ success: boolean; data: ContentBuilderReviewPayload }>(
      `${BASE}/analyze`,
      formData
    );
    clearInterval(interval);
    onProgress?.(5);

    if (res.error) {
      return { error: res.error };
    }

    return { data: res.data };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : 'Analysis failed';
    return { error: msg };
  }
}

/** Analyze pasted text */
export async function analyzePaste(
  text: string,
  onProgress?: (step: number) => void
): Promise<{ data?: { data: ContentBuilderReviewPayload }; error?: string }> {
  try {
    const formData = new FormData();
    formData.append('source', 'paste');
    formData.append('text', text);

    let step = 0;
    const interval = setInterval(() => {
      if (step < 5) onProgress?.(step++);
    }, 1800);

    const res = await apiFormData<{ success: boolean; data: ContentBuilderReviewPayload }>(
      `${BASE}/analyze`,
      formData
    );
    clearInterval(interval);
    onProgress?.(5);

    if (res.error) {
      return { error: res.error };
    }

    return { data: res.data };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : 'Analysis failed';
    return { error: msg };
  }
}

/** Analyze from Google Docs or Google Forms */
export async function analyzeGoogle(
  source: 'google_docs' | 'google_forms',
  url: string,
  googleAccessToken: string,
  onProgress?: (step: number) => void
): Promise<{ data?: { data: ContentBuilderReviewPayload }; error?: string }> {
  try {
    const formData = new FormData();
    formData.append('source', source);
    formData.append('url', url);
    formData.append('googleAccessToken', googleAccessToken);

    let step = 0;
    const interval = setInterval(() => {
      if (step < 5) onProgress?.(step++);
    }, 1800);

    const res = await apiFormData<{ success: boolean; data: ContentBuilderReviewPayload }>(
      `${BASE}/analyze`,
      formData
    );
    clearInterval(interval);
    onProgress?.(5);

    if (res.error) {
      return { error: res.error };
    }

    return { data: res.data };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : 'Analysis failed';
    return { error: msg };
  }
}

/** Analyze Google Workspace content (Docs/Forms) */
export async function analyzeGoogleContent(
  fileId: string,
  fileName: string
): Promise<{ data?: ContentBuilderReviewPayload; error?: string; errorCode?: string }> {
  console.log('[analyzeGoogleContent API] ENTRY', { fileId, fileName });
  try {
    const res = await api<{
      success: boolean;
      data: ContentBuilderReviewPayload;
      error?: string;
      message?: string;
    }>(
      `${BASE}/analyze-google`,
      {
        method: 'POST',
        body: { fileId, fileName },
        skipLoginRedirect: true,
      }
    );
    console.log('[analyzeGoogleContent API] Response received', {
      hasData: !!res.data,
      hasPayloadData: !!res.data?.data,
      hasQuestions: !!res.data?.data?.questions,
      questionCount: res.data?.data?.questions?.length,
      error: res.error,
    });

    if (res.error) {
      const body = res.data as { error?: string; message?: string } | undefined;
      const errorCode = body?.error || res.error;
      const message = body?.message || res.error;
      console.log('[analyzeGoogleContent API] EXIT - error from API', { errorCode, message });
      return { error: message, errorCode };
    }

    const payload = res.data?.data || (res.data as any)?.review || (res.data as any);
    console.log('[analyzeGoogleContent API] EXIT - success', {
      jobId: payload?.jobId,
      questionCount: payload?.questions?.length
    });
    return { data: payload };
  } catch (err: any) {
    console.log('[analyzeGoogleContent API] EXIT - error', { error: err });
    const msg = err instanceof Error ? err.message : 'Failed to analyze Google content';
    return { error: msg };
  }
}

/** Persist instructor edits from review workspace before commit */
export async function patchJobQuestions(
  jobId: string,
  questions: Array<{
    id: string;
    text?: string;
    options?: Array<{ id?: string; text: string; isCorrect?: boolean; order?: number }>;
    explanation?: string;
    correctAnswer?: string | string[];
  }>,
): Promise<{ data?: { questions: ReviewQuestion[] }; error?: string }> {
  try {
    const res = await api<{ success: boolean; data: { questions: ReviewQuestion[] } }>(
      `${BASE}/jobs/${jobId}/questions`,
      { method: 'PATCH', body: { questions } },
    );
    if (res.error) return { error: res.error };
    return { data: res.data?.data };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to save edits' };
  }
}

/** Merge multiple extraction payloads (multi-file upload) into one review payload */
export function mergeExtractionPayloads(
  payloads: ContentBuilderReviewPayload[],
): ContentBuilderReviewPayload | null {
  if (payloads.length === 0) return null;
  if (payloads.length === 1) return payloads[0]!;

  const base = payloads[payloads.length - 1]!;
  const mergedQuestions = payloads.flatMap((p, fileIdx) =>
    p.questions.map((q) => ({
      ...q,
      id: `${q.id}_f${fileIdx}`,
      metadata: { ...(q.metadata || {}), sourceFileIndex: fileIdx },
    })),
  );

  const stats = payloads.reduce(
    (acc, p) => ({
      ...acc,
      questionsFound: acc.questionsFound + (p.statistics?.questionsFound ?? p.questions.length),
      highConfidence: acc.highConfidence + (p.statistics?.highConfidence ?? 0),
      mediumConfidence: acc.mediumConfidence + (p.statistics?.mediumConfidence ?? 0),
      lowConfidence: acc.lowConfidence + (p.statistics?.lowConfidence ?? 0),
      imagesImported: acc.imagesImported + (p.statistics?.imagesImported ?? 0),
      tablesImported: acc.tablesImported + (p.statistics?.tablesImported ?? 0),
      pagesProcessed: acc.pagesProcessed + (p.statistics?.pagesProcessed ?? 0),
      processingTime: acc.processingTime + (p.statistics?.processingTime ?? 0),
    }),
    {
      sourceType: 'document_intelligence',
      processingTime: 0,
      questionsFound: 0,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0,
      imagesImported: 0,
      tablesImported: 0,
      pagesProcessed: 0,
    } as ContentBuilderReviewPayload['statistics'],
  );

  return {
    jobId: base.jobId,
    questions: mergedQuestions,
    statistics: stats,
    diagnostics: base.diagnostics,
  };
}

/** Commit reviewed questions to a new quiz or update existing quiz */
export async function commitQuestions(
  jobId: string,
  title: string,
  questionIds?: string[],
  description?: string,
  quizId?: string // existing quiz to update
): Promise<{ data?: { data: ContentBuilderCommitResult }; error?: string }> {
  console.log('[commitQuestions API] ENTRY', { jobId, title, questionIdsCount: questionIds?.length, quizId });
  try {
    const res = await api<{ success: boolean; data: ContentBuilderCommitResult }>(
      `${BASE}/jobs/${jobId}/commit`,
      {
        method: 'POST',
        body: { title, questionIds, description, quizId }
      }
    );
    console.log('[commitQuestions API] Response received', {
      hasData: !!res.data,
      success: res.data?.success,
      error: res.error
    });

    if (res.error) {
      console.log('[commitQuestions API] EXIT - error from API', { error: res.error });
      return { error: res.error };
    }

    console.log('[commitQuestions API] EXIT - success', { dataKeys: Object.keys(res.data || {}) });
    return { data: res.data };
  } catch (err: any) {
    console.log('[commitQuestions API] EXIT - error', { error: err });
    const msg = err instanceof Error ? err.message : 'Failed to create quiz';
    return { error: msg };
  }
}
