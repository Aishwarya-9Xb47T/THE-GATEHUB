/**
 * Agent 6 — Coding Lab Engine
 * Generates complete, runnable labs — never "# Your solution here".
 */
import { createHash } from "crypto";
import { getOpenAi } from "../openaiClient.js";
import type {
  AICourseArchitectInterview,
  ArchitectCodingLab,
  ArchitectLessonBlueprint,
  ArchitectModuleBlueprint,
  LessonPedagogyPlan,
} from "../types.js";
import { hasLearningComponent } from "../types.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext, ANTI_HALLUCINATION_RULES, buildCodingLabGuidance } from "../instructorPersona.js";
import { getArchitectModel } from "../architectModels.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { executeCodeSnippet, syntaxLooksValid } from "../codeExecutor.js";
import { scanForLabPlaceholders, sanitizeCodingLab } from "../pipeline/placeholderGuards.js";
import { ensureRunnableLabCode } from "../../labCodeRepair.js";
import { architectCompletionJSON } from "../architectLLM.js";

function computeHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function generateCodingLab(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview,
  pedagogy: LessonPedagogyPlan,
  lessonContent?: Partial<ArchitectLessonBlueprint>
): Promise<ArchitectCodingLab | undefined> {
  console.log("[CODING LAB GENERATION] START");
  console.log("[CODING LAB GENERATION] LESSON:", lesson.title);
  console.log("[CODING LAB GENERATION] MODULE:", mod.title);

  if (!hasLearningComponent(interview, "Coding") && !hasLearningComponent(interview, "Coding Lab")) {
    console.log("[CODING LAB GENERATION] NO CODING COMPONENT - SKIPPING");
    return undefined;
  }

  const aiLab = await generateLabWithRetries(lesson, mod, interview, pedagogy, lessonContent);

  if (aiLab) {
    console.log("[CODING LAB GENERATION] AI LAB GENERATED");
    console.log("[CODING LAB GENERATION] LANGUAGE:", aiLab.language);
    console.log("[CODING LAB GENERATION] STARTER CODE LENGTH:", aiLab.starterCode?.length || 0);
    console.log("[CODING LAB GENERATION] STARTER CODE LINES:", aiLab.starterCode?.split("\n").length || 0);
    console.log("[CODING LAB GENERATION] RAW STARTER CODE:", aiLab.starterCode);
    console.log("[CODING LAB GENERATION] RAW STARTER CODE HASH:", computeHash(aiLab.starterCode || ""));
    console.log("[CODING LAB GENERATION] TEST CASES COUNT:", aiLab.publicTestCases?.length || 0);
  }

  if (aiLab && validateCodingLab(aiLab) && (await validateLabExecution(aiLab))) {
    const repairedStarter = await ensureRunnableLabCode(aiLab.starterCode, aiLab.language, aiLab.solutionCode);
    console.log("[CODING LAB GENERATION] REPAIRED STARTER CODE:", repairedStarter);
    console.log("[CODING LAB GENERATION] REPAIRED STARTER CODE HASH:", computeHash(repairedStarter));
    const sanitized = sanitizeCodingLab({
      ...aiLab,
      starterCode: repairedStarter,
    });
    console.log("[CODING LAB GENERATION] SANITIZED STARTER CODE:", sanitized.starterCode);
    console.log("[CODING LAB GENERATION] SANITIZED STARTER CODE HASH:", computeHash(sanitized.starterCode || ""));
    return sanitized;
  }

  const heuristic = buildHeuristicLab(lesson, mod, interview, lessonContent);
  const repairedStarter = await ensureRunnableLabCode(
    heuristic.starterCode,
    heuristic.language,
    heuristic.solutionCode
  );
  return sanitizeCodingLab({ ...heuristic, starterCode: repairedStarter });
}

async function generateLabWithRetries(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview,
  pedagogy: LessonPedagogyPlan,
  lessonContent?: Partial<ArchitectLessonBlueprint>
): Promise<ArchitectCodingLab | null> {
  let lastError = "";
  for (let attempt = 0; attempt < AGENT_MAX_ATTEMPTS; attempt++) {
    const aiLab = await generateLabWithAI(
      lesson,
      mod,
      interview,
      pedagogy,
      lessonContent,
      attempt > 0 ? lastError : undefined
    );
    if (!aiLab || !validateCodingLab(aiLab)) continue;
    const exec = await validateLabExecution(aiLab);
    if (exec.ok) return aiLab;
    lastError = exec.stderr || "Code failed to execute";
  }
  return null;
}

async function validateLabExecution(
  lab: ArchitectCodingLab
): Promise<{ ok: boolean; stderr?: string }> {
  const lang = lab.language || "python";
  if (!syntaxLooksValid(lab.starterCode, lang)) {
    return { ok: false, stderr: "Invalid syntax or placeholder detected" };
  }
  const result = await executeCodeSnippet(lab.starterCode, lang);
  return { ok: result.success, stderr: result.stderr || undefined };
}

async function generateLabWithAI(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview,
  pedagogy: LessonPedagogyPlan,
  lessonContent?: Partial<ArchitectLessonBlueprint>,
  retryHint?: string
): Promise<ArchitectCodingLab | null> {
  if (!getOpenAi()) return null;

  const goalsStr = Array.isArray(pedagogy?.learningGoals) ? pedagogy.learningGoals.join("; ") : "";
  const prompt = `Design a complete coding lab for "${lesson.title}" (${interview.courseInfo.subject}).

${buildInterviewContext(interview)}
Module: ${mod.title}
Goals: ${goalsStr}

${buildCodingLabGuidance(lesson.difficultyTier ?? "intermediate", interview.courseInfo.industry)}

${ANTI_HALLUCINATION_RULES}

NEVER use "# Your solution here" or empty stubs.
Use "# Step 1:", "# Step 2:" comments (not TODO) to guide learners.
Provide working starter code with clear steps — not empty functions.
Starter code MUST be syntactically valid and execute successfully when run (exit code 0).
Include a runnable if __name__ == "__main__" block or top-level prints so Run All succeeds.
Use simple single-line docstrings; avoid nested triple-quoted strings that can break parsing.
No NotImplementedError, no pass-only function bodies, no unclosed quotes.
${retryHint ? `\nFIX PREVIOUS ATTEMPT: ${retryHint}` : ""}

Return JSON:
{
  "title": "lab title",
  "language": "python",
  "problemStatement": "clear problem description",
  "inputDescription": "input format",
  "outputDescription": "expected output format",
  "starterCode": "complete runnable starter with guided steps",
  "solutionCode": "full reference solution",
  "alternativeSolution": "second valid approach",
  "expectedOutput": "exact sample output",
  "explanation": "walkthrough of approach",
  "timeComplexity": "Big-O time",
  "spaceComplexity": "Big-O space",
  "edgeCases": ["edge case 1", "edge case 2"],
  "debuggingTips": ["tip 1", "tip 2"],
  "publicTestCases": [{ "input": "...", "output": "..." }], // Provide 5 distinct public test cases
  "hiddenTestCases": [{ "input": "...", "output": "..." }], // Provide 10 comprehensive hidden test cases
  "hints": ["hint 1", "hint 2", "hint 3"],
  "extensionExercise": "optional harder challenge",
  "miniChallenge": "5-minute bonus task",
  "colabUrl": "optional"
}`;

  try {
    const aiLab = await architectCompletionJSON<ArchitectCodingLab>({
      phase: "coding-lab",
      system: PROFESSOR_SYSTEM_PROMPT,
      user: prompt,
      temperature: 0.4,
    });
    if (aiLab) return aiLab;
  } catch (err) {
    console.error("[Agent 6 Coding Lab] LLM completion error:", err);
  }
  return null;
}

function validateCodingLab(lab: ArchitectCodingLab): boolean {
  const forbidden = scanForLabPlaceholders(
    [lab.starterCode, lab.problemStatement ?? "", lab.expectedOutput].join("\n")
  );
  if (forbidden.length) return false;
  if (!lab.starterCode || lab.starterCode.length < 80) return false;
  if (!lab.expectedOutput || lab.expectedOutput.length < 3) return false;
  if (/your solution here|your implementation here|NotImplementedError/i.test(lab.starterCode)) return false;
  return true;
}

function buildHeuristicLab(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview,
  _lessonContent?: Partial<ArchitectLessonBlueprint>
): ArchitectCodingLab {
  const topic = lesson.title.split("—").pop()?.trim() || lesson.title;
  const subject = interview.courseInfo.subject;

  return {
    title: `${topic} — Hands-on Lab`,
    language: "python",
    problemStatement: `## Context\nA ${interview.courseInfo.industry} team needs a reproducible check for ${topic} quality signals.\n\n## Deliverables\n1. Implement analyze() to aggregate samples and evaluate a threshold.\n2. Handle invalid input with clear errors.\n3. Run public tests and print a verifiable result.\n\n## Success criteria\nStarter code runs immediately; your extension must pass all tests.`,
    inputDescription: "A list of numeric samples representing measurements from a simplified workflow.",
    outputDescription: "A dictionary with mean, count, and a pass/fail flag against a threshold.",
    starterCode: `"""${topic} Lab — ${mod.title}
Run this cell to verify your environment, then extend analyze() per the challenge below.
"""

# Step 1: Review analyze() — it aggregates samples and checks a threshold.
# Step 2: Run _run_tests() to confirm your environment works.
# Step 3: Extend analyze() or add helpers per the extension exercise.

def analyze(samples: list[float], threshold: float = 0.75) -> dict:
    """Return mean, count, and whether mean meets threshold."""
    if not samples:
        raise ValueError("samples must be non-empty")
    mean = sum(samples) / len(samples)
    passed = mean >= threshold
    return {"mean": mean, "count": len(samples), "passed": passed}


def _run_tests() -> None:
    result = analyze([0.8, 0.9, 0.7, 0.85])
    assert result["count"] == 4, f"Expected count 4, got {result}"
    assert abs(result["mean"] - 0.8125) < 0.001, f"Unexpected mean: {result['mean']}"
    assert result["passed"] is True, "Expected passed=True for this dataset"
    print("All public tests passed.")
    print(f"Result: {result}")


if __name__ == "__main__":
    _run_tests()
`,
    solutionCode: `def analyze(samples: list[float], threshold: float = 0.75) -> dict:
    if not samples:
        raise ValueError("samples must be non-empty")
    mean = sum(samples) / len(samples)
    return {"mean": mean, "count": len(samples), "passed": mean >= threshold}
`,
    alternativeSolution: `import statistics

def analyze(samples: list[float], threshold: float = 0.75) -> dict:
    if not samples:
        raise ValueError("samples must be non-empty")
    mean = statistics.fmean(samples)
    return {"mean": mean, "count": len(samples), "passed": mean >= threshold}
`,
    expectedOutput: "All public tests passed.\nResult: {'mean': 0.8125, 'count': 4, 'passed': True}",
    explanation: `This lab reinforces ${topic} by requiring input validation, aggregation, and threshold-based decisions — patterns common in ${interview.courseInfo.industry} pipelines.`,
    timeComplexity: "O(n) time where n is len(samples)",
    spaceComplexity: "O(1) extra space beyond input",
    edgeCases: ["Empty samples list should raise ValueError", "Single-element list", "All values below threshold"],
    debuggingTips: [
      "Print intermediate mean before comparison",
      "Verify threshold boundary with mean exactly equal to threshold",
    ],
    publicTestCases: [
      { input: "[0.8, 0.9, 0.7, 0.85]", output: "passed=True, mean≈0.8125" },
      { input: "[0.5, 0.6]", output: "passed=False" },
    ],
    hiddenTestCases: [
      { input: "[0.1, 0.2]", output: "passed=False" },
      { input: "[1.0]", output: "passed=True, count=1" },
    ],
    hints: [
      `Revisit the ${topic} theory section for aggregation patterns`,
      "Use len(samples) once and reuse for mean calculation",
    ],
    extensionExercise: `Add weighted mean support when samples include (value, weight) pairs.`,
    miniChallenge: "Add a formatted report string method without changing analyze() signature.",
    colabUrl: hasLearningComponent(interview, "Colab") ? "https://colab.research.google.com" : undefined,
  };
}
