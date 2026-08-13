import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, "../../logs");
const ASSISTANT_LOG = path.join(LOG_DIR, "docs-assistant.jsonl");

export interface AssistantLogEntry {
  timestamp: string;
  question: string;
  responseTimeMs: number;
  success: boolean;
  usedAI: boolean;
  usedFallback: boolean;
  failureReason?: string;
  pageContext?: string;
  sources: string[];
  topicKeys: string[];
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function extractTopics(question: string, sources: string[]): string[] {
  const topics = new Set<string>();
  const q = question.toLowerCase();
  const topicPatterns: Record<string, RegExp> = {
    quiz: /quiz|assessment|mcq/i,
    certificate: /certif/i,
    project: /project|github|colab/i,
    course: /course|curriculum/i,
    "learning-universe": /learning universe|lu\b/i,
    visual: /visual studio|visual authoring/i,
    academic: /academic|dsl|latex/i,
    payment: /payment|razorpay|stripe/i,
    admin: /admin|user management/i,
    student: /student|enroll/i,
  };
  for (const [key, re] of Object.entries(topicPatterns)) {
    if (re.test(q)) topics.add(key);
  }
  for (const s of sources) {
    const lower = s.toLowerCase();
    if (lower.includes("certificate")) topics.add("certificate");
    if (lower.includes("quiz")) topics.add("quiz");
    if (lower.includes("project")) topics.add("project");
  }
  return [...topics];
}

export function logAssistantInteraction(entry: Omit<AssistantLogEntry, "timestamp" | "topicKeys">) {
  try {
    ensureLogDir();
    const full: AssistantLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      topicKeys: extractTopics(entry.question, entry.sources),
    };
    fs.appendFileSync(ASSISTANT_LOG, JSON.stringify(full) + "\n");
    logger.info("[docs-assistant]", {
      success: full.success,
      usedAI: full.usedAI,
      usedFallback: full.usedFallback,
      responseTimeMs: full.responseTimeMs,
      topics: full.topicKeys,
    });
  } catch (err) {
    logger.warn("[docs-assistant] Failed to write log", { err });
  }
}

export function getAssistantLogSummary(): {
  totalQuestions: number;
  failedRequests: number;
  avgResponseTimeMs: number;
  topTopics: Array<{ topic: string; count: number }>;
} {
  if (!fs.existsSync(ASSISTANT_LOG)) {
    return { totalQuestions: 0, failedRequests: 0, avgResponseTimeMs: 0, topTopics: [] };
  }
  const lines = fs.readFileSync(ASSISTANT_LOG, "utf-8").trim().split("\n").filter(Boolean);
  const topicCounts = new Map<string, number>();
  let failed = 0;
  let totalMs = 0;
  for (const line of lines) {
    try {
      const e = JSON.parse(line) as AssistantLogEntry;
      totalMs += e.responseTimeMs;
      if (!e.success) failed++;
      for (const t of e.topicKeys) topicCounts.set(t, (topicCounts.get(t) || 0) + 1);
    } catch { /* skip */ }
  }
  const topTopics = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }));
  return {
    totalQuestions: lines.length,
    failedRequests: failed,
    avgResponseTimeMs: lines.length ? Math.round(totalMs / lines.length) : 0,
    topTopics,
  };
}
