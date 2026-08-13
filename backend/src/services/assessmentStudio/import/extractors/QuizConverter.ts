/**
 * Stage 7: Quiz Schema Converter
 * Converts validated question drafts into GateHub Quiz format
 */

import { ValidatedQuestionDraft, GateHubQuiz, QuizCreationResult } from '../unifiedTypes.js';
import { AppError } from '../../../../middlewares/errorHandler.js';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

import fs from 'fs';
import path from 'path';

function persistImageAsset(dataUrl?: string): string | undefined {
  if (!dataUrl || typeof dataUrl !== 'string') return undefined;
  const trimmed = dataUrl.trim();
  if (!trimmed || trimmed === 'https://') return undefined;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return undefined; // resolved async in convertQuestion via persistRemoteImages
  }
  // Reject empty/malformed data URLs produced when media linking fails
  if (trimmed.startsWith('data:image/')) {
    const commaIdx = trimmed.indexOf(',');
    if (commaIdx < 0 || trimmed.length - commaIdx - 1 < 32) return undefined;
  }
  if (!trimmed.startsWith('data:image/')) return trimmed;
  try {
    const match = trimmed.match(/^data:image\/([a-zA-Z0-9\+\-]+);base64,(.+)$/);
    if (!match) return undefined;
    const rawExt = match[1];
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt === 'svg+xml' ? 'svg' : rawExt;
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length < 32) return undefined;
    const filename = `import-img-${randomUUID()}.${ext}`;
    const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
    if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });
    const filePath = path.join(uploadRoot, filename);
    fs.writeFileSync(filePath, buffer);
    console.log('[QuizConverter] Persisted base64 image asset to disk:', `/uploads/${filename}`, `(${buffer.length} bytes)`);
    return `/uploads/${filename}`;
  } catch (err) {
    console.warn('[QuizConverter] Failed to save base64 image to file:', err);
    return undefined;
  }
}

function collectImageSources(metaObj: Record<string, unknown>, draft: ValidatedQuestionDraft): string[] {
  const urls: string[] = [];
  const push = (u?: string) => {
    if (!u || typeof u !== 'string') return;
    const t = u.trim();
    if (t && t !== 'https://' && !urls.includes(t)) urls.push(t);
  };

  push(metaObj.mediaUrl as string);
  push((metaObj.media as any)?.url);
  push(metaObj.diagram?.url as string);
  push(metaObj.diagram?.dataUrl as string);
  push((draft as any).mediaUrl);
  push((draft as any).diagram?.url);
  push((draft as any).diagram?.dataUrl);

  if (Array.isArray(metaObj.images)) {
    for (const img of metaObj.images as Array<{ url?: string; dataUrl?: string }>) {
      push(img.url);
      push(img.dataUrl);
    }
  }

  const children = (metaObj.children || (draft as any).children) as Array<{ type?: string; imageUrl?: string }> | undefined;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (child?.type === 'image') push(child.imageUrl);
    }
  }

  return urls;
}

function cleanExtractedText(str?: string): string {
  if (!str) return '';
  return str
    .replace(/--?\s*\d+\s*(?:of|to|-|\/|—)?\s*\d*--?/gi, '')
    .replace(/\bPage\s+\d+\s*(?:of|to|-|\/|—)\s*\d+\b/gi, '')
    .replace(/\bPage\s+\d+\b/gi, '')
    .replace(/\b\d+\s+of\s+\d+\b/gi, '')
    .replace(/\[\s*EQUATION\s*\]/gi, '')
    .replace(/\[\s*ANSWER\s*\]/gi, '')
    .replace(/\[\s*QUESTION\s*\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export class QuizConverter {
  /**
   * Convert validated questions to GateHub Quiz format
   */
  static convert(
    questions: ValidatedQuestionDraft[],
    options: {
      title?: string;
      description?: string;
      userId?: string;
    }
  ): GateHubQuiz {
    console.log('=== QuizConverter.convert ENTRY ===');
    console.log('INPUT:', {
      questionsCount: questions.length,
      title: options.title,
      description: options.description,
      firstQuestion: questions[0] ? {
        text: questions[0].text.substring(0, 100),
        type: questions[0].type,
        validationStatus: questions[0].validationStatus
      } : null
    });

    try {
      const startTime = Date.now();

      // Filter out rejected questions
      console.log('[QuizConverter] Filtering out rejected questions');
      const validQuestions = questions.filter(q => q.validationStatus !== 'rejected');
      console.log('[QuizConverter] Filter completed', {
        originalCount: questions.length,
        validCount: validQuestions.length,
        rejectedCount: questions.length - validQuestions.length
      });

      if (validQuestions.length === 0) {
        console.error('[QuizConverter] ERROR - No valid questions to convert');
        throw new AppError(400, 'No valid questions to convert');
      }

      // Create GateHub Quiz structure
      console.log('[QuizConverter] Creating GateHub Quiz structure');
      const quiz: GateHubQuiz = {
        title: options.title || 'Imported Quiz',
        description: options.description || '',
        subject: undefined,
        visibility: 'private',
        metadata: {
          version: 1,
          settings: {
            shuffleQuestions: false,
            shuffleOptions: false,
            randomSubset: 0,
            timePerQuestion: 60,
            showExplanations: true,
            passingScore: 70,
            maxAttempts: 1,
            negativeMarking: false,
          },
          sections: [],
        },
        questions: validQuestions.map((q, index) => this.convertQuestion(q, index)),
      };

      const duration = Date.now() - startTime;
      console.log('=== QuizConverter.convert EXIT ===');
      console.log('OUTPUT:', {
        quizTitle: quiz.title,
        quizQuestions: quiz.questions.length,
        duration: `${duration}ms`
      });

      return quiz;
    } catch (error) {
      console.error('=== QuizConverter.convert ERROR ===');
      console.error('ERROR DETAILS:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      if (error instanceof AppError) throw error;
      throw new AppError(500, `Quiz conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert a single validated question to GateHub format
   */
  private static convertQuestion(
    draft: ValidatedQuestionDraft,
    index: number
  ): GateHubQuiz['questions'][number] {
    const hintVal = (draft.metadata as any)?.hint || undefined;
    const sectionVal = (draft.metadata as any)?.section || undefined;
    const marksVal = typeof (draft.metadata as any)?.marks === 'number' ? (draft.metadata as any).marks : 1;

    const metaObj = (draft.metadata as any) || {};
    const sourceUrls = collectImageSources(metaObj, draft);
    const persistedUrls = sourceUrls
      .map((u) => persistImageAsset(u))
      .filter((u): u is string => Boolean(u));

    const mediaUrlVal = persistedUrls[0];
    const mediaObj = mediaUrlVal ? { url: mediaUrlVal, kind: 'image' as const } : undefined;
    const cleanedText = cleanExtractedText(draft.text);

    const persistedImages = persistedUrls.map((url, idx) => ({
      id: `import-img-${idx}`,
      url,
      dataUrl: url,
      caption: (metaObj.caption as string) || 'Question Image',
    }));

    let questionText = cleanedText;
    if (mediaUrlVal && !questionText.includes('![') && !questionText.includes(mediaUrlVal)) {
      if (/image|shown|picture|diagram|figure|identify the object/i.test(questionText) || persistedImages.length > 0) {
        questionText = `${questionText}\n\n![Question Image](${mediaUrlVal})`;
      }
    }

    let options = (draft.options || []).map((opt, optIndex) => this.convertOption(opt, optIndex));
    options = this.applyCorrectAnswerToOptions(draft, options);

    return {
      id: draft.id,
      text: questionText,
      type: draft.type,
      marks: marksVal,
      order: index,
      difficulty: draft.difficulty,
      negativeMarks: 0,
      hint: hintVal,
      bloomLevel: draft.bloomLevel,
      explanation: draft.explanation ? cleanExtractedText(draft.explanation) : undefined,
      metadata: {
        ...(typeof draft.metadata === 'object' && draft.metadata !== null ? draft.metadata : {}),
        hints: hintVal ? [hintVal] : [],
        tags: draft.tags,
        estimatedSeconds: 60,
        sectionId: sectionVal,
        media: mediaObj,
        mediaUrl: mediaUrlVal,
        importConfidence: draft.confidence,
        importWarnings: draft.warnings,
        table: metaObj.table || (draft as any).table,
        tables: metaObj.tables || (draft as any).tables,
        code: metaObj.code || (draft as any).code,
        codeBlocks: metaObj.codeBlocks || (draft as any).codeBlocks,
        starterCode: metaObj.starterCode || (draft as any).starterCode || metaObj.code?.code || '',
        language: metaObj.language || metaObj.code?.language || (draft as any).language,
        children: metaObj.children || (draft as any).children,
        equations: metaObj.equations || (draft as any).equations,
        formulas: metaObj.formulas || (draft as any).formulas,
        images: persistedImages.length > 0 ? persistedImages : metaObj.images || (draft as any).images,
        diagram: metaObj.diagram || (draft as any).diagram,
      },
      options,
    };
  }

  /**
   * Map correctAnswer onto options when isCorrect flags were not set during extraction.
   */
  private static applyCorrectAnswerToOptions(
    draft: ValidatedQuestionDraft,
    options: GateHubQuiz['questions'][number]['options'],
  ): GateHubQuiz['questions'][number]['options'] {
    if (!options.length || options.some((o) => o.isCorrect)) return options;

    const raw = (draft as any).correctAnswer ?? (draft.metadata as any)?.correctAnswer;
    if (!raw) return options;

    const answers = Array.isArray(raw) ? raw.map(String) : [String(raw)];
    const labels = (draft.metadata as any)?.optionLabels as string[] | undefined;

    return options.map((opt, index) => {
      const label = labels?.[index];
      const isCorrect = answers.some((ans) => {
        const normalized = ans.trim();
        if (label && normalized.toUpperCase() === label.toUpperCase()) return true;
        if (normalized.toUpperCase() === opt.text.trim().toUpperCase()) return true;
        if (label && normalized.toUpperCase() === `${label.toUpperCase()}. ${opt.text.trim()}`.toUpperCase()) return true;
        return false;
      });
      return { ...opt, isCorrect };
    });
  }

  /**
   * Convert a single option to GateHub format
   */
  private static convertOption(
    draft: ValidatedQuestionDraft['options'][number],
    index: number
  ): GateHubQuiz['questions'][number]['options'][number] {
    return {
      id: draft.id,
      text: cleanExtractedText(draft.text),
      isCorrect: draft.isCorrect,
      order: index,
    };
  }

  /**
   * Convert for question bank (without quiz wrapper)
   */
  static convertForQuestionBank(questions: ValidatedQuestionDraft[]): GateHubQuiz['questions'] {
    return questions
      .filter(q => q.validationStatus !== 'rejected')
      .map((q, index) => this.convertQuestion(q, index));
  }
}
