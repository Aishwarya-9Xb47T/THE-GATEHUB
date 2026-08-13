import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DOCS_DIR = path.join(__dirname, "../../content/docs");

export interface DocChunk {
  id: string;
  manual: string;
  section: string;
  content: string;
  slug: string;
  sectionId: string;
}

export const MANUAL_MAP: Record<string, { file: string; title: string; slug: string }> = {
  "getting-started": { file: "getting-started.md", title: "Getting Started", slug: "getting-started" },
  student: { file: "student-manual.md", title: "Student Manual", slug: "student" },
  instructor: { file: "instructor-manual.md", title: "Instructor Manual", slug: "instructor" },
  admin: { file: "admin-manual.md", title: "Admin Manual", slug: "admin" },
  faq: { file: "faq.md", title: "FAQ", slug: "faq" },
  troubleshooting: { file: "troubleshooting.md", title: "Troubleshooting", slug: "troubleshooting" },
  "release-notes": { file: "release-notes.md", title: "Release Notes", slug: "release-notes" },
  integrations: { file: "integrations-guide.md", title: "Integrations Guide", slug: "integrations" },
  "learning-universe": { file: "learning-universe-guide.md", title: "Learning Universe Guide", slug: "learning-universe" },
  "coding-lab": { file: "coding-lab-guide.md", title: "Coding Lab Guide", slug: "coding-lab" },
  research: { file: "research-workspace-guide.md", title: "Research Workspace Guide", slug: "research" },
  publishing: { file: "publishing-guide.md", title: "Publishing Guide", slug: "publishing" },
  "ai-assistant": { file: "ai-assistant-guide.md", title: "AI Assistant Guide", slug: "ai-assistant" },
};

/** Manuals the assistant may cite (excludes getting-started). */
export const ASSISTANT_MANUAL_SLUGS = new Set(Object.keys(MANUAL_MAP));

let cachedChunks: DocChunk[] | null = null;

export function sectionToId(section: string): string {
  return section.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function chunkToHref(chunk: DocChunk): string {
  return `/help/${chunk.slug}#${chunk.sectionId}`;
}

export function loadMarkdown(filename: string): string {
  const p = path.join(DOCS_DIR, filename);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf-8");
}

export function indexDocumentation(force = false): DocChunk[] {
  if (cachedChunks && !force) return cachedChunks;

  const chunks: DocChunk[] = [];

  for (const meta of Object.values(MANUAL_MAP)) {
    const md = loadMarkdown(meta.file);
    if (!md) continue;

    let section = meta.title;
    let buffer: string[] = [];

    const flush = () => {
      const text = buffer.join("\n").trim();
      if (!text) return;
      chunks.push({
        id: `${meta.slug}-${sectionToId(section)}`,
        manual: meta.title,
        section,
        content: text,
        slug: meta.slug,
        sectionId: sectionToId(section),
      });
      buffer = [];
    };

    for (const line of md.split("\n")) {
      if (line.startsWith("## ")) {
        flush();
        section = line.slice(3).trim();
      } else if (line.startsWith("### ")) {
        flush();
        section = line.slice(4).trim();
      } else {
        buffer.push(line);
      }
    }
    flush();
  }

  cachedChunks = chunks;
  return chunks;
}

export function keywordSearchChunks(query: string, limit = 10): Array<{ chunk: DocChunk; score: number }> {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const words = expandQueryTerms(q);

  return indexDocumentation()
    .map((chunk) => {
      const text = `${chunk.manual} ${chunk.section} ${chunk.content}`.toLowerCase();
      let score = 0;
      if (text.includes(q)) score += 8;
      for (const w of words) {
        if (text.includes(w)) score += 1;
      }
      return { chunk, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** @deprecated use hybridSearch from docsHybridSearch */
export function searchChunks(query: string, limit = 5): DocChunk[] {
  return keywordSearchChunks(query, limit).map((r) => r.chunk);
}

const QUERY_SYNONYMS: Record<string, string[]> = {
  certificate: ["certificates", "credential", "certification", "badge"],
  earn: ["get", "receive", "obtain", "download"],
  quiz: ["quizzes", "assessment", "test", "mcq"],
  project: ["projects", "submission", "github", "colab", "workspace"],
  publish: ["publishing", "published", "live", "deploy"],
  course: ["courses", "curriculum", "class"],
  student: ["students", "learner", "enrollment"],
  instructor: ["teacher", "creator", "author"],
  visual: ["visual studio", "authoring studio", "drag", "builder"],
  academic: ["dsl", "latex", "academic studio", "main.tex"],
  admin: ["administrator", "platform", "management"],
};

export function expandQueryTerms(query: string): string[] {
  const base = query.split(/\s+/).filter(Boolean);
  const expanded = new Set(base);
  for (const word of base) {
    const syns = QUERY_SYNONYMS[word];
    if (syns) syns.forEach((s) => expanded.add(s));
  }
  return [...expanded];
}

export function getManualMarkdown(manual: string): string | null {
  const meta = MANUAL_MAP[manual];
  if (!meta) return null;
  const md = loadMarkdown(meta.file);
  return md || null;
}

export function listManuals() {
  return Object.entries(MANUAL_MAP).map(([key, meta]) => ({
    key,
    title: meta.title,
    slug: meta.slug,
  }));
}

export function invalidateChunkCache() {
  cachedChunks = null;
}
