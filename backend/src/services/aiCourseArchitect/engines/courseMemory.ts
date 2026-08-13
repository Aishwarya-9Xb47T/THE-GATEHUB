/**
 * V6 Part 3 — Cross-lesson memory for terminology and consistency.
 */
import type { ArchitectBlueprint, ArchitectLessonBlueprint } from "../types.js";

export interface CourseMemorySnapshot {
  terminology: Map<string, string>;
  glossaryTerms: string[];
  codeSnippets: string[];
  variableNames: Set<string>;
  difficultyLevel: string;
  lessonTitles: string[];
  updatedAt: string;
}

export function buildCourseMemory(blueprint: ArchitectBlueprint): CourseMemorySnapshot {
  const terminology = new Map<string, string>();
  const glossaryTerms: string[] = [];
  const codeSnippets: string[] = [];
  const variableNames = new Set<string>();
  const lessonTitles: string[] = [];

  for (const mod of blueprint.modules) {
    for (const lesson of mod.lessons) {
      lessonTitles.push(lesson.title);
      for (const g of lesson.glossary ?? []) {
        terminology.set(g.term.toLowerCase(), g.definition);
        glossaryTerms.push(g.term);
      }
      if (lesson.codeExample) {
        codeSnippets.push(lesson.codeExample.slice(0, 500));
        extractVariableNames(lesson.codeExample).forEach((v) => variableNames.add(v));
      }
    }
  }

  return {
    terminology,
    glossaryTerms: [...new Set(glossaryTerms)],
    codeSnippets,
    variableNames,
    difficultyLevel: blueprint.difficulty,
    lessonTitles,
    updatedAt: new Date().toISOString(),
  };
}

function extractVariableNames(code: string): string[] {
  const names: string[] = [];
  const patterns = [/\b(const|let|var)\s+([a-zA-Z_]\w*)/g, /\bdef\s+([a-zA-Z_]\w*)/g, /\bclass\s+([a-zA-Z_]\w*)/g];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) names.push(m[2] ?? m[1]);
  }
  return names;
}

export function formatMemoryForAgent(memory: CourseMemorySnapshot, currentLesson: ArchitectLessonBlueprint): string {
  const priorTerms = [...memory.terminology.entries()]
    .slice(0, 20)
    .map(([t, d]) => `- ${t}: ${d.slice(0, 80)}`)
    .join("\n");
  const priorLessons = memory.lessonTitles.filter((t) => t !== currentLesson.title).slice(-5);

  return `
COURSE MEMORY (do not contradict):
- Difficulty: ${memory.difficultyLevel}
- Prior lessons: ${priorLessons.join("; ") || "none"}
- Established terms:
${priorTerms || "  (none yet)"}
- Code style variables seen: ${[...memory.variableNames].slice(0, 12).join(", ") || "n/a"}
`.trim();
}
