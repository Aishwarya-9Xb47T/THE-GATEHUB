import type { LuLessonComponentKind } from "./luComponentRegistry.js";
import { KIND_TO_TEX_CMD } from "./luComponentRegistry.js";

/** Short header prepended when a .tex file is created (once). */
export function texFileGuideHeader(
  role: "track" | "module" | "lesson" | "component",
  details?: { kind?: LuLessonComponentKind; lessonId?: string; filePath?: string }
): string {
  const lines: string[] = ["% THE GATEHUB - Learning Universe LaTeX", "%"];

  if (role === "track") {
    lines.push(
      "% This file owns ONLY \\track{...} and input lines to modules.",
      "% IMPORTANT: \\track{...} must come FIRST, then module input lines below it.",
      "% Do NOT put lesson content here."
    );
  } else if (role === "module") {
    lines.push(
      "% This file owns ONLY \\module{...} and input lines to lessons.",
      "% IMPORTANT: \\module{...} must come FIRST, then lesson input lines below it.",
      "% Example path: track-01/module-01/lesson-01"
    );
  } else if (role === "lesson") {
    const lid = details?.lessonId ?? "lesson-01";
    lines.push(
      `% This file owns ONLY \\lesson{...} and input lines to components.`,
      `% IMPORTANT: \\lesson{...} must come FIRST, then component input lines below it.`,
      `% Use paths like: ${lid}/overview  (NOT a bare "overview" path)`,
      "% Do NOT paste \\overviewmarkdown or \\practice here - they belong in their own files."
    );
  } else if (role === "component" && details?.kind) {
    const cmd = KIND_TO_TEX_CMD[details.kind];
    lines.push(
      `% This file owns ONLY one command: \\${cmd}{...}`,
      "% Edit freely. Save compiles and publishes from this file.",
      "% For AI help: screenshot this file + use the AI Authoring Guide in the IDE."
    );
  }

  lines.push("%");
  return lines.join("\n") + "\n";
}

/** Full prompt instructors can paste into ChatGPT with a screenshot. */
export const CHATGPT_AUTHORING_PROMPT = `You are helping write LaTeX for THE GATEHUB Academic Authoring Studio (Learning Universe).

CRITICAL RULES — multi-file project (like Overleaf with \\input):

1. ONE COMMAND PER FILE
   - track.tex       → only \\track{...} + \\input{...} to modules
   - module.tex      → only \\module{...} + \\input{...} to lessons
   - lesson-01.tex   → only \\lesson{...} + \\input{lesson-01/component-name}
   - overview.tex    → only \\overviewmarkdown{...}
   - practice.tex    → only \\practice{...}
   - quiz-01.tex     → only \\quiz{title={...}} + \\input{question-id} for each question

2. INCLUDE PATHS (from lesson-01.tex)
   CORRECT: \\input{lesson-01/overview}
   WRONG:   \\input{overview}
   WRONG:   putting \\overviewmarkdown{...} directly inside lesson-01.tex

3. METADATA SYNTAX — always key={value} inside braces:
   \\track{title={AI Track},description={...},difficulty={Beginner}}
   \\lesson{title={Intro},duration={45},order={1}}
   \\module{title={Module 1},description={...},estimatedHours={2}}

4. COMPONENT COMMANDS (one per file):
   Overview:     \\overviewmarkdown={Welcome text here. Plain text, not markdown # headers.}
   Objectives:   \\theory{title={Learning Objectives},body={1. Goal one\\n2. Goal two}}
   Topics:       \\theory{title={Core Content},body={Your teaching text.}}
   Practice:     \\practice{language={python},startercode={print("hi")},expectedoutput={hi}}
   Coding lab:   \\codinglab{title={Lab},language={python},startercode={...},timeLimitMs={5000}}
   Quiz block:   \\quiz{title={Quiz 1}}
   Question:     \\quiz{question={...},optionA={...},optionB={...},optionC={...},optionD={...},correct={B},explanation={...}}
   Discussion:   \\discussion{prompt={Your question?}}
   Checkpoint:   \\checkpoint{title={Done!},message={Great work.}}
   Assignment:   \\assignment{title={HW},duedate={2026-12-31},points={100},instructions={...}}
   Project:      \\project{title={...},description={...},difficulty={intermediate},estimatedHours={4},instructions={...}}
   Resource:     \\resource{type={link},title={Docs},url={https://example.com}}

5. DO NOT USE (will break compile):
   - \\begin{document} / \\documentclass (only in main.tex, auto-managed)
   - Markdown # headers inside \\overviewmarkdown
   - Multiple component commands in one file
   - Spaces in \\input paths (use hyphens: research-paper-01)

6. ESCAPE special LaTeX chars in text: # % & _ { } use backslash or keep inside braces.

Reply with ONLY the corrected LaTeX for the file shown in the screenshot. No extra explanation.`;
