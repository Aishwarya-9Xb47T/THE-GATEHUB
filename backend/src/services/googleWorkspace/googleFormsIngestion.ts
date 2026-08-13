/**
 * Premium Google Forms → ExtractedQuestionDraft ingestion.
 * Uses structured Forms API / public HTML data — never LLM reconstruction.
 */

import type { ExtractedQuestionDraft } from '../assessmentStudio/import/unifiedTypes.js';

export interface GoogleFormsIngestionContext {
  formId: string;
  sourceUrl: string;
  formTitle?: string;
  formDescription?: string;
}

interface DraftOption {
  id: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

function optionLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

function buildOptionsFromChoices(
  rawOptions: Array<{ value?: string; isCorrect?: boolean }>,
  correctValues: string[],
): { options: DraftOption[]; correctAnswer: string | string[] | undefined; warnings: string[] } {
  const warnings: string[] = [];
  const normalizedCorrect = correctValues.map((v) => v.trim()).filter(Boolean);
  const hasExplicitCorrect = rawOptions.some((o) => o.isCorrect) || normalizedCorrect.length > 0;

  const options: DraftOption[] = rawOptions.map((opt, idx) => {
    const text = (opt.value || '').trim() || `Option ${idx + 1}`;
    let isCorrect = false;
    if (opt.isCorrect) {
      isCorrect = true;
    } else if (normalizedCorrect.length > 0) {
      isCorrect = normalizedCorrect.some(
        (cv) => cv.toLowerCase() === text.toLowerCase() || cv.toUpperCase() === optionLabel(idx),
      );
    }
    return {
      id: `opt-${idx + 1}`,
      text,
      isCorrect,
      order: idx,
    };
  });

  let correctAnswer: string | string[] | undefined;
  if (options.filter((o) => o.isCorrect).length > 1) {
    correctAnswer = options.filter((o) => o.isCorrect).map((o) => o.text);
  } else {
    const single = options.find((o) => o.isCorrect);
    correctAnswer = single?.text;
  }

  if (!hasExplicitCorrect) {
    warnings.push('No answer key in source — set correct answer manually');
    options.forEach((o) => { o.isCorrect = false; });
    correctAnswer = undefined;
  }

  return { options, correctAnswer, warnings };
}

function extractCorrectValuesFromGrading(grading: any): string[] {
  const answers = grading?.correctAnswers?.answers;
  if (!Array.isArray(answers)) return [];
  return answers.map((a: any) => String(a?.value || '').trim()).filter(Boolean);
}

function detectTrueFalse(options: DraftOption[]): boolean {
  if (options.length !== 2) return false;
  const texts = options.map((o) => o.text.toLowerCase());
  return texts.includes('true') && texts.includes('false');
}

function baseDraft(
  ctx: GoogleFormsIngestionContext,
  item: {
    id: string;
    title: string;
    description?: string;
    section?: string;
    sectionId?: string;
    sectionDescription?: string;
    type: string;
    options?: DraftOption[];
    correctAnswer?: string | string[];
    points?: number;
    required?: boolean;
    explanation?: string;
    confidence?: number;
    warnings?: string[];
    sourceFeature?: string;
    needsReview?: boolean;
    mediaUrl?: string;
    matrixRows?: string[];
    matrixCols?: string[];
    evidence?: Record<string, unknown>;
  },
  extractionMethod: string,
): ExtractedQuestionDraft {
  const warnings = [...(item.warnings || [])];
  if (item.needsReview) {
    warnings.push('Needs review — unsupported or partially mapped Google Forms feature');
  }

  return {
    id: item.id,
    text: item.title,
    statement: item.title,
    type: item.type,
    options: item.options?.map((o) => ({
      id: o.id,
      text: o.text,
      isCorrect: o.isCorrect,
      order: o.order,
    })) || [],
    correctAnswer: item.correctAnswer ?? undefined,
    explanation: item.explanation || '',
    hints: item.description ? [item.description] : [],
    difficulty: 'medium',
    bloomLevel: 'understand',
    tags: ['google_forms'],
    confidence: item.confidence ?? 98,
    warnings,
    sourcePage: 1,
    metadata: {
      sourceType: 'google_forms',
      sourceUrl: ctx.sourceUrl,
      resourceId: ctx.formId,
      sourceQuestionId: item.id,
      formTitle: ctx.formTitle,
      formDescription: ctx.formDescription,
      section: item.section,
      sectionId: item.sectionId,
      sectionDescription: item.sectionDescription,
      marks: item.points ?? 1,
      required: item.required ?? false,
      hint: item.description,
      optionLabels: item.options?.map((_, i) => optionLabel(i)),
      mediaUrl: item.mediaUrl,
      sourceFeature: item.sourceFeature,
      needsReview: item.needsReview,
      extractionMethod,
      matrixRows: item.matrixRows,
      matrixCols: item.matrixCols,
      evidence: item.evidence,
      table: item.matrixRows && item.matrixCols ? {
        headers: item.matrixCols,
        rows: item.matrixRows.map((row) => [row, ...item.matrixCols!.map(() => '')]),
      } : undefined,
    },
  };
}

/** Formal Google Forms → GateHub question type mapping */
export const GOOGLE_FORM_TYPE_MAP: Record<string, { type: string; needsReview?: boolean }> = {
  RADIO: { type: 'multiple_choice' },
  CHECKBOX: { type: 'multiple_select' },
  DROP_DOWN: { type: 'multiple_choice' },
  SHORT: { type: 'short_answer' },
  PARAGRAPH: { type: 'long_answer' },
  SCALE: { type: 'multiple_choice' },
  GRID_RADIO: { type: 'matrix' },
  GRID_CHECKBOX: { type: 'matrix', needsReview: true },
  DATE: { type: 'short_answer', needsReview: true },
  TIME: { type: 'short_answer', needsReview: true },
  FILE_UPLOAD: { type: 'long_answer', needsReview: true },
};

/**
 * Parse authenticated Google Forms API response into pipeline drafts.
 */
export function ingestGoogleFormsApiResponse(
  formsContent: any,
  ctx: GoogleFormsIngestionContext,
  extractionMethod = 'forms_api',
): ExtractedQuestionDraft[] {
  const questions: ExtractedQuestionDraft[] = [];
  let currentSection = '';
  let currentSectionId = '';
  let currentSectionDescription = '';
  let pendingMediaUrl: string | undefined;

  if (!formsContent?.items || !Array.isArray(formsContent.items)) {
    return questions;
  }

  for (const item of formsContent.items) {
    if (item.pageBreakItem) {
      currentSection = item.pageBreakItem.title || item.title || currentSection;
      currentSectionId = item.itemId || currentSectionId;
      currentSectionDescription = String(
        item.pageBreakItem.description || item.description || '',
      ).trim();
      continue;
    }

    if (item.imageItem?.image) {
      pendingMediaUrl = item.imageItem.image.contentUri || item.imageItem.image.sourceUri;
      continue;
    }

    if (item.videoItem) {
      pendingMediaUrl = undefined;
      continue;
    }

    if (item.questionGroupItem?.grid) {
      const group = item.questionGroupItem;
      const groupTitle = item.title || 'Grid question';
      const columns = group.grid.columns?.options?.map((o: any) => String(o.value || '').trim()).filter(Boolean) || [];
      const rows = (group.questions || [])
        .map((rq: any) => String(rq.rowQuestion?.title || rq.title || '').trim())
        .filter(Boolean);
      const isCheckboxGrid = group.grid.columns?.type === 'CHECKBOX';

      questions.push(baseDraft(ctx, {
        id: item.itemId || `grid-${questions.length + 1}`,
        title: groupTitle,
        description: item.description,
        section: currentSection,
        sectionId: currentSectionId,
        sectionDescription: currentSectionDescription || undefined,
        type: isCheckboxGrid ? 'matrix' : 'matrix',
        points: 1,
        required: false,
        confidence: 85,
        needsReview: true,
        sourceFeature: isCheckboxGrid ? 'GRID_CHECKBOX' : 'GRID_RADIO',
        warnings: ['Google Forms grid mapped to matrix — verify rows/columns in Quiz Builder'],
        matrixRows: rows,
        matrixCols: columns,
        evidence: {
          source: 'google_form',
          itemId: item.itemId,
          questionGroup: true,
          rowCount: rows.length,
          columnCount: columns.length,
        },
      }, extractionMethod));
      pendingMediaUrl = undefined;
      continue;
    }

    if (item.questionGroupItem && !item.questionGroupItem.grid) {
      const groupTitle = item.title || 'Question group';
      questions.push(baseDraft(ctx, {
        id: item.itemId || `group-${questions.length + 1}`,
        title: groupTitle,
        description: item.description,
        section: currentSection,
        sectionId: currentSectionId,
        sectionDescription: currentSectionDescription || undefined,
        type: 'short_answer',
        points: 1,
        required: false,
        confidence: 70,
        needsReview: true,
        sourceFeature: 'QUESTION_GROUP',
        warnings: ['Unsupported Google Forms question group — review manually'],
      }, extractionMethod));
      pendingMediaUrl = undefined;
      continue;
    }

    if (!item.questionItem?.question) continue;

    const q = item.questionItem.question;
    const title = item.title || 'Untitled Question';
    const description = item.description || '';
    const points = q.grading?.pointValue ?? 1;
    const required = Boolean(q.required);
    const explanation = q.grading?.generalFeedback?.text || undefined;
    const correctValues = extractCorrectValuesFromGrading(q.grading);
    const warnings: string[] = [];

    let type = 'multiple_choice';
    let options: DraftOption[] | undefined;
    let correctAnswer: string | string[] | undefined;

    if (q.choiceQuestion) {
      const choiceType = q.choiceQuestion.type;
      if (choiceType === 'CHECKBOX') {
        type = 'multiple_select';
      } else {
        type = 'multiple_choice';
      }

      const built = buildOptionsFromChoices(q.choiceQuestion.options || [], correctValues);
      options = built.options;
      correctAnswer = built.correctAnswer;
      warnings.push(...built.warnings);

      if (detectTrueFalse(options)) {
        type = 'true_false';
      }
    } else if (q.textQuestion) {
      type = q.textQuestion.paragraph ? 'long_answer' : 'short_answer';
      if (correctValues.length === 1) {
        correctAnswer = correctValues[0];
      } else if (correctValues.length > 1) {
        correctAnswer = correctValues;
      } else {
        correctAnswer = undefined;
        warnings.push('No model answer in source — review short/long answer grading');
      }
    } else if (q.scaleQuestion) {
      type = 'multiple_choice';
      const low = q.scaleQuestion.low ?? 1;
      const high = q.scaleQuestion.high ?? 5;
      const lowLabel = q.scaleQuestion.lowLabel ? ` (${q.scaleQuestion.lowLabel})` : '';
      const highLabel = q.scaleQuestion.highLabel ? ` (${q.scaleQuestion.highLabel})` : '';
      const scaleOpts: string[] = [];
      for (let val = low; val <= high; val++) {
        let label = String(val);
        if (val === low) label += lowLabel;
        if (val === high) label += highLabel;
        scaleOpts.push(label);
      }
      const built = buildOptionsFromChoices(
        scaleOpts.map((text) => ({ value: text })),
        correctValues,
      );
      options = built.options;
      correctAnswer = built.correctAnswer;
      warnings.push(...built.warnings);
    } else if (q.dateQuestion || q.timeQuestion) {
      type = 'short_answer';
      correctAnswer = correctValues[0] || undefined;
      warnings.push('Date/time question mapped to short answer — verify format');
    } else if (q.fileUploadQuestion) {
      type = 'long_answer';
      correctAnswer = undefined;
      warnings.push('File upload question — not fully supported; flagged for review');
    } else {
      type = 'short_answer';
      correctAnswer = undefined;
      warnings.push('Unsupported Google Forms question type — flagged for review');
    }

    questions.push(baseDraft(ctx, {
      id: item.itemId || q.questionId || `q-${questions.length + 1}`,
      title,
      description,
      section: currentSection,
      sectionId: currentSectionId,
      sectionDescription: currentSectionDescription || undefined,
      type,
      options,
      correctAnswer,
      points,
      required,
      explanation,
      warnings,
      mediaUrl: pendingMediaUrl,
      confidence: 98,
      evidence: {
        source: 'google_form',
        questionId: q.questionId,
        itemId: item.itemId,
        answerEvidence: correctValues.length > 0 ? 'google_form_answer_key' : undefined,
      },
    }, extractionMethod));

    pendingMediaUrl = undefined;
  }

  return questions;
}

/**
 * Parse public Google Form HTML (FB_PUBLIC_LOAD_DATA_) into pipeline drafts.
 */
export function ingestPublicGoogleFormHtml(
  html: string,
  ctx: GoogleFormsIngestionContext,
  extractionMethod = 'public_html_fallback',
): ExtractedQuestionDraft[] {
  const questions: ExtractedQuestionDraft[] = [];
  const match = html.match(/var\s+FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*</i)
    || html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);/i);

  if (!match?.[1]) return questions;

  try {
    const data = JSON.parse(match[1]);
    const formTitle = String(data?.[3] || ctx.formTitle || '').trim();
    const formDescription = String(data?.[1]?.[0] || ctx.formDescription || '').trim();
    ctx.formTitle = formTitle || ctx.formTitle;
    ctx.formDescription = formDescription || ctx.formDescription;

    const items = data?.[1]?.[1];
    if (!Array.isArray(items)) return questions;

    let currentSection = '';

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!Array.isArray(item)) continue;

      const title = String(item[1] || '').trim();
      const description = String(item[2] || '').trim();
      const itemType = item[3];
      const questionData = item[4];

      if (itemType === 13) {
        currentSection = title || currentSection;
        continue;
      }

      if (itemType === 11) {
        continue;
      }

      let type = 'multiple_choice';
      let options: DraftOption[] | undefined;
      let correctAnswer: string | string[] | undefined;
      let required = false;
      let points = 1;
      const warnings: string[] = [];

      if (Array.isArray(questionData) && questionData[0]) {
        const qObj = questionData[0];
        required = Boolean(qObj[2]);
        if (typeof qObj[4] === 'number') points = qObj[4];

        const rawOpts = qObj[1];
        if (Array.isArray(rawOpts)) {
          const correctValues: string[] = [];
          const choiceRows = rawOpts.map((opt: any, idx: number) => {
            const optText = String(Array.isArray(opt) ? opt[0] : opt || '').trim();
            const isMarkedCorrect = Array.isArray(opt) && (opt[4] === 1 || opt[4] === true);
            if (isMarkedCorrect && optText) correctValues.push(optText);
            return { value: optText || `Option ${idx + 1}`, isCorrect: isMarkedCorrect };
          });
          const built = buildOptionsFromChoices(choiceRows, correctValues);
          options = built.options;
          correctAnswer = built.correctAnswer;
          warnings.push(...built.warnings);
        }
      }

      switch (itemType) {
        case 0:
          type = 'short_answer';
          correctAnswer = undefined;
          break;
        case 1:
          type = 'long_answer';
          correctAnswer = undefined;
          break;
        case 2:
        case 3:
          type = 'multiple_choice';
          break;
        case 4:
          type = 'multiple_select';
          break;
        case 5:
          type = 'multiple_choice';
          if (!options?.length) {
            // Do not invent a 1–5 scale when the public payload lacks bounds.
            warnings.push('Linear scale options unavailable in public form data — review manually');
          }
          break;
        case 7:
        case 8:
          type = itemType === 8 ? 'multiple_select' : 'multiple_choice';
          warnings.push('Grid question from public form — review structure');
          break;
        case 9:
        case 10:
          type = 'short_answer';
          correctAnswer = undefined;
          break;
        default:
          warnings.push(`Unknown public form item type ${itemType}`);
      }

      if (options && detectTrueFalse(options)) {
        type = 'true_false';
      }

      if (!title && !(options?.length)) continue;

      questions.push(baseDraft(ctx, {
        id: `item-${i + 1}`,
        title: title || `Question ${questions.length + 1}`,
        description,
        section: currentSection,
        type,
        options,
        correctAnswer,
        points,
        required,
        explanation: description || undefined,
        warnings,
        confidence: 90,
        needsReview: itemType === 7 || itemType === 8,
        sourceFeature: itemType === 7 || itemType === 8 ? 'GRID' : undefined,
        evidence: {
          source: 'google_form_public_html',
          itemIndex: i,
          itemType,
        },
      }, extractionMethod));
    }
  } catch (err) {
    console.error('[ingestPublicGoogleFormHtml] parse error:', err);
  }

  return questions;
}

export function computeGoogleFormsStatistics(questions: ExtractedQuestionDraft[]) {
  const answersDetected = questions.filter((q) => {
    const hasCorrect = (q.options || []).some((o) => o.isCorrect);
    const ca = q.correctAnswer;
    return hasCorrect || (typeof ca === 'string' ? ca.trim().length > 0 : Array.isArray(ca) && ca.length > 0);
  }).length;

  const sections = new Set(
    questions.map((q) => (q.metadata as any)?.section).filter(Boolean),
  ).size;

  return {
    questionsFound: questions.length,
    answersDetected,
    sectionsDetected: sections,
    imagesImported: questions.filter((q) => (q.metadata as any)?.mediaUrl).length,
  };
}
