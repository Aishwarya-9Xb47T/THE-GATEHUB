/**
 * V6 — Factual verification helpers (hallucination prevention).
 */
import { isLikelyFakeUrl } from "../externalResearchApis.js";

const PLACEHOLDER_PATTERNS = [
  /your (code|solution|implementation) here/i,
  /lorem ipsum/i,
  /example\.com/i,
  /placeholder/i,
  /TODO|TBD|FIXME/i,
  /researcher a|research team|expert author/i,
];

export function hasPlaceholderContent(text: string): boolean {
  return PLACEHOLDER_PATTERNS.some((p) => p.test(text));
}

export function verifyUrl(url?: string): boolean {
  if (!url) return false;
  if (isLikelyFakeUrl(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function verifyPackageName(name: string): boolean {
  return /^[@a-z0-9][\w.\-/]*$/i.test(name.trim()) && name.length >= 2;
}

export function verifyApiIdentifier(name: string): boolean {
  return /^[a-zA-Z_][\w.]*$/.test(name.trim()) && !/^(foo|bar|baz|example)$/i.test(name);
}

export interface FactualCheckResult {
  passed: boolean;
  failures: string[];
  confidence: number;
}

export function verifyLessonFactualSurface(lesson: {
  theory?: string;
  codeExample?: string;
  researchPapers?: Array<{ title?: string; url?: string; authors?: string }>;
  lessonReferences?: Array<{ title?: string; url?: string }>;
  videos?: Array<{ title?: string; url?: string }>;
}): FactualCheckResult {
  const failures: string[] = [];

  if (lesson.theory && hasPlaceholderContent(lesson.theory)) {
    failures.push("Theory contains placeholder or unverified content");
  }
  if (lesson.codeExample && hasPlaceholderContent(lesson.codeExample)) {
    failures.push("Code example contains placeholder stubs");
  }

  for (const paper of lesson.researchPapers ?? []) {
    if (paper.url && !verifyUrl(paper.url)) failures.push(`Research paper URL invalid: ${paper.title}`);
    if (paper.authors && /researcher a|research team/i.test(paper.authors)) {
      failures.push(`Research paper authors unverified: ${paper.title}`);
    }
  }

  for (const ref of lesson.lessonReferences ?? []) {
    if (ref.url && !verifyUrl(ref.url)) failures.push(`Reference URL invalid: ${ref.title}`);
  }

  for (const video of lesson.videos ?? []) {
    if (video.url && isLikelyFakeUrl(video.url) && !video.url.includes("youtube.com")) {
      failures.push(`Video URL suspicious: ${video.title}`);
    }
  }

  const confidence = Math.max(0, 1 - failures.length * 0.12);
  return { passed: failures.length === 0, failures, confidence };
}
