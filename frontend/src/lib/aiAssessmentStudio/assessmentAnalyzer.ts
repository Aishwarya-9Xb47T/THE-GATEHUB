import type { AiGeneratedQuestion, AiGenerationPreview } from "./types";
import type { AiAssessmentInsights, AiQualityBreakdown, AiValidationIssue } from "./copilotTypes";

function stemSimilarity(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const wb = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  if (!wa.size || !wb.size) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.max(wa.size, wb.size);
}

function avgWordLength(text: string): number {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  return words.reduce((s, w) => s + w.length, 0) / words.length;
}

function readingLevel(questions: AiGeneratedQuestion[]): string {
  const avg = questions.reduce((s, q) => s + avgWordLength(q.stem), 0) / Math.max(questions.length, 1);
  if (avg < 5) return "Elementary";
  if (avg < 7) return "Middle School";
  if (avg < 9) return "High School";
  if (avg < 11) return "Undergraduate";
  return "Graduate";
}

export function detectValidationIssues(questions: AiGeneratedQuestion[]): AiValidationIssue[] {
  const issues: AiValidationIssue[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]!;
    for (let j = i + 1; j < questions.length; j++) {
      if (stemSimilarity(q.stem, questions[j]!.stem) > 0.72) {
        issues.push({
          questionId: q.id,
          type: "duplicate",
          message: `Similar to question ${j + 1}`,
          severity: "high",
        });
      }
    }

    if (q.confidence != null && q.confidence < 0.6) {
      issues.push({ questionId: q.id, type: "low_confidence", message: "Low AI confidence", severity: "medium" });
    }

    if (!q.explanation && ["multiple_choice", "true_false"].includes(q.type)) {
      issues.push({ questionId: q.id, type: "missing_explanation", message: "No explanation provided", severity: "low" });
    }

    if (q.options && q.options.length >= 2) {
      const correct = q.options.filter((o) => o.isCorrect);
      if (correct.length !== 1 && q.type === "multiple_choice") {
        issues.push({ questionId: q.id, type: "ambiguous", message: "MCQ should have exactly one correct answer", severity: "high" });
      }
      const short = q.options.filter((o) => o.text.length < 3);
      if (short.length) {
        issues.push({ questionId: q.id, type: "weak_distractor", message: "Some options are too short", severity: "medium" });
      }
    }

    if (q.difficulty === "very_easy" || q.difficulty === "easy") {
      if (q.bloomLevel && ["L5", "L6"].includes(q.bloomLevel)) {
        issues.push({ questionId: q.id, type: "bloom_mismatch", message: "High Bloom level with easy difficulty", severity: "medium" });
      }
    }
  }

  return issues;
}

export function buildRecommendations(
  questions: AiGeneratedQuestion[],
  insights: Partial<AiAssessmentInsights>
): string[] {
  const recs: string[] = [];
  const types = questions.reduce((m, q) => ({ ...m, [q.type]: (m[q.type] || 0) + 1 }), {} as Record<string, number>);
  const coding = (types.coding || 0) + (types.sql || 0);

  if (!coding) recs.push("No coding questions detected — consider adding application-based items.");
  const tf = types.true_false || 0;
  if (tf > questions.length * 0.4) recs.push("Too many True/False questions — diversify question types.");

  const easy = questions.filter((q) => q.difficulty === "easy" || q.difficulty === "very_easy").length;
  if (easy > questions.length * 0.6) recs.push("Difficulty heavily favors easy questions — balance with medium/hard items.");

  if (insights.estimatedMinutes && insights.estimatedMinutes > 45) {
    recs.push("Estimated duration exceeds 45 minutes — consider reducing question count or time per item.");
  }

  if ((insights.duplicateCount || 0) > 0) {
    recs.push(`Detected ${insights.duplicateCount} potential duplicate(s) — review and remove.`);
  }

  const topics = new Set(questions.map((q) => q.topic).filter(Boolean));
  if (topics.size < 2 && questions.length > 5) {
    recs.push("Topic coverage is narrow — add questions from additional units or subtopics.");
  }

  if (!questions.some((q) => q.bloomLevel && ["L4", "L5", "L6"].includes(q.bloomLevel))) {
    recs.push("Consider adding more application and analysis-based questions (Bloom L4+).");
  }

  return recs.slice(0, 6);
}

export function computeQualityBreakdown(questions: AiGeneratedQuestion[]): AiQualityBreakdown {
  if (!questions.length) {
    return { overall: 0, questionQuality: 0, difficultyBalance: 0, coverage: 0, readability: 0, grammar: 0, learningObjectives: 0, distractorQuality: 0, timeBalance: 0 };
  }

  const conf = questions.reduce((s, q) => s + (q.confidence ?? 0.75), 0) / questions.length;
  const withExpl = questions.filter((q) => q.explanation).length / questions.length;
  const withHints = questions.filter((q) => q.hints?.length).length / questions.length;
  const withOpts = questions.filter((q) => q.options && q.options.length >= 3).length / questions.length;

  const diffs = ["very_easy", "easy", "medium", "hard", "expert"];
  const dist = diffs.map((d) => questions.filter((q) => q.difficulty === d).length);
  const maxD = Math.max(...dist, 1);
  const difficultyBalance = 100 - Math.round((maxD / questions.length) * 50);

  const topics = new Set(questions.map((q) => q.topic || q.subtopic).filter(Boolean));
  const coverage = Math.min(100, topics.size * 15 + 25);

  const avgLen = questions.reduce((s, q) => s + q.stem.split(/\s+/).length, 0) / questions.length;
  const readability = avgLen > 8 && avgLen < 35 ? 90 : 70;

  const issues = detectValidationIssues(questions);
  const grammar = Math.max(50, 100 - issues.filter((i) => ["grammar", "ambiguous", "weak_distractor"].includes(i.type)).length * 8);

  const questionQuality = Math.round(conf * 50 + withExpl * 25 + withOpts * 25);
  const learningObjectives = Math.round(withExpl * 60 + withHints * 40);
  const distractorQuality = Math.round(withOpts * 100);
  const times = questions.map((q) => q.estimatedSeconds || 60);
  const timeVar = Math.max(...times) - Math.min(...times);
  const timeBalance = timeVar < 180 ? 88 : 70;

  const overall = Math.round(
    (questionQuality + difficultyBalance + coverage + readability + grammar + learningObjectives + distractorQuality + timeBalance) / 8
  );

  return {
    overall,
    questionQuality,
    difficultyBalance,
    coverage,
    readability,
    grammar,
    learningObjectives,
    distractorQuality,
    timeBalance,
  };
}

export function analyzeAssessment(preview: AiGenerationPreview): AiAssessmentInsights {
  const { questions } = preview;
  const difficultyDistribution: Record<string, number> = {};
  const bloomDistribution: Record<string, number> = {};
  const topicMap: Record<string, number> = {};

  for (const q of questions) {
    const d = q.difficulty || "medium";
    difficultyDistribution[d] = (difficultyDistribution[d] || 0) + 1;
    const b = q.bloomLevel || "L2";
    bloomDistribution[b] = (bloomDistribution[b] || 0) + 1;
    const t = q.topic || q.subtopic || "General";
    topicMap[t] = (topicMap[t] || 0) + 1;
  }

  const total = questions.length || 1;
  const topicCoverage = Object.entries(topicMap).map(([topic, count]) => ({
    topic,
    percent: Math.round((count / total) * 100),
  }));

  const types = new Set(questions.map((q) => q.type));
  const validationIssues = detectValidationIssues(questions);
  const duplicateCount = validationIssues.filter((i) => i.type === "duplicate").length;

  const estSec = questions.reduce((s, q) => s + (q.estimatedSeconds || 60), 0);
  const confidenceScore = Math.round(
    (questions.reduce((s, q) => s + (q.confidence ?? 0.8), 0) / total) * 100
  );

  const quality = computeQualityBreakdown(questions);

  const partial: Partial<AiAssessmentInsights> = {
    estimatedMinutes: Math.max(1, Math.ceil(estSec / 60)),
    duplicateCount,
  };

  return {
    difficultyDistribution,
    bloomDistribution,
    topicCoverage,
    questionDiversity: Math.round((types.size / Math.max(questions.length, 1)) * 100),
    estimatedMinutes: partial.estimatedMinutes!,
    readingLevel: readingLevel(questions),
    confidenceScore,
    grammarScore: quality.grammar,
    duplicateCount,
    recommendations: buildRecommendations(questions, partial),
    quality,
    validationIssues,
  };
}

export function getContextualSuggestions(preview: AiGenerationPreview | null): string[] {
  if (!preview) return [];
  const insights = analyzeAssessment(preview);
  const base = [
    "Make questions harder",
    "Generate explanations",
    "Improve distractors",
    "Balance difficulty",
    "Detect duplicate questions",
  ];
  if (!preview.questions.some((q) => q.type === "coding")) base.unshift("Generate more coding questions");
  if (insights.estimatedMinutes > 30) base.push("Reduce quiz to 10 minutes");
  if (insights.duplicateCount) base.push("Remove duplicates");
  if (insights.quality.grammar < 80) base.push("Improve grammar");
  return [...new Set(base)].slice(0, 12);
}
