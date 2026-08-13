import { AiEnrichmentData, ExtractedQuestion, MultimodalBlock, CodeBlock, MathFormula } from './types.js';

export class AiEnrichmentEngine {
  /**
   * Generate educational summary, flashcards, learning objectives, and study notes
   */
  public static enrich(
    title: string,
    rawText: string,
    blocks: MultimodalBlock[],
    questions: ExtractedQuestion[],
    codeBlocks: CodeBlock[],
    equations: MathFormula[]
  ): AiEnrichmentData {
    // Extract keywords
    const words = rawText.replace(/[^\w\s]/gi, '').split(/\s+/).filter(w => w.length > 5);
    const wordFreq: Record<string, number> = {};
    words.forEach(w => {
      const lower = w.toLowerCase();
      wordFreq[lower] = (wordFreq[lower] || 0) + 1;
    });

    const keywords = Object.keys(wordFreq)
      .sort((a, b) => wordFreq[b] - wordFreq[a])
      .slice(0, 10);

    // Summary generation
    const paragraphs = blocks.filter(b => b.type === 'paragraph' && b.text).map(b => b.text as string);
    const summary = paragraphs.slice(0, 3).join(' ') || `Educational overview for ${title}.`;

    // Flashcards generation
    const flashcards: AiEnrichmentData['flashcards'] = [];

    questions.forEach(q => {
      if (q.correctAnswer) {
        flashcards.push({
          front: q.stem,
          back: Array.isArray(q.correctAnswer) ? q.correctAnswer.join(', ') : q.correctAnswer,
          topic: q.topic || title,
        });
      }
    });

    if (flashcards.length === 0) {
      keywords.slice(0, 5).forEach((kw, i) => {
        flashcards.push({
          front: `What is the significance of ${kw}?`,
          back: `Key concept identified in ${title} related to ${kw}.`,
          topic: title,
        });
      });
    }

    // Learning Objectives
    const learningObjectives = [
      `Understand core principles and key concepts presented in ${title}.`,
      `Apply theoretical knowledge to solve real-world problems and exercise questions.`,
      `Analyze code snippets, math formulas, and visual diagrams within the subject domain.`,
    ];

    // Prerequisites
    const prerequisites = [
      `Foundational knowledge of ${keywords[0] || 'the core domain'}.`,
      `Basic familiarity with general educational problem solving.`,
    ];

    // Quiz Suggestions
    const quizSuggestions = questions.map(q => ({
      prompt: q.stem,
      type: q.type,
    }));

    return {
      summary,
      keywords,
      flashcards,
      quizSuggestions,
      learningObjectives,
      prerequisites,
      difficulty: questions.length > 5 || codeBlocks.length > 2 ? 'intermediate' : 'beginner',
      studyNotes: `### ${title} - Key Study Notes\n\n${summary}\n\n#### Key Terminology\n${keywords.map(k => `- **${k}**`).join('\n')}`,
      revisionNotes: `Quick Revision for ${title}:\n1. Review ${keywords.slice(0, 3).join(', ')}\n2. Practice ${questions.length} self-assessment questions.\n3. Examine code & math references.`,
    };
  }
}
