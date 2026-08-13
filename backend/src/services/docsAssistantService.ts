import OpenAI from "openai";
import type { Response } from "express";
import { getPlatformSettings } from "./platformSettingsService.js";
import {
  hybridSearch,
  toAssistantSources,
  resolvePageContext,
  type AssistantSource,
  type PageContext,
} from "./docsHybridSearch.js";
import { buildConversationalAnswer } from "./docsAnswerBuilder.js";
import { detectIntents } from "./docsIntentService.js";
import { loadVectorIndex } from "./docsVectorStore.js";
import { logAssistantInteraction } from "./docsAssistantLogService.js";
import { formatNavBlockForAssistant } from "./platformNavigation.js";
import { logger } from "../utils/logger.js";

const USER_UNAVAILABLE_MSG =
  "I'm currently unavailable. Please try again later or search the documentation.";

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantResponse {
  answer: string;
  sources: AssistantSource[];
  relatedTopics: string[];
  followUpSuggestions: string[];
  fromFallback: boolean;
  usedAI: boolean;
  confidence: "high" | "medium" | "low";
}

const SYSTEM_PROMPT = `You are THE GATEHUB Assistant — the official intelligent guide for the entire platform (comparable to ChatGPT, Stripe Docs, or Notion AI).

STRICT RULES:
1. Understand USER INTENT, not just keywords. Diagnose problems (e.g. "cannot publish" → checklist: draft status, missing fields, permissions, validation).
2. Answer the ACTUAL question in the first sentence. Be conversational, concise, and actionable.
3. Use ONLY facts from the provided documentation excerpts and platform context. Never invent features or URLs.
4. Format answers clearly: numbered steps for how-to, bullets for lists, **bold** for UI labels, code blocks for commands.
5. When directing users somewhere, include clickable markdown links using exact paths from PLATFORM NAVIGATION when provided, e.g. [Instructor Dashboard](/instructor) or [Help Center](/help).
6. If the user is on a specific page (context provided), tailor the answer to that module first.
7. If the answer is not in the excerpts, say clearly you could not find it in official docs, then suggest related topics or where to look in Help Center.
8. Do NOT include a "Source:" line — sources are shown separately.
9. Use conversation history to resolve "it", "that", "this", and follow-ups.
10. For errors/troubleshooting, list the most likely causes first, then fixes.`;

function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

function isOpenAIQuotaOrAuthError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; message?: string };
  if (e.status === 429 || e.status === 401 || e.status === 403) return true;
  const msg = (e.message || "").toLowerCase();
  return msg.includes("quota") || msg.includes("rate limit") || msg.includes("billing");
}

function sanitizeFailureReason(err: unknown): string {
  if (!err || typeof err !== "object") return "unknown";
  const e = err as { status?: number };
  if (e.status === 429) return "quota_exceeded";
  if (e.status === 401 || e.status === 403) return "auth_error";
  if (e.status && e.status >= 500) return "server_error";
  return "openai_error";
}

function buildContextBlock(
  ranked: Awaited<ReturnType<typeof hybridSearch>>,
  pageContext?: PageContext & {
    area?: string;
    role?: string;
    hints?: string[];
    learning?: {
      universeId?: string;
      universeTitle?: string;
      lessonId?: string;
      lessonTitle?: string;
      stepId?: string | null;
      stepTitle?: string | null;
      stepKind?: string | null;
      progressPercent?: number;
    };
  },
  intents?: ReturnType<typeof detectIntents>,
  navBlock?: string,
): string {
  const parts: string[] = [];
  if (pageContext?.label) {
    parts.push(
      `Current page: ${pageContext.label} (${pageContext.pathname || ""})` +
        (pageContext.area ? ` | module: ${pageContext.area}` : "") +
        (pageContext.role ? ` | user role: ${pageContext.role}` : ""),
    );
  }
  if (pageContext?.learning?.lessonTitle) {
    const L = pageContext.learning;
    parts.push(
      [
        "STUDENT LEARNING CONTEXT (answer as a tutor for the active lesson; do not invent lesson text):",
        L.universeTitle ? `- Course: ${L.universeTitle}` : null,
        `- Lesson: ${L.lessonTitle}`,
        L.stepTitle ? `- Active step: ${L.stepTitle}${L.stepKind ? ` (${L.stepKind})` : ""}` : null,
        typeof L.progressPercent === "number" ? `- Lesson progress: ${L.progressPercent}%` : null,
        "- Prefer Socratic guidance, checkpoints, and study tips over rewriting entire chapters.",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  if (pageContext?.hints?.length) {
    parts.push(`Suggested topics for this page: ${pageContext.hints.join("; ")}`);
  }
  if (intents?.length) {
    parts.push(`Detected intent: ${intents.join(", ")}`);
  }
  if (navBlock) {
    parts.push(`PLATFORM NAVIGATION (use these paths for links):\n${navBlock}`);
  }
  parts.push(
    ranked
      .map((r, i) => `[${i + 1}] ${r.chunk.manual} > ${r.chunk.section}\n${r.chunk.content.slice(0, 1400)}`)
      .join("\n\n---\n\n"),
  );
  return parts.join("\n\n");
}

function buildHistoryMessages(history?: ChatHistoryMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  if (!history?.length) return [];
  return history.slice(-8).map((m) => ({
    role: m.role,
    content: m.content.slice(0, 1500),
  }));
}

async function generateWithOpenAI(
  question: string,
  context: string,
  model: string,
  history?: ChatHistoryMessage[],
): Promise<string> {
  const openai = getOpenAIClient();
  if (!openai) throw new Error("no_openai");

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: 900,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...buildHistoryMessages(history),
      {
        role: "user",
        content: `Documentation excerpts:\n\n${context}\n\n---\n\nUser question: ${question}`,
      },
    ],
  });

  const answer = completion.choices[0]?.message?.content?.trim();
  if (!answer) throw new Error("empty_response");
  return answer;
}

async function* generateWithOpenAIStream(
  question: string,
  context: string,
  model: string,
  history?: ChatHistoryMessage[],
): AsyncGenerator<string> {
  const openai = getOpenAIClient();
  if (!openai) throw new Error("no_openai");

  const stream = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: 900,
    stream: true,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...buildHistoryMessages(history),
      {
        role: "user",
        content: `Documentation excerpts:\n\n${context}\n\n---\n\nUser question: ${question}`,
      },
    ],
  });

  for await (const part of stream) {
    const token = part.choices[0]?.delta?.content;
    if (token) yield token;
  }
}

export interface AssistantOptions {
  pageContext?: PageContext & { area?: string; role?: string; hints?: string[] };
  history?: ChatHistoryMessage[];
}

function mergePageContext(
  input?: PageContext & { area?: string; role?: string; hints?: string[] },
): PageContext & { area?: string; role?: string; hints?: string[] } {
  if (!input?.pathname) return input || {};
  const resolved = resolvePageContext(input.pathname);
  return {
    ...resolved,
    ...input,
    label: input.label || resolved.label,
  };
}

export async function answerDocumentationQuestion(
  question: string,
  options?: AssistantOptions,
): Promise<AssistantResponse> {
  const start = Date.now();
  const pageContext = mergePageContext(options?.pageContext);
  const history = options?.history;
  const intents = detectIntents(question, history);
  const navBlock = formatNavBlockForAssistant(pageContext.role);

  const ranked = await hybridSearch(question, { limit: 8, pageContext, intents, history });
  const allChunks = ranked.map((r) => r.chunk);
  const conversational = buildConversationalAnswer(allChunks, question, history);
  const sources = toAssistantSources(conversational.sources.length ? conversational.sources : allChunks);

  if (allChunks.length === 0) {
    logAssistantInteraction({
      question,
      responseTimeMs: Date.now() - start,
      success: true,
      usedAI: false,
      usedFallback: true,
      pageContext: pageContext?.pathname,
      sources: [],
      failureReason: "no_chunks",
    });
    return {
      answer: conversational.answer,
      sources: [],
      relatedTopics: conversational.relatedTopics,
      followUpSuggestions: conversational.followUpSuggestions,
      fromFallback: true,
      usedAI: false,
      confidence: "low",
    };
  }

  const context = buildContextBlock(ranked, pageContext, intents, navBlock);
  const settings = await getPlatformSettings();
  const model = settings.aiModelName || "gpt-4o-mini";

  try {
    const answer = await generateWithOpenAI(question, context, model, history);
    logAssistantInteraction({
      question,
      responseTimeMs: Date.now() - start,
      success: true,
      usedAI: true,
      usedFallback: false,
      pageContext: pageContext?.pathname,
      sources: sources.map((s) => `${s.manual} > ${s.section}`),
    });
    return {
      answer,
      sources,
      relatedTopics: conversational.relatedTopics,
      followUpSuggestions: conversational.followUpSuggestions,
      fromFallback: false,
      usedAI: true,
      confidence: conversational.confidence,
    };
  } catch (err) {
    const reason = sanitizeFailureReason(err);
    logger.error("[docs-assistant] OpenAI failed, conversational fallback", { reason });

    logAssistantInteraction({
      question,
      responseTimeMs: Date.now() - start,
      success: true,
      usedAI: false,
      usedFallback: true,
      failureReason: reason,
      pageContext: pageContext?.pathname,
      sources: sources.map((s) => `${s.manual} > ${s.section}`),
    });

    return {
      answer: conversational.answer || USER_UNAVAILABLE_MSG,
      sources,
      relatedTopics: conversational.relatedTopics,
      followUpSuggestions: conversational.followUpSuggestions,
      fromFallback: true,
      usedAI: false,
      confidence: conversational.confidence,
    };
  }
}

export async function streamDocumentationAnswer(
  question: string,
  res: Response,
  options?: AssistantOptions,
): Promise<void> {
  const start = Date.now();
  const pageContext = mergePageContext(options?.pageContext);
  const history = options?.history;
  const intents = detectIntents(question, history);
  const navBlock = formatNavBlockForAssistant(pageContext.role);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (payload: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  send({ type: "thinking", intents });

  const ranked = await hybridSearch(question, { limit: 8, pageContext, intents, history });
  const allChunks = ranked.map((r) => r.chunk);
  const conversational = buildConversationalAnswer(allChunks, question, history);
  const sources = toAssistantSources(conversational.sources.length ? conversational.sources : allChunks);

  if (allChunks.length === 0) {
    send({
      type: "done",
      answer: conversational.answer,
      sources: [],
      relatedTopics: conversational.relatedTopics,
      followUpSuggestions: conversational.followUpSuggestions,
      fromFallback: true,
      confidence: "low",
    });
    logAssistantInteraction({
      question,
      responseTimeMs: Date.now() - start,
      success: true,
      usedAI: false,
      usedFallback: true,
      pageContext: pageContext?.pathname,
      sources: [],
    });
    res.end();
    return;
  }

  const context = buildContextBlock(ranked, pageContext, intents, navBlock);
  const settings = await getPlatformSettings();
  const model = settings.aiModelName || "gpt-4o-mini";

  let fullAnswer = "";
  let usedAI = false;
  let fromFallback = false;

  try {
    if (!getOpenAIClient()) throw new Error("no_openai");
    send({ type: "start" });
    for await (const token of generateWithOpenAIStream(question, context, model, history)) {
      fullAnswer += token;
      send({ type: "token", content: token });
    }
    usedAI = true;
  } catch (err) {
    fromFallback = true;
    fullAnswer = conversational.answer;
    logger.error("[docs-assistant] Stream fallback", { reason: sanitizeFailureReason(err) });
    send({ type: "start" });
    const words = fullAnswer.split(/(\s+)/);
    for (const w of words) {
      send({ type: "token", content: w });
      await new Promise((r) => setTimeout(r, 6));
    }
  }

  send({
    type: "done",
    answer: fullAnswer,
    sources,
    relatedTopics: conversational.relatedTopics,
    followUpSuggestions: conversational.followUpSuggestions,
    fromFallback,
    usedAI,
    confidence: conversational.confidence,
  });

  logAssistantInteraction({
    question,
    responseTimeMs: Date.now() - start,
    success: true,
    usedAI,
    usedFallback: fromFallback,
    failureReason: fromFallback ? "stream_fallback" : undefined,
    pageContext: pageContext?.pathname,
    sources: sources.map((s) => `${s.manual} > ${s.section}`),
  });

  res.end();
}

export async function ensureDocIndexLoaded(): Promise<void> {
  const index = loadVectorIndex();
  if (!index) {
    logger.warn("[docs-assistant] No vector index found. Run: npm run build-doc-index");
  } else {
    logger.info(`[docs-assistant] Vector index loaded (${index.chunks.length} chunks, built ${index.builtAt})`);
  }
}
