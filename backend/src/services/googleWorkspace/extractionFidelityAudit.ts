/**
 * Source → normalized → quiz fidelity audit for Google Workspace imports.
 */

import type { ExtractedQuestionDraft } from '../assessmentStudio/import/unifiedTypes.js';

export interface FidelityAuditInput {
  sourceType: 'google_forms' | 'google_docs';
  extractionMethod: string;
  authenticationMethod: 'oauth' | 'public' | 'none';
  sourceCounts: {
    sections?: number;
    questions?: number;
    options?: number;
    images?: number;
    tables?: number;
  };
  questions: ExtractedQuestionDraft[];
}

export interface FidelityAuditResult {
  sourceType: string;
  extractionMethod: string;
  authenticationMethod: string;
  fetched: boolean;
  sourceCounts: FidelityAuditInput['sourceCounts'];
  normalizedCounts: {
    questions: number;
    options: number;
    images: number;
    tables: number;
    answers: number;
  };
  warnings: string[];
  errors: string[];
}

export function auditExtractionFidelity(input: FidelityAuditInput): FidelityAuditResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const normalizedQuestions = input.questions.length;
  const normalizedOptions = input.questions.reduce((n, q) => n + (q.options?.length || 0), 0);
  const normalizedImages = input.questions.filter((q) => {
    const m = q.metadata as Record<string, unknown> | undefined;
    return Boolean(m?.mediaUrl || m?.images || (m?.media as any)?.url);
  }).length;
  const normalizedTables = input.questions.filter((q) => {
    const m = q.metadata as Record<string, unknown> | undefined;
    return Boolean(m?.table || m?.tables);
  }).length;
  const normalizedAnswers = input.questions.filter((q) => {
    if ((q.options || []).some((o) => o.isCorrect)) return true;
    const ca = q.correctAnswer;
    if (typeof ca === 'string' && ca.trim()) return true;
    if (Array.isArray(ca) && ca.length > 0) return true;
    return false;
  }).length;

  if (input.sourceCounts.questions != null && input.sourceCounts.questions !== normalizedQuestions) {
    warnings.push(
      `Question count mismatch: source=${input.sourceCounts.questions}, normalized=${normalizedQuestions}`,
    );
  }

  if (input.sourceCounts.options != null && input.sourceCounts.options !== normalizedOptions) {
    warnings.push(
      `Option count mismatch: source=${input.sourceCounts.options}, normalized=${normalizedOptions}`,
    );
  }

  if (input.extractionMethod === 'public_html_fallback') {
    warnings.push('Public HTML fallback used — answer keys, points, and feedback may be incomplete');
  }

  for (const q of input.questions) {
    const meta = q.metadata as Record<string, unknown> | undefined;
    const remote = String(meta?.mediaUrl || '');
    if (remote.startsWith('http') && !String(meta?.images || '').includes('/uploads/')) {
      warnings.push(`Question "${q.text.slice(0, 40)}..." has unpersisted remote media`);
    }
  }

  if (normalizedQuestions === 0) {
    errors.push('No questions normalized from source');
  }

  return {
    sourceType: input.sourceType,
    extractionMethod: input.extractionMethod,
    authenticationMethod: input.authenticationMethod,
    fetched: normalizedQuestions > 0,
    sourceCounts: input.sourceCounts,
    normalizedCounts: {
      questions: normalizedQuestions,
      options: normalizedOptions,
      images: normalizedImages,
      tables: normalizedTables,
      answers: normalizedAnswers,
    },
    warnings,
    errors,
  };
}

export function countFormsApiSource(formsContent: any): FidelityAuditInput['sourceCounts'] {
  let questions = 0;
  let options = 0;
  let sections = 0;
  let images = 0;

  for (const item of formsContent?.items || []) {
    if (item.pageBreakItem) {
      sections++;
      continue;
    }
    if (item.imageItem) {
      images++;
      continue;
    }
    if (item.questionGroupItem) {
      questions++;
      const cols = item.questionGroupItem?.grid?.columns?.options?.length || 0;
      const rows = item.questionGroupItem?.questions?.length || 0;
      options += cols * rows;
      continue;
    }
    if (item.questionItem?.question) {
      questions++;
      const opts = item.questionItem.question.choiceQuestion?.options?.length || 0;
      options += opts;
      if (item.questionItem.question.scaleQuestion) {
        const s = item.questionItem.question.scaleQuestion;
        options += (s.high ?? 5) - (s.low ?? 1) + 1;
      }
    }
  }

  return { sections, questions, options, images, tables: 0 };
}
