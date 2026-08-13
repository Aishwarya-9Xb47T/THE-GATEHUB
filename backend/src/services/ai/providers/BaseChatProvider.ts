import type {
  AIProvider,
  AiChatMessage,
  AiCompletionOptions,
  AiCompletionResult,
  AiHealthStatus,
  AiProviderId,
  GenerateAssessmentInput,
  QuestionActionInput,
} from "./AIProvider.js";
import type { AiGeneratedQuestion } from "../../assessmentStudio/aiAssessment/types.js";
import {
  buildAssessmentSystemPrompt,
  parseQuestionsJson,
  refineQuestionJson,
} from "../assessmentCore.js";
import { computeMaxTokensForQuestionCount } from "../../assessmentGeneration/assessmentGenerationService.js";
import { getAiRuntimeConfig } from "../AiRuntimeConfig.js";
import { recordAiRequest } from "../aiMetrics.js";

export abstract class BaseChatProvider implements AIProvider {
  abstract readonly id: AiProviderId;
  abstract readonly name: string;

  protected abstract complete(messages: AiChatMessage[], options?: AiCompletionOptions): Promise<AiCompletionResult>;

  async healthCheck(): Promise<AiHealthStatus> {
    return { healthy: true, provider: this.id, message: "OK" };
  }

  async chat(messages: AiChatMessage[], options?: AiCompletionOptions): Promise<AiCompletionResult> {
    return this.complete(messages, options);
  }

  async generateAssessment(input: GenerateAssessmentInput): Promise<AiGeneratedQuestion[]> {
    input.options?.onStage?.("Reading material…");
    const snippet = input.content.slice(0, 12000);
    const system = buildAssessmentSystemPrompt(input.config);
    const user = `${input.config.topic ? `Topic: ${input.config.topic}\n` : ""}${input.config.learningOutcome ? `Outcomes: ${input.config.learningOutcome}\n` : ""}Source:\n${snippet || input.config.quizName}`;
    input.options?.onStage?.("Generating questions…");
    const res = await this.complete(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        ...input.options,
        jsonMode: true,
        maxTokens: computeMaxTokensForQuestionCount(input.config.questionCount),
      }
    );
    input.options?.onStage?.("Validating…");
    const questions = parseQuestionsJson(res.content, input.config);
    if (!questions.length) throw new Error("AI returned no usable questions");
    input.options?.onStage?.("Finished.");
    return questions;
  }

  async improveQuestion(input: QuestionActionInput): Promise<AiGeneratedQuestion> {
    return refineQuestionJson(input.action, input.question, input.config, (s, u) =>
      this.complete([{ role: "system", content: s }, { role: "user", content: u }], { ...input.options, jsonMode: true }).then((r) => r.content)
    );
  }

  rewriteQuestion(input: QuestionActionInput) {
    return this.improveQuestion({ ...input, action: input.action || "Rewrite for clarity" });
  }
  generateHints(input: QuestionActionInput) {
    return this.improveQuestion({ ...input, action: "Add helpful hints without revealing the answer" });
  }
  generateExplanation(input: QuestionActionInput) {
    return this.improveQuestion({ ...input, action: "Write a clear correct-answer explanation" });
  }
  translate(input: QuestionActionInput & { language: string }) {
    return this.improveQuestion({ ...input, action: `Translate entire question to ${input.language}` });
  }
  generateSimilar(input: QuestionActionInput) {
    return this.improveQuestion({ ...input, action: "Generate a similar question on the same topic" });
  }
  generateCodingQuestion(input: QuestionActionInput) {
    return this.improveQuestion({ ...input, action: "Convert to a coding/programming question with code in markdown" });
  }
  generateCaseStudy(input: QuestionActionInput) {
    return this.improveQuestion({ ...input, action: "Convert to a scenario-based case study question" });
  }

  protected cfg(): ReturnType<typeof getAiRuntimeConfig> {
    return getAiRuntimeConfig();
  }

  protected track(result: AiCompletionResult, success: boolean) {
    recordAiRequest(result.durationMs, result.tokens, success);
  }
}
