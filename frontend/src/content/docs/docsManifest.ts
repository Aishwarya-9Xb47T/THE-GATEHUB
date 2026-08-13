import gettingStarted from "./getting-started.md?raw";
import studentManual from "./student-manual.md?raw";
import instructorManual from "./instructor-manual.md?raw";
import adminManual from "./admin-manual.md?raw";
import faq from "./faq.md?raw";
import troubleshooting from "./troubleshooting.md?raw";
import releaseNotes from "./release-notes.md?raw";
import integrationsGuide from "./integrations-guide.md?raw";
import learningUniverseGuide from "./learning-universe-guide.md?raw";
import codingLabGuide from "./coding-lab-guide.md?raw";
import researchGuide from "./research-workspace-guide.md?raw";
import publishingGuide from "./publishing-guide.md?raw";
import aiAssistantGuide from "./ai-assistant-guide.md?raw";

export type DocAudience = "all" | "student" | "instructor" | "admin";

export type DocDifficulty = "Beginner" | "Intermediate" | "Advanced";

export interface DocPage {
  id: string;
  slug: string;
  title: string;
  description: string;
  audience: DocAudience;
  manual: string;
  content: string;
  order: number;
  author?: string;
  lastUpdated?: string;
  version?: string;
  difficulty?: DocDifficulty;
}

export interface DocNavGroup {
  id: string;
  label: string;
  items: { slug: string; label: string; audience?: DocAudience }[];
}

export const DOC_PAGES: DocPage[] = [
  {
    id: "getting-started",
    slug: "getting-started",
    title: "Getting Started",
    description: "Quick start for students, instructors, and admins",
    audience: "all",
    manual: "Getting Started",
    content: gettingStarted,
    order: 0,
  },
  {
    id: "student-manual",
    slug: "student",
    title: "Student Manual",
    description: "Complete guide for students",
    audience: "student",
    manual: "Student Manual",
    content: studentManual,
    order: 1,
  },
  {
    id: "instructor-manual",
    slug: "instructor",
    title: "Instructor Manual",
    description: "Course creation, authoring studios, analytics",
    audience: "instructor",
    manual: "Instructor Manual",
    content: instructorManual,
    order: 2,
  },
  {
    id: "admin-manual",
    slug: "admin",
    title: "Admin Manual",
    description: "Platform management and configuration",
    audience: "admin",
    manual: "Admin Manual",
    content: adminManual,
    order: 3,
  },
  {
    id: "faq",
    slug: "faq",
    title: "FAQ",
    description: "Frequently asked questions",
    audience: "all",
    manual: "FAQ",
    content: faq,
    order: 4,
  },
  {
    id: "troubleshooting",
    slug: "troubleshooting",
    title: "Troubleshooting",
    description: "Common issues and fixes",
    audience: "all",
    manual: "Troubleshooting",
    content: troubleshooting,
    order: 5,
  },
  {
    id: "release-notes",
    slug: "release-notes",
    title: "Release Notes",
    description: "Platform updates and changelog",
    audience: "all",
    manual: "Release Notes",
    content: releaseNotes,
    order: 6,
  },
  {
    id: "integrations",
    slug: "integrations",
    title: "Integrations Guide",
    description: "Google Colab, Overleaf, Google Drive",
    audience: "all",
    manual: "Integrations",
    content: integrationsGuide,
    order: 7,
  },
  {
    id: "learning-universe",
    slug: "learning-universe",
    title: "Learning Universe Guide",
    description: "Tracks, modules, lessons, checkpoints",
    audience: "all",
    manual: "Learning Universe",
    content: learningUniverseGuide,
    order: 8,
  },
  {
    id: "coding-lab",
    slug: "coding-lab",
    title: "Coding Lab Guide",
    description: "Run code, Colab, and submissions",
    audience: "all",
    manual: "Coding Lab",
    content: codingLabGuide,
    order: 9,
  },
  {
    id: "research",
    slug: "research",
    title: "Research Workspace Guide",
    description: "LaTeX papers and Overleaf",
    audience: "all",
    manual: "Research",
    content: researchGuide,
    order: 10,
  },
  {
    id: "publishing",
    slug: "publishing",
    title: "Publishing Guide",
    description: "Publish courses and learning universes",
    audience: "instructor",
    manual: "Publishing",
    content: publishingGuide,
    order: 11,
  },
  {
    id: "ai-assistant",
    slug: "ai-assistant",
    title: "AI Assistant Guide",
    description: "Use THE GATEHUB intelligent assistant",
    audience: "all",
    manual: "AI Assistant",
    content: aiAssistantGuide,
    order: 12,
  },
];

export const DOC_NAV: DocNavGroup[] = [
  {
    id: "start",
    label: "Getting Started",
    items: [{ slug: "getting-started", label: "Getting Started" }],
  },
  {
    id: "manuals",
    label: "Manuals",
    items: [
      { slug: "student", label: "Student Manual", audience: "student" },
      { slug: "instructor", label: "Instructor Manual", audience: "instructor" },
      { slug: "admin", label: "Admin Manual", audience: "admin" },
    ],
  },
  {
    id: "guides",
    label: "Product Guides",
    items: [
      { slug: "learning-universe", label: "Learning Universe" },
      { slug: "coding-lab", label: "Coding Lab" },
      { slug: "research", label: "Research Workspace" },
      { slug: "integrations", label: "Integrations" },
      { slug: "publishing", label: "Publishing", audience: "instructor" },
      { slug: "ai-assistant", label: "AI Assistant" },
    ],
  },
  {
    id: "support",
    label: "Support",
    items: [
      { slug: "faq", label: "FAQ" },
      { slug: "troubleshooting", label: "Troubleshooting" },
      { slug: "release-notes", label: "Release Notes" },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    items: [
      { slug: "search", label: "Search Documentation" },
    ],
  },
];

export function getDocBySlug(slug: string): DocPage | undefined {
  return DOC_PAGES.find((p) => p.slug === slug);
}

export interface TocItem {
  id: string;
  title: string;
  level: number;
}

export function parseToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  markdown.split("\n").forEach((line) => {
    const m = /^(#{2,3})\s+(.+)$/.exec(line);
    if (!m) return;
    const title = m[2].trim();
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    items.push({ id, title, level: m[1].length });
  });
  return items;
}

export interface SearchResult {
  page: DocPage;
  snippet: string;
  score: number;
}

export function searchDocs(query: string, audience?: DocAudience): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return DOC_PAGES
    .filter((p) => !audience || audience === "all" || p.audience === "all" || p.audience === audience)
    .map((page) => {
      const lower = page.content.toLowerCase();
      const titleMatch = page.title.toLowerCase().includes(q) ? 10 : 0;
      const idx = lower.indexOf(q);
      if (idx < 0 && titleMatch === 0) return null;
      const start = Math.max(0, idx - 40);
      const snippet = idx >= 0
        ? page.content.slice(start, start + 120).replace(/\n/g, " ")
        : page.description;
      const score = titleMatch + (idx >= 0 ? 5 : 0) + (lower.split(q).length - 1);
      return { page, snippet, score };
    })
    .filter((r): r is SearchResult => r !== null)
    .sort((a, b) => b.score - a.score);
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export function parseFaqItems(): FaqItem[] {
  const page = getDocBySlug("faq");
  if (!page) return [];

  const items: FaqItem[] = [];
  let category = "General";
  const lines = page.content.split("\n");
  let currentQ = "";
  let currentA: string[] = [];

  const flush = () => {
    if (currentQ) {
      items.push({
        id: currentQ.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        question: currentQ,
        answer: currentA.join("\n").trim(),
        category,
      });
    }
    currentQ = "";
    currentA = [];
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      category = line.slice(3).trim();
    } else if (line.startsWith("### ")) {
      flush();
      currentQ = line.slice(4).trim();
    } else if (currentQ) {
      currentA.push(line);
    }
  }
  flush();
  return items;
}

export const FAQ_CATEGORIES = [
  "Student", "Instructor", "Admin", "Certificates", "Projects", "Payments", "Courses", "Learning Universe",
];

export function getAdjacentPages(slug: string): { prev?: DocPage; next?: DocPage } {
  const idx = DOC_PAGES.findIndex((p) => p.slug === slug);
  if (idx < 0) return {};
  return {
    prev: idx > 0 ? DOC_PAGES[idx - 1] : undefined,
    next: idx < DOC_PAGES.length - 1 ? DOC_PAGES[idx + 1] : undefined,
  };
}

/** Related articles by manual group and shared keywords in title/description */
export function getRelatedPages(slug: string, limit = 4): DocPage[] {
  const current = getDocBySlug(slug);
  if (!current) return [];

  const keywords = `${current.title} ${current.description} ${current.manual}`.toLowerCase().split(/\W+/).filter((w) => w.length > 3);

  return DOC_PAGES.filter((p) => p.slug !== slug)
    .map((p) => {
      let score = 0;
      if (p.manual === current.manual) score += 5;
      if (p.audience === current.audience || p.audience === "all" || current.audience === "all") score += 2;
      const blob = `${p.title} ${p.description}`.toLowerCase();
      for (const kw of keywords) {
        if (blob.includes(kw)) score += 1;
      }
      return { p, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ p }) => p);
}

/** ~200 words/min reading speed */
export function estimateReadingMinutes(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export interface DocMeta {
  author: string;
  lastUpdated: string;
  version: string;
  difficulty: DocDifficulty;
  category: string;
}

export function getDocMeta(page: DocPage): DocMeta {
  const difficulty: DocDifficulty =
    page.difficulty ??
    (page.audience === "admin" ? "Advanced" : page.audience === "instructor" ? "Intermediate" : "Beginner");

  return {
    author: page.author ?? "THE GATEHUB Team",
    lastUpdated: page.lastUpdated ?? "June 2025",
    version: page.version ?? "1.0",
    difficulty,
    category: page.manual,
  };
}
