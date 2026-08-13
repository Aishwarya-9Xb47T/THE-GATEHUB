/** Normalized submit feedback — adapters map to legacy `answer_result` WS payload. */
export interface AnswerFeedback {
  isCorrect: boolean;
  pointsEarned: number;
  explanation: string | null;
  correctOptionIds: string[];
  responseTimeMs: number;
  streak: number;
  xpEarned: number;
  totalScore: number;
  totalXp: number;
  rank: number;
}

export interface SubmitAnswerResult {
  feedback: AnswerFeedback;
  questionId: string;
}
