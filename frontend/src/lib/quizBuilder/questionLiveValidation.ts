import type { QuizQuestion } from "./types";

export interface LiveValidationIssue {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
}

const URL_RE = /https?:\/\/[^\s)]+/gi;
const YOUTUBE_RE = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/i;
const LATEX_BLOCK = /\$\$[\s\S]*?\$\$|\$[^$\n]+\$/;
const MERMAID_BLOCK = /```mermaid[\s\S]*?```/i;
const IMG_MD = /!\[[^\]]*\]\(([^)]+)\)/g;

export function validateQuestionLive(q: QuizQuestion): LiveValidationIssue[] {
  const issues: LiveValidationIssue[] = [];
  const meta = q.metadata as Record<string, unknown>;

  if (!q.text?.trim()) {
    issues.push({ level: "error", code: "EMPTY_STEM", message: "Question text is empty" });
  }

  if (q.marks == null || Number.isNaN(Number(q.marks)) || Number(q.marks) < 0) {
    issues.push({ level: "error", code: "INVALID_MARKS", message: "Marks must be 0 or greater" });
  }
  if (Number(q.marks) === 0) {
    issues.push({ level: "warning", code: "ZERO_MARKS", message: "This question is worth 0 marks" });
  }

  const choiceTypes = ["multiple_choice", "multiple_select", "true_false", "poll", "image_based"];
  if (choiceTypes.includes(q.type)) {
    const filled = q.options.filter((o) => o.text.trim());
    if (filled.length < 2) {
      issues.push({ level: "error", code: "FEW_OPTIONS", message: "Add at least 2 options" });
    }
    const texts = filled.map((o) => o.text.trim().toLowerCase());
    if (new Set(texts).size !== texts.length) {
      issues.push({ level: "warning", code: "DUPLICATE_OPTION", message: "Duplicate option text detected" });
    }
    if (q.type !== "poll" && !q.options.some((o) => o.isCorrect && o.text.trim())) {
      issues.push({ level: "error", code: "NO_ANSWER", message: "Mark a correct answer" });
    }
  }

  if (!q.explanation?.trim()) {
    issues.push({ level: "warning", code: "NO_EXPLANATION", message: "Add an explanation for students" });
  }
  if (!q.hints?.length) {
    issues.push({ level: "info", code: "NO_HINTS", message: "Hints help struggling learners" });
  }

  const urls: string[] = [...(q.text.match(URL_RE) || [])];
  const mediaUrl = String(meta.mediaUrl || "");
  if (mediaUrl) urls.push(mediaUrl);

  for (const url of urls) {
    if (url.includes("broken") || url.endsWith("//")) {
      issues.push({ level: "error", code: "BROKEN_URL", message: `Check URL: ${url.slice(0, 40)}…` });
    }
    if (url.includes("youtube") && !YOUTUBE_RE.test(url)) {
      issues.push({ level: "warning", code: "INVALID_YOUTUBE", message: "YouTube link may be invalid" });
    }
  }

  let m: RegExpExecArray | null;
  const imgRe = new RegExp(IMG_MD.source, "g");
  while ((m = imgRe.exec(q.text)) !== null) {
    const src = m[1]?.trim();
    if (!src || src === "#" || src.startsWith("broken")) {
      issues.push({ level: "error", code: "BROKEN_IMAGE", message: "Broken image reference in stem" });
    }
  }

  if (LATEX_BLOCK.test(q.text)) {
    const bad = q.text.match(/\$[^$\n]*\\[^a-zA-Z][^$\n]*\$/);
    if (bad) {
      issues.push({ level: "warning", code: "LATEX", message: "LaTeX may need review" });
    }
  }

  if (MERMAID_BLOCK.test(q.text)) {
    const block = q.text.match(/```mermaid([\s\S]*?)```/i)?.[1]?.trim();
    if (!block || block.length < 3) {
      issues.push({ level: "warning", code: "MERMAID", message: "Mermaid diagram is empty" });
    }
  }

  const codingTypes = ["coding", "debugging", "predict_output", "sql"];
  if (codingTypes.includes(q.type) && !String(meta.starterCode || "").trim()) {
    issues.push({ level: "warning", code: "NO_CODE", message: "Add starter code for coding question" });
  }

  if (q.type === "numerical" && !String(meta.numericAnswer ?? "").trim()) {
    issues.push({ level: "error", code: "NO_NUMERIC", message: "Set the numeric answer" });
  }

  if (q.type === "hotspot") {
    const hotspots = (meta.hotspots as Array<{ label: string }>) || [];
    if (!String(meta.mediaUrl || "").trim()) {
      issues.push({ level: "error", code: "NO_HOTSPOT_IMAGE", message: "Add a background image" });
    }
    if (!String(meta.correctHotspot || "").trim()) {
      issues.push({ level: "warning", code: "NO_HOTSPOT_ANSWER", message: "Select the correct hotspot region" });
    }
    if (hotspots.length === 0) {
      issues.push({ level: "error", code: "NO_HOTSPOTS", message: "Add at least one hotspot region" });
    }
  }

  if (q.type === "ordering" || q.type === "sequence") {
    const filled = q.options.filter((o) => o.text.trim());
    if (filled.length < 2) {
      issues.push({ level: "error", code: "FEW_ORDER_ITEMS", message: "Add at least 2 items to order" });
    }
  }

  if (q.type === "matching" || q.type === "matrix") {
    if (q.options.length < 4 || q.options.length % 2 !== 0) {
      issues.push({ level: "error", code: "INCOMPLETE_PAIRS", message: "Add complete left/right pairs" });
    }
  }

  const est = q.estimatedSeconds || 45;
  if (est < 10) issues.push({ level: "warning", code: "TIME_LOW", message: "Estimated time seems very short" });
  if (est > 600) issues.push({ level: "warning", code: "TIME_HIGH", message: "Estimated time exceeds 10 minutes" });

  return issues;
}

export function questionStatus(q: QuizQuestion, issues: LiveValidationIssue[]): string {
  const meta = q.metadata as Record<string, unknown>;
  if (meta.importSource) return "imported";
  if (meta.aiGenerated) return "ai";
  if (issues.some((i) => i.level === "error")) return "needs_review";
  if (q.text.trim() && !issues.some((i) => i.level === "error")) return "complete";
  return "draft";
}
