import type { DocChunk } from "./docsIndexService.js";
import type { DocIntent } from "./docsIntentService.js";
import { detectIntents, getRelatedTopics, getFollowUpSuggestions, intentBoostForChunk } from "./docsIntentService.js";

export interface ConversationalAnswer {
  answer: string;
  sources: DocChunk[];
  relatedTopics: string[];
  followUpSuggestions: string[];
  confidence: "high" | "medium" | "low";
}

function extractSteps(content: string): string[] {
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  const steps: string[] = [];
  for (const line of lines) {
    const numbered = /^(\d+)\.\s+(.+)$/.exec(line);
    if (numbered) {
      steps.push(numbered[2].replace(/\*\*/g, ""));
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) steps.push(bullet[1].replace(/\*\*/g, ""));
  }
  return steps;
}

function extractProse(content: string): string {
  return content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !/^[-*\d]/.test(l))
    .join(" ")
    .replace(/\*\*/g, "")
    .slice(0, 500);
}

function scoreChunkForQuestion(chunk: DocChunk, question: string, intents: DocIntent[]): number {
  const q = question.toLowerCase();
  const text = `${chunk.section} ${chunk.content}`.toLowerCase();
  let score = 0;

  if (text.includes(q)) score += 10;
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  for (const w of words) {
    if (text.includes(w)) score += 2;
  }

  for (const intent of intents) {
    score += intentBoostForChunk(intent, chunk.manual, chunk.section, chunk.content, chunk.slug) * 10;
  }

  // Penalize unrelated FAQ questions when query is specific
  if (chunk.manual === "FAQ" && chunk.section.toLowerCase() !== q) {
    const overlap = words.filter((w) => chunk.section.toLowerCase().includes(w)).length;
    if (overlap < 2 && intents[0] !== "GENERAL") score -= 3;
  }

  return score;
}

function pickBestChunks(chunks: DocChunk[], question: string, intents: DocIntent[], limit = 3): DocChunk[] {
  return [...chunks]
    .map((chunk) => ({ chunk, score: scoreChunkForQuestion(chunk, question, intents) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.chunk);
}

function formatLoginAnswer(chunks: DocChunk[]): string {
  const loginChunk =
    chunks.find((c) => /logging in|login issues|create an account/i.test(`${c.section} ${c.content}`)) ||
    chunks[0];

  const steps = extractSteps(loginChunk.content);
  let body = "**To log in to THE GATEHUB:**\n\n";

  if (steps.length >= 2) {
    body += steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  } else {
    body += "1. Click **Login** in the top-right corner of the site.\n";
    body += "2. Enter your registered email and password.\n";
    body += "3. Click **Sign In**.\n";
  }

  const troubleshooting = chunks.find((c) => c.section.toLowerCase().includes("login"));
  if (troubleshooting && troubleshooting.id !== loginChunk.id) {
    const tips = extractSteps(troubleshooting.content);
    if (tips.length) {
      body += "\n\n**Having trouble?**\n";
      body += tips.map((t) => `- ${t}`).join("\n");
    }
  }

  body += "\n\n**New user?** Click **Sign Up** on the landing page, register, then log in.";
  body += "\n\n**Forgot password?** Use **Forgot Password** on the login page to reset via email.";

  return body;
}

function formatDirectAnswer(question: string, primary: DocChunk, supporting: DocChunk[]): string {
  const intents = detectIntents(question);
  const steps = extractSteps(primary.content);
  const prose = extractProse(primary.content);

  let body = "";

  if (intents.includes("LOGIN")) {
    return formatLoginAnswer([primary, ...supporting]);
  }

  if (steps.length >= 2) {
    const title = question.replace(/\?+$/, "").trim();
    const heading = title.length < 80 ? `**${title.charAt(0).toUpperCase() + title.slice(1)}:**` : "**Here's how:**";
    body = `${heading}\n\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
  } else if (prose) {
    body = prose;
    if (primary.content.length > 500) body += "…";
  } else {
    body = primary.content.slice(0, 600).replace(/\*\*/g, "");
    if (primary.content.length > 600) body += "…";
  }

  // Quiz follow-up: multiple correct answers
  if (/multiple correct|more than one answer/i.test(question) && /quiz/i.test(`${primary.section} ${primary.content}`)) {
    body += "\n\nYes — in Visual Studio you can configure **multiple choice** questions with multiple correct answers. In Academic Studio, use the `\\quiz` block with multiple `\\correct` options.";
  }

  return body;
}

export function buildConversationalAnswer(
  chunks: DocChunk[],
  question: string,
  history?: Array<{ role: string; content: string }>,
): ConversationalAnswer {
  const intents = detectIntents(question, history);
  const relatedTopics = getRelatedTopics(intents);
  const followUpSuggestions = getFollowUpSuggestions(intents);

  if (chunks.length === 0) {
    return {
      answer:
        "I could not find an exact answer in THE GATEHUB documentation.\n\nTry browsing the [Help Center](/help) or rephrasing your question. You can also check the FAQ and Troubleshooting guides.",
      sources: [],
      relatedTopics,
      followUpSuggestions,
      confidence: "low",
    };
  }

  const ranked = pickBestChunks(chunks, question, intents, 4);
  const primary = ranked[0];
  const supporting = ranked.slice(1);
  const topScore = scoreChunkForQuestion(primary, question, intents);

  if (topScore < 2) {
    return {
      answer:
        "I could not find an exact answer in THE GATEHUB documentation.\n\nHere are the closest topics I found — select a source below for details.",
      sources: ranked,
      relatedTopics,
      followUpSuggestions,
      confidence: "low",
    };
  }

  const answer = formatDirectAnswer(question, primary, supporting);
  const confidence: ConversationalAnswer["confidence"] =
    topScore >= 8 ? "high" : topScore >= 4 ? "medium" : "low";

  return {
    answer,
    sources: ranked.slice(0, 3),
    relatedTopics,
    followUpSuggestions,
    confidence,
  };
}

/** @deprecated */
export function buildExcerptAnswer(chunks: DocChunk[], question: string): string {
  return buildConversationalAnswer(chunks, question).answer;
}
