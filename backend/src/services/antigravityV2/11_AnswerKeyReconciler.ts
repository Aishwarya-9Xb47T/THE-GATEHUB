import { V2ASTNode, V2ParagraphNode, V2QuestionBlock } from './types.js';

export interface AnswerKeyEntry {
  questionNumber: number;
  answer: string;
  sourceLine?: string;
}

/** Standalone answer-key section titles only — not inline "Correct Answer:" / "Correct Answer: B" */
const ANSWER_KEY_SECTION = /^(?:answer\s*key|(?:correct\s+)?answers|solutions|key\s*answers)\s*:?\s*$/i;

const NUMBERED_ANSWER = /^(?:Q(?:uestion)?\s*)?(\d{1,4})\s*[.:)\-–—]\s*(.+)$/i;

const INLINE_ANSWER_LABELS = /^(?:ans(?:wer)?|correct(?:\s+answer)?|solution)\s*[:\.=]\s*(.+)$/i;

/**
 * PASS 7–8: End-of-document answer key detection and cross-question reconciliation.
 * Maps detached answer keys (e.g. pages 20+) back to extracted questions by number.
 */
export class AnswerKeyReconciler {
  static extractFromText(rawText: string): AnswerKeyEntry[] {
    const entries: AnswerKeyEntry[] = [];
    const seen = new Set<string>();
    let inSection = false;

    for (const line of rawText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (ANSWER_KEY_SECTION.test(trimmed)) {
        inSection = true;
        continue;
      }

      if (inSection && /^Section\s+\d+/i.test(trimmed)) {
        inSection = false;
      }

      const parsed = this.parseLine(trimmed, inSection);
      if (parsed) {
        const key = `${parsed.questionNumber}:${parsed.answer}`;
        if (!seen.has(key)) {
          seen.add(key);
          entries.push(parsed);
        }
      }
    }

    return entries;
  }

  static extractFromBlocks(blocks: V2ASTNode[]): AnswerKeyEntry[] {
    const entries: AnswerKeyEntry[] = [];
    const seen = new Set<string>();
    let inSection = false;

    for (const block of blocks) {
      if (block.type !== 'paragraph' && block.type !== 'heading') continue;
      const txt = (block as V2ParagraphNode).plainText?.trim() || '';
      if (!txt) continue;

      if (ANSWER_KEY_SECTION.test(txt)) {
        inSection = true;
        continue;
      }

      if (inSection && /^Section\s+\d+/i.test(txt)) {
        inSection = false;
      }

      const parsed = this.parseLine(txt, inSection);
      if (parsed) {
        const key = `${parsed.questionNumber}:${parsed.answer}`;
        if (!seen.has(key)) {
          seen.add(key);
          entries.push(parsed);
        }
      }
    }

    return entries;
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
      if (q.correctAnswer && (Array.isArray(q.correctAnswer) ? q.correctAnswer.length > 0 : String(q.correctAnswer).trim())) {
        continue;
      }
      if (q.options.some((o) => o.isCorrect)) continue;

      const qNum = q.sourceQuestionNumber ?? this.inferQuestionNumber(q, i);
      if (qNum == null) continue;

      const entry = byNumber.get(qNum);
      if (!entry) continue;

      this.applyAnswer(q, entry.answer, entry.sourceLine);
    }

    return questions;
  }

  static parseLine(line: string, inAnswerKeySection: boolean): AnswerKeyEntry | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    if (ANSWER_KEY_SECTION.test(trimmed)) return null;

    const numbered = trimmed.match(NUMBERED_ANSWER);
    if (numbered && (inAnswerKeySection || this.looksLikeAnswerValue(numbered[2]))) {
      return {
        questionNumber: parseInt(numbered[1], 10),
        answer: numbered[2].trim(),
        sourceLine: trimmed,
      };
    }

    if (inAnswerKeySection) {
      const compact = trimmed.match(/^(\d{1,4})\s+([A-Za-z,\s]+(?:True|False)?)$/);
      if (compact && this.looksLikeAnswerValue(compact[2])) {
        return {
          questionNumber: parseInt(compact[1], 10),
          answer: compact[2].trim(),
          sourceLine: trimmed,
        };
      }
    }

    return null;
  }

  static isAnswerKeySectionHeader(text: string): boolean {
    const t = text.trim();
    if (!t) return false;
    // Inline per-question labels (value on same or next line) — not a detached key section
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

  private static applyAnswer(q: V2QuestionBlock, rawAnswer: string, sourceLine?: string): void {
    const normalized = rawAnswer.replace(/✅/g, '').trim();
    if (!normalized) return;

    const parts = normalized.split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean);

    if (parts.length > 1) {
      q.correctAnswer = parts;
      q.type = q.type === 'multiple_choice' ? 'multiple_select' : q.type;
    } else {
      q.correctAnswer = parts[0];
    }

    if (q.options.length > 0) {
      const answers = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
      for (const opt of q.options) {
        opt.isCorrect = answers.some((ans) => this.optionMatchesAnswer(opt.label, opt.text, String(ans)));
      }
      if (q.options.some((o) => o.isCorrect)) {
        q.type = answers.length > 1 ? 'multiple_select' : (q.type === 'true_false' ? 'true_false' : 'multiple_choice');
      }
    }

    (q as any).answerKeySource = sourceLine || normalized;
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
