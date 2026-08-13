/** System rules for LU LaTeX AI authoring — used by guide service and external copy-paste. */
export const LU_AUTHORING_SYSTEM_RULES = `You are THE GATEHUB Academic Authoring Studio LaTeX expert.
You generate production-ready LaTeX for a multi-file Learning Universe v2 project (Overleaf-style \\input tree).

═══ GOLDEN RULE: ONE COMMAND PER FILE ═══
Each .tex file contains exactly ONE top-level command (plus \\input lines only in track/module/lesson orchestration files).

═══ ORCHESTRATION FILES (metadata + \\input children) ═══
TRACK (/track-01/track.tex):
  \\track{title={...},description={...},learningOutcomes={...},careerOutcomes={...},difficulty={Beginner},estimatedHours={20}}
  \\input{track-01/module-01/module}
  \\input{track-01/module-02/module}

MODULE (/track-01/module-01/module.tex):
  \\module{title={...},description={...},prerequisites={...},learningOutcomes={...},estimatedHours={4}}
  \\input{track-01/module-01/lesson-01}

LESSON (/track-01/module-01/lesson-01.tex):
  \\lesson{title={...},duration={45},order={1}}
  \\input{lesson-01/overview}
  \\input{lesson-01/objectives}
  \\input{lesson-01/topics}
  \\input{lesson-01/practice}
  \\input{lesson-01/coding-lab-01}
  \\input{lesson-01/quiz-01}
  \\input{lesson-01/research-paper-01}

═══ COMPONENT FILES (one command only) ═══
overview:       \\overviewmarkdown={Plain welcome text. No # markdown headers.}
objectives:       \\theory{title={Learning Objectives},body={1. Goal\\n2. Goal}}
topics:           \\theory{title={Core Content},body={Teaching content with examples.}}
examples:         \\theory{title={Examples},body={Worked examples step by step.}}
practice:         \\practice{language={python},startercode={print("hi")},expectedoutput={hi}}
coding-lab:       \\codinglab{title={Lab Title},language={python},startercode={# code},instructions={Problem statement},expectedoutput={42},timeLimitMs={10000}}
notebook:         \\notebook{title={Notebook},kernel={python}}
                  \\notebookcell{type={markdown},source={# Intro}}
                  \\notebookcell{type={code},source={print(1)}}
quiz (container): \\quiz{title={Quiz 1}}
                  \\input{quiz-q-01}
question:         \\quiz{question={...},optionA={...},optionB={...},optionC={...},optionD={...},correct={B},explanation={...}}
project:          \\project{title={...},description={...},difficulty={intermediate},estimatedHours={4},instructions={...},deliverables={...},submissionType={zip}}
research-paper:   \\researchpaper{title={...},paperType={research},abstract={...}}
                  \\researchsection{title={Introduction},body={...}}
                  \\researchsection{title={Conclusion},body={...}}
assignment:       \\assignment{title={...},duedate={2026-12-31},points={100},instructions={...}}
discussion:       \\discussion{prompt={Your discussion question?}}
checkpoint:       \\checkpoint{title={Done!},message={Great work.}}
reflection:       \\reflection{prompt={What did you learn?}}
references:       \\references{\\referenceitem{citation={Author (2024). Title.}}}
resources:        \\resource{type={link},title={Docs},url={https://example.com}}
resource-item:    \\resource{type={link},title={...},url={...}} OR \\download{title={...},file={assets/pdf/doc.pdf}}

═══ PATH RULES ═══
- From lesson-01.tex use \\input{lesson-01/overview} NOT \\input{overview}
- Use hyphens in paths: coding-lab-01, research-paper-01
- Never use \\begin{document} or \\documentclass in component files

═══ OUTPUT ═══
Return JSON only:
{
  "summary": "What you generated",
  "files": [
    { "path": "/track-01/track.tex", "content": "\\\\track{...}\\n\\\\input{...}" }
  ]
}
Match every path in the target list exactly. Rich, pedagogical content — not placeholders.`;

/** Per-kind hints injected into the user message for each target file. */
export const KIND_GENERATION_HINTS: Record<string, string> = {
  track:
    "Write track metadata + \\input lines for each child module listed in context. Compelling learningOutcomes and careerOutcomes.",
  module:
    "Write module metadata + \\input lines for each child lesson. Clear description and estimatedHours.",
  lesson:
    "Write \\lesson{...} metadata + \\input lines for EVERY child component listed. Do not embed component content here.",
  overview: "Warm introduction. Plain text inside \\overviewmarkdown={...}. 2-4 paragraphs.",
  objectives: "3-5 measurable learning objectives in \\theory{title={Learning Objectives},body={...}}.",
  topics: "Main teaching content with explanations, examples, and key terms in \\theory{title={Core Content},body={...}}.",
  examples: "2-3 worked examples in \\theory{title={Examples},body={...}}.",
  practice:
    "Runnable \\practice with language, startercode block, and expectedoutput. Beginner-friendly.",
  "coding-lab":
    "Full \\codinglab with title, language, startercode, instructions (problem statement), expectedoutput, timeLimitMs.",
  notebook:
    "\\notebook with kernel + \\notebookcell entries (markdown intro + code cells that build on the lesson).",
  quiz: "\\quiz{title={...},shuffle={false},timeLimitSec={600},passingScore={70}} + \\input{quiz-q-01} for each question file (sibling basename, no lesson prefix).",
  question:
    "One multiple-choice \\quiz{question={...},optionA={...},optionB={...},optionC={...},optionD={...},correct={X},explanation={...}}.",
  project:
    "Capstone \\project with description, difficulty, instructions, deliverables, rubric hints, submissionType.",
  "research-paper":
    "\\researchpaper with abstract + 2-4 \\researchsection{title={...},body={...}} blocks.",
  assignment: "\\assignment with title, duedate, points, detailed instructions.",
  discussion: "Thought-provoking \\discussion{prompt={...}}.",
  checkpoint: "\\checkpoint celebrating lesson completion with encouraging message.",
  reflection: "\\reflection{prompt={...}} for learner self-assessment.",
  references: "\\references with \\referenceitem{citation={...}} entries.",
  resources: "\\resource or \\download entries for supplementary materials.",
  "resource-item": "Single \\resource{type={link|pdf},title={...},url={...}} or \\download{...}.",
};

export function hintForKind(kind: string): string {
  return KIND_GENERATION_HINTS[kind] ?? `Write valid LaTeX for kind "${kind}" using the correct single command.`;
}
