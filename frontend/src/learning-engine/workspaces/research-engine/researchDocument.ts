import type { LearnerExperienceStep } from "../../types";
import type { ProjectFile, ResearchDocument } from "./types";
import { createFile } from "./types";
import { sanitizeAiPayloadToLatex } from "@/lib/latex/latexSanitizer";
import { validateAndRepairLatex } from "@/lib/latex/latexValidator";

function migrateLegacyFile(raw: Record<string, unknown>): ProjectFile {
  const name = String(raw.name ?? "untitled.tex");
  const now = new Date().toISOString();
  return {
    fileId: String(raw.id ?? raw.fileId ?? `file-${crypto.randomUUID()}`),
    name,
    path: String(raw.path ?? name),
    content: String(raw.content ?? ""),
    kind: (raw.kind as ProjectFile["kind"]) ?? (name.endsWith(".bib") ? "bib" : "tex"),
    dirty: false,
    createdAt: String(raw.createdAt ?? now),
    updatedAt: String(raw.updatedAt ?? now),
  };
}

export function createDefaultResearchDocument(step: LearnerExperienceStep, projectId: string): ResearchDocument {
  const payload = (step.payload || {}) as Record<string, any>;
  const rawTitle = String(payload.title ?? step.title ?? "Research Paper");
  const rawAbstract = String(payload.abstract ?? "Write an original research paper synthesizing course theory.");
  
  const sanitized = sanitizeAiPayloadToLatex({
    title: rawTitle,
    abstract: rawAbstract,
    introduction: String(payload.introduction ?? payload.instructions ?? ""),
    sections: Array.isArray(payload.sections) ? payload.sections : [],
  });

  const rawTex = `\\documentclass[11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{${sanitized.title}}
\\author{Student}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
${sanitized.abstract}
\\end{abstract}

${sanitized.body || `\\section{Introduction}\nWrite your introduction here.\n`}

\\end{document}
`;

  const validated = validateAndRepairLatex(rawTex);
  const mainTex = validated.repairedTex;

  const main = createFile("main.tex", mainTex);
  const refs = createFile("references.bib", "@article{sample2024,\n  title={Sample Reference},\n  author={Author, A.},\n  year={2024}\n}\n");
  const now = new Date().toISOString();
  return {
    version: 2,
    projectId,
    title: step.title,
    files: [main, refs],
    openTabs: [{ fileId: main.fileId, pinned: true }],
    activeFileId: main.fileId,
    mainFileId: main.fileId,
    lastCompile: null,
    updatedAt: now,
  };
}

export function hydrateResearchDocument(
  step: LearnerExperienceStep,
  projectId: string,
  saved: Record<string, unknown> | null
): ResearchDocument {
  const base = createDefaultResearchDocument(step, projectId);
  if (!saved) return base;

  const rawFiles = saved.files as unknown[];
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) return base;

  const files = rawFiles.map((f) => migrateLegacyFile(f as Record<string, unknown>));
  const activeFileId = String(saved.activeFileId ?? files[0]?.fileId ?? base.activeFileId);
  const mainFile = files.find((f) => f.name === "main.tex") ?? files[0];

  const rawTabs = saved.openTabs as Array<{ fileId: string; pinned?: boolean }> | undefined;
  const openTabs =
    Array.isArray(rawTabs) && rawTabs.length > 0
      ? rawTabs.map((t) => ({ fileId: String(t.fileId), pinned: Boolean(t.pinned) }))
      : files
          .filter((f) => f.fileId === activeFileId || f.name === "main.tex")
          .map((f) => ({ fileId: f.fileId, pinned: f.name === "main.tex" }));

  return {
    version: 2,
    projectId,
    title: step.title,
    files,
    openTabs,
    activeFileId,
    mainFileId: mainFile.fileId,
    lastCompile: (saved.lastCompile as ResearchDocument["lastCompile"]) ?? null,
    updatedAt: String(saved.updatedAt ?? new Date().toISOString()),
  };
}

export function serializeResearchDocument(doc: ResearchDocument): Record<string, unknown> {
  return {
    version: doc.version,
    activeFileId: doc.activeFileId,
    mainFileId: doc.mainFileId,
    updatedAt: doc.updatedAt,
    lastCompile: doc.lastCompile,
    files: doc.files.map((f) => ({
      id: f.fileId,
      fileId: f.fileId,
      name: f.name,
      path: f.path,
      content: f.content,
      kind: f.kind,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
    openTabs: doc.openTabs,
  };
}

export function getCompileSnapshot(doc: ResearchDocument): { mainContent: string; files: Array<{ name: string; content: string }> } {
  const main = doc.files.find((f) => f.fileId === doc.mainFileId) ?? doc.files[0];
  return {
    mainContent: main?.content ?? "",
    files: doc.files.map((f) => ({ name: f.name, content: f.content })),
  };
}
