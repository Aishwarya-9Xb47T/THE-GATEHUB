import { V2ASTNode, V2ParagraphNode, V2QuestionBlock } from './types.js';

export interface AnswerKeyEntry {
  questionNumber: number;
  answer: string;
  marks?: number;
  explanation?: string;
  sourceLine?: string;
}

/** Standalone answer-key section titles only */
const ANSWER_KEY_SECTION = /^(?:answer\s*key|(?:correct\s+)?answers|solutions|key\s*answers)(?:\s*[:—–\-].*)?$/i;

const NUMBERED_ANSWER = /^(?:Q(?:uestion)?\s*)?(\d{1,4})\s*[.:)\-–—]\s*(.+)$/i;

const INLINE_ANSWER_LABELS = /^(?:ans(?:wer)?|correct(?:\s+answer)?|solution)\s*[:\.=]\s*(.+)$/i;

/**
 * End-of-document answer key detection and cross-question reconciliation.
 * Maps detached answer keys back to extracted questions by number, associating answers, marks, and explanations.
 */
export class AnswerKeyReconciler {
  static extractFromText(rawText: string): AnswerKeyEntry[] {
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const startIdx = lines.findIndex(l => this.isAnswerKeySectionHeader(l));
    if (startIdx < 0) return [];

    const entries: AnswerKeyEntry[] = [];
    let currentQNum: number | null = null;
    let currentAnswer = '';
    let currentMarks: number | undefined = undefined;

    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^END\s+OF\s+TEST\s+DOCUMENT/i.test(line)) break;
      if (/^Q\s+Correct\s+answer/i.test(line)) continue;
      if (/^THE\s+GATEHUB/i.test(line)) continue;
      if (/^--\s*\d+\s+of\s+\d+\s*--/i.test(line)) continue;
      if (/When testing the extractor|The answer key is deliberately/i.test(line)) continue;

      // Check if line starts with question number: e.g. "1 B — 200 2" or "1. B" or "Q1: B"
      const qStartMatch = line.match(/^(?:Q\.?\s*)?(\d{1,3})\s*[.:)\-–—]?\s+(.+)$/i);
      if (qStartMatch && !line.includes('?') && !/^(?:Which|What|Who|When|Where|Why|How)\b/i.test(qStartMatch[2])) {
        if (currentQNum !== null) {
          entries.push({
            questionNumber: currentQNum,
            answer: currentAnswer.trim(),
            marks: currentMarks,
            sourceLine: `${currentQNum}: ${currentAnswer}`,
          });
        }
        currentQNum = parseInt(qStartMatch[1], 10);
        const rest = qStartMatch[2].trim();

        // Check if ends with marks e.g. " 2" or " 3"
        const marksMatch = rest.match(/^(.*?)\s+(\d+)$/);
        if (marksMatch && marksMatch[1].trim() && !/^[A-Z0-9_\-\/]+$/.test(marksMatch[1].trim())) {
          currentAnswer = marksMatch[1].trim();
          currentMarks = parseInt(marksMatch[2], 10);
        } else {
          currentAnswer = rest;
          currentMarks = undefined;
        }
      } else if (currentQNum !== null) {
        // Continuation line
        if (/^\d+$/.test(line)) {
          currentMarks = parseInt(line, 10);
        } else {
          const marksMatch = line.match(/^(.*?)\s+(\d+)$/);
          if (marksMatch && marksMatch[1].trim()) {
            currentAnswer += ' ' + marksMatch[1].trim();
            currentMarks = parseInt(marksMatch[2], 10);
          } else {
            currentAnswer += ' ' + line;
          }
        }
      }
    }

    if (currentQNum !== null) {
      entries.push({
        questionNumber: currentQNum,
        answer: currentAnswer.trim(),
        marks: currentMarks,
        sourceLine: `${currentQNum}: ${currentAnswer}`,
      });
    }

    return entries;
  }

  static extractFromBlocks(blocks: V2ASTNode[]): AnswerKeyEntry[] {
    const rawText = blocks
      .map((b) => (b.type === 'paragraph' || b.type === 'heading' ? (b as V2ParagraphNode).plainText : ''))
      .join('\n');
    return this.extractFromText(rawText);
  }

  static reconcile(
    questions: V2QuestionBlock[],
    rawText: string,
    blocks: V2ASTNode[],
    deferredEntries: AnswerKeyEntry[] = [],
  ): V2QuestionBlock[] {
    const allEntries = [
      ...deferredEntries,
      ...this.extractFromText(rawText),
      ...this.extractFromBlocks(blocks),
    ];

    if (allEntries.length === 0) return questions;

    const byNumber = new Map<number, AnswerKeyEntry>();
    for (const entry of allEntries) {
      if (!byNumber.has(entry.questionNumber)) {
        byNumber.set(entry.questionNumber, entry);
      }
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qNum = q.sourceQuestionNumber ?? this.inferQuestionNumber(q, i);
      if (qNum == null) continue;

      const entry = byNumber.get(qNum);
      if (!entry) continue;

      this.applyAnswer(q, entry.answer, entry.sourceLine, entry.marks);
    }

    return questions;
  }

  static parseLine(line: string, inAnswerKeySection: boolean): AnswerKeyEntry | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    if (ANSWER_KEY_SECTION.test(trimmed)) return null;

    const numbered = trimmed.match(NUMBERED_ANSWER);
    if (numbered && (inAnswerKeySection || this.looksLikeAnswerValue(numbered[2]))) {
      let ans = numbered[2].trim();
      let marks: number | undefined;
      const mm = ans.match(/^(.*?)\s+(\d+)$/);
      if (mm && mm[1].trim() && !/^[A-Z0-9_\-\/]+$/.test(mm[1].trim())) {
        ans = mm[1].trim();
        marks = parseInt(mm[2], 10);
      }
      return {
        questionNumber: parseInt(numbered[1], 10),
        answer: ans,
        marks,
        sourceLine: trimmed,
      };
    }

    if (inAnswerKeySection) {
      const compact = trimmed.match(/^(\d{1,4})\s+(.+)$/);
      if (compact) {
        let ans = compact[2].trim();
        let marks: number | undefined;
        const mm = ans.match(/^(.*?)\s+(\d+)$/);
        if (mm && mm[1].trim()) {
          ans = mm[1].trim();
          marks = parseInt(mm[2], 10);
        }
        return {
          questionNumber: parseInt(compact[1], 10),
          answer: ans,
          marks,
          sourceLine: trimmed,
        };
      }
    }

    return null;
  }

  static isAnswerKeySectionHeader(text: string): boolean {
    const t = text.trim();
    if (!t) return false;
    // Inline per-question labels — not a detached key section
    if (/^correct\s+answer\s*:/i.test(t)) return false;
    if (/^correct\s+answers\s*:/i.test(t) && /\S/.test(t.replace(/^correct\s+answers\s*:/i, ''))) return false;
    return ANSWER_KEY_SECTION.test(t);
  }

  private static looksLikeAnswerValue(value: string): boolean {
    const v = value.trim();
    if (!v) return false;
    if (/^(?:true|false)$/i.test(v)) return true;
    if (/^[A-Za-z](?:\s*,\s*[A-Za-z])*$/.test(v)) return true;
    if (/^[A-Za-z]\s*[–\-—]\s*[A-Za-z]/.test(v)) return true;
    if (/^\d+(?:\s*,\s*\d+)*$/.test(v)) return true;
    return v.length <= 80 && !v.includes('?');
  }

  private static inferQuestionNumber(q: V2QuestionBlock, index: number): number | null {
    if (q.sourceQuestionNumber != null) return q.sourceQuestionNumber;

    const stem = q.stem.trim();
    const patterns = [
      /^Question\s*(\d+)/i,
      /^Q\s*(\d+)/i,
      /^(\d+)\s*[.:)]\s+/,
    ];
    for (const pattern of patterns) {
      const m = stem.match(pattern);
      if (m) return parseInt(m[1], 10);
    }

    return index + 1;
  }

  private static applyAnswer(q: V2QuestionBlock, rawAnswer: string, sourceLine?: string, marks?: number): void {
    if ((q.points === undefined || q.points === null) && typeof marks === 'number') {
      q.points = marks;
    }

    let normalized = rawAnswer.replace(/✅/g, '').trim();
    if (!normalized) return;

    let explanation = '';
    // If answer format is "B — 200" or "A, B, D — string, number, boolean"
    const dashMatch = normalized.match(/^([A-D](?:\s*,\s*[A-D])*)\s*[—–\-]\s*(.*)$/);
    if (dashMatch) {
      normalized = dashMatch[1].trim();
      explanation = dashMatch[2].trim();
    } else {
      const tfMatch = normalized.match(/^(True|False)\s*[—–\-]\s*(.*)$/i);
      if (tfMatch) {
        normalized = tfMatch[1].trim();
        explanation = tfMatch[2].trim();
      }
    }

    if (explanation && !q.explanation) {
      q.explanation = explanation;
    }

    // Set correctAnswer
    const parts = normalized.split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean);
    const looksLikeMultipleChoices = q.options.length > 0 && parts.length > 1 && parts.every((p) => /^[A-E]$/i.test(p.trim()));

    if (looksLikeMultipleChoices) {
      q.correctAnswer = parts.map((p) => p.toUpperCase());
      q.type = 'multiple_select';
    } else {
      q.correctAnswer = normalized;
    }

    // Update options isCorrect
    if (q.options.length > 0) {
      const answers = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
      for (const opt of q.options) {
        opt.isCorrect = answers.some((ans) => this.optionMatchesAnswer(opt.label, opt.text, String(ans)));
      }
      if (q.options.some((o) => o.isCorrect)) {
        if (answers.length > 1 && looksLikeMultipleChoices) {
          q.type = 'multiple_select';
        } else if (q.type !== 'true_false' && q.type !== 'image_based' && q.type !== 'ordering' && q.type !== 'matching') {
          q.type = 'multiple_choice';
        }
      }
    }

    (q as any).answerKeySource = sourceLine || rawAnswer;
  }

  private static optionMatchesAnswer(label: string, text: string, answer: string): boolean {
    const a = answer.trim();
    if (!a) return false;
    if (label && a.toUpperCase() === label.toUpperCase()) return true;
    if (a.toUpperCase() === text.trim().toUpperCase()) return true;
    if (label && a.toUpperCase() === `${label.toUpperCase()}. ${text.trim()}`.toUpperCase()) return true;
    if (/^(true|false)$/i.test(a) && text.trim().toLowerCase() === a.toLowerCase()) return true;
    return false;
  }
}
