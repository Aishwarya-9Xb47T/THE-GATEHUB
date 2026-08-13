import type { AiChatMessage, AiCompletionOptions, AiCompletionResult, AiHealthStatus } from "./AIProvider.js";
import { BaseChatProvider } from "./BaseChatProvider.js";
import { generateOfflineDemoQuestions } from "../../assessmentStudio/aiAssessment/aiOfflineGenerator.js";
import type { GenerateAssessmentInput, QuestionActionInput } from "./AIProvider.js";
import { applyLocalQuestionRefinement, stripMockArtifacts } from "../mockQuestionRefinement.js";

const MOCK_DELAY_MS = 400;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export class MockProvider extends BaseChatProvider {
  readonly id = "mock" as const;
  readonly name = "Mock Provider";

  async healthCheck(): Promise<AiHealthStatus> {
    return { healthy: true, provider: this.id, model: "mock-local", message: "Local mock — no external API required", streaming: false };
  }

  protected async complete(messages: AiChatMessage[], options?: AiCompletionOptions): Promise<AiCompletionResult> {
    await sleep(MOCK_DELAY_MS);
    options?.onStage?.("Mock provider generating…");
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const last = messages[messages.length - 1]?.content || "";

    if (system.includes("Academic Authoring Studio") || system.includes("Learning Universe v2")) {
      const pathMatches = [...last.matchAll(/path:\s*(\/[^\n]+)/g)];
      const files = pathMatches.map((m) => {
        const path = m[1]!.trim();
        const kindMatch = last.match(new RegExp(`path:\\s*${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?kind:\\s*(\\S+)`));
        const kind = kindMatch?.[1] ?? "topics";
        const titleMatch = last.match(new RegExp(`path:\\s*${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?title:\\s*([^\\n]+)`));
        const title = titleMatch?.[1]?.trim() ?? "Lesson";
        let content = `\\theory{title={${title}},body={Mock generated content for development.}}`;
        if (kind === "track") content = `\\track{title={${title}},description={Mock track},difficulty={Beginner}}\n`;
        if (kind === "module") content = `\\module{title={${title}},description={Mock module},estimatedHours={2}}\n`;
        if (kind === "lesson") content = `\\lesson{title={${title}},duration={45},order={1}}\n`;
        if (kind === "overview") content = `\\overviewmarkdown={Welcome to ${title}. This is mock-generated overview text.}\n`;
        if (kind === "coding-lab") content = `\\codinglab{title={${title}},language={python},startercode={print("mock")},timeLimitMs={5000}}\n`;
        if (kind === "research-paper") content = `\\researchpaper{title={${title}},paperType={research},abstract={Mock abstract}}\n`;
        if (kind === "quiz") content = `\\quiz{title={${title}}}\n`;
        if (kind === "question") content = `\\quiz{question={Mock question?},optionA={A},optionB={B},optionC={C},optionD={D},correct={B},explanation={Mock}}\n`;
        if (kind === "practice") content = `\\practice{language={python},startercode={print("hi")},expectedoutput={hi}}\n`;
        return { path, content };
      });
      const content = JSON.stringify({
        summary: "Mock AI generated LaTeX for each target file (development mode).",
        files,
      });
      const result: AiCompletionResult = { content, model: "mock-local", provider: this.id, durationMs: MOCK_DELAY_MS };
      this.track(result, true);
      return result;
    }

    const content = JSON.stringify({
      questions: [
        {
          stem: `Sample question based on the provided material.`,
          type: "multiple_choice",
          difficulty: "medium",
          bloomLevel: "L2",
          explanation: "The correct option reflects the main concept from the source material.",
          options: [
            { text: "Correct concept", isCorrect: true },
            { text: "Plausible alternative A", isCorrect: false },
            { text: "Plausible alternative B", isCorrect: false },
            { text: "Plausible alternative C", isCorrect: false },
          ],
          confidence: 0.6,
        },
      ],
    });
    const result: AiCompletionResult = { content, model: "mock-local", provider: this.id, durationMs: MOCK_DELAY_MS };
    this.track(result, true);
    return result;
  }

  override async generateAssessment(input: GenerateAssessmentInput) {
    input.options?.onStage?.("Reading material…");
    await sleep(MOCK_DELAY_MS);
    input.options?.onStage?.("Generating questions…");
    const questions = generateOfflineDemoQuestions(input.config).map((q) => ({
      ...q,
      stem: stripMockArtifacts(q.stem),
    }));
    input.options?.onStage?.("Finished.");
    return questions;
  }

  override async improveQuestion(input: QuestionActionInput) {
    await sleep(200);
    return applyLocalQuestionRefinement(input.action, input.question);
  }
}
