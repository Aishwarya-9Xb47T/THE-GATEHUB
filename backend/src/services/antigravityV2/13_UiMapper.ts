import { AntiGravityV2Result, V2QuestionBlock } from './types.js';

export class UiMapper {
  /**
   * Map V2 AST Knowledge Object to Quiz Builder & Assessment Studio formats
   */
  public static mapToQuizBuilder(result: AntiGravityV2Result): any {
    return {
      title: result.document.title,
      questions: result.questions.map(q => ({
        id: q.id,
        type: q.type,
        prompt: q.stem,
        options: q.options.map(o => ({ id: o.id, text: `${o.label}) ${o.text}`, isCorrect: o.isCorrect })),
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        table: q.associatedTables[0],
        code: q.associatedCode[0]?.code,
        math: q.associatedMath[0]?.latex,
      })),
      statistics: {
        totalQuestions: result.questions.length,
        tablesCount: result.tables.length,
        codeCount: result.codeBlocks.length,
        mathCount: result.equations.length,
      },
    };
  }
}
