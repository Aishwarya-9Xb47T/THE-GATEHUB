import type { LearnerExperienceStep } from "../../types";
import type { NotebookCell, NotebookDocument } from "./types";
import { createCell, createEmptyOutput } from "./types";
import { repairStarterCode, resolveNotebookCodeSource } from "@/lib/labCodeRepair";

function migrateLegacyCell(raw: Record<string, unknown>, language: string): NotebookCell {
  const cellType = (raw.type === "markdown" || raw.cellType === "markdown" ? "markdown" : "code") as "code" | "markdown";
  const now = new Date().toISOString();
  return {
    cellId: String(raw.id ?? raw.cellId ?? `cell-${crypto.randomUUID()}`),
    cellType,
    source: String(raw.source ?? ""),
    metadata: (raw.metadata as Record<string, unknown>) ?? {},
    outputs: {
      ...createEmptyOutput(),
      stdout: String(raw.output ?? (raw.outputs as { stdout?: string } | undefined)?.stdout ?? ""),
      status: (raw.status as NotebookCell["executionState"]) ?? "idle",
    },
    executionState: (raw.status as NotebookCell["executionState"]) ?? "idle",
    collapsed: Boolean(raw.collapsed),
    language: String(raw.language ?? language),
    executionCount: typeof raw.executionCount === "number" ? raw.executionCount : null,
    createdAt: String(raw.createdAt ?? now),
    updatedAt: String(raw.updatedAt ?? now),
    markdownPreview: cellType === "markdown",
  };
}

export function createDefaultNotebook(step: LearnerExperienceStep): NotebookDocument {
  const language = String(step.payload.language ?? "python");
  const rawStarter = String(step.payload.starterCode ?? step.payload.initialCode ?? "# Write your solution here\n");
  const starter = repairStarterCode(rawStarter, language);
  const instructions = String(
    step.payload.instructions ?? step.payload.problemStatement ?? step.payload.description ?? ""
  );
  const markdownSource = instructions.trim()
    ? `## ${step.title}\n\n${instructions}`
    : `## ${step.title}\n\nRun the code cell below. Modify and re-run to explore the concepts from this lesson.`;
  const now = new Date().toISOString();
  return {
    version: 2,
    notebookId: step.id,
    title: step.title,
    cells: [createCell("markdown", language, markdownSource), createCell("code", language, starter)],
    runtime: { status: "ready", kernelLanguage: language },
    updatedAt: now,
  };
}

export function hydrateNotebook(step: LearnerExperienceStep, saved: Record<string, unknown> | null): NotebookDocument {
  const base = createDefaultNotebook(step);
  const language = String(step.payload.language ?? "python");
  const canonicalStarter = repairStarterCode(
    String(step.payload.starterCode ?? step.payload.initialCode ?? ""),
    language
  );

  if (!saved) return base;

  const savedLanguage = String(saved.language ?? language);
  const rawCells = saved.cells as unknown[];
  if (!Array.isArray(rawCells) || rawCells.length === 0) return base;

  const cells = rawCells.map((c) => {
    const cell = migrateLegacyCell(c as Record<string, unknown>, savedLanguage);
    if (cell.cellType === "code") {
      cell.source = resolveNotebookCodeSource(canonicalStarter, cell.source, savedLanguage);
    }
    return cell;
  });

  // Ensure at least one code cell exists with runnable starter
  const hasCode = cells.some((c) => c.cellType === "code");
  if (!hasCode) {
    cells.push(createCell("code", savedLanguage, canonicalStarter));
  }

  return {
    version: 2,
    notebookId: step.id,
    title: step.title,
    cells,
    runtime: {
      status: (saved.runtimeStatus as NotebookDocument["runtime"]["status"]) ?? "ready",
      kernelLanguage: savedLanguage,
    },
    colabDriveFileId: saved.colabDriveFileId ? String(saved.colabDriveFileId) : undefined,
    updatedAt: String(saved.updatedAt ?? new Date().toISOString()),
  };
}

export function serializeNotebook(doc: NotebookDocument): Record<string, unknown> {
  return {
    version: doc.version,
    language: doc.runtime.kernelLanguage,
    runtimeStatus: doc.runtime.status,
    colabDriveFileId: doc.colabDriveFileId,
    updatedAt: doc.updatedAt,
    cells: doc.cells.map((c) => ({
      id: c.cellId,
      cellId: c.cellId,
      type: c.cellType,
      cellType: c.cellType,
      source: c.source,
      metadata: c.metadata,
      output: c.outputs.stdout,
      outputs: c.outputs,
      status: c.executionState,
      collapsed: c.collapsed,
      language: c.language,
      executionCount: c.executionCount,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      markdownPreview: c.markdownPreview,
    })),
  };
}
