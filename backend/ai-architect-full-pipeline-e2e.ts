/**
 * End-to-end AI Course Generator pipeline test.
 * Blueprint → Normalizer → Renderer → DB → Compile → Validate components.
 *
 * Run: npx tsx ai-architect-full-pipeline-e2e.ts
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { buildProjectFromBlueprint } from "./src/services/aiCourseArchitect/aiArchitectLaTeXEmitter.js";
import { compileLatexLocally } from "./src/services/latexCompileService.js";
import { resolveLuV2CompileSource } from "./src/services/luProject/luCompileSource.js";
import { buildMainTexFromProject } from "./src/services/luProject/luProjectMainTexBuilder.js";
import { writeLuProjectToDb } from "./src/services/luProject/migrateSingleFileToProject.js";
import type {
  ArchitectBlueprint,
  AICourseArchitectInterview,
} from "./src/services/aiCourseArchitect/types.js";
import { prisma } from "./src/utils/prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUN_ID = Date.now();

/** Problematic UTF-8 chars AI models often emit — must be sanitized. */
const SMART = "\u201Csmart quotes\u201D and \u2018apostrophe\u2019";
const DASH = "en\u2013dash and em\u2014dash";
const ZWSP = `zero\u200Bwidth`;
const BULLET = "bullet \u2022 item";

function utf8Field(base: string): string {
  return `${base} — ${SMART}; ${DASH}; ${ZWSP}; ${BULLET}`;
}

const FULL_INTERVIEW: AICourseArchitectInterview = {
  courseInfo: {
    title: `AI Pipeline E2E ${RUN_ID}`,
    subject: "Software Engineering",
    industry: "Technology",
  },
  courseScale: { id: "standard" },
  difficultyDistribution: { mode: "ai-decides" },
  learningStyle: ["balanced"],
  teachingStyle: ["professional"],
  lessonStructure: [
    "learning-objectives",
    "real-world-analogy",
    "theory",
    "concept-explanation",
    "examples",
    "common-mistakes",
    "best-practices",
    "industry-notes",
    "summary",
    "key-takeaways",
    "revision-notes",
    "glossary",
    "learning-outcome",
    "interview-questions",
    "references",
  ],
  practicalComponents: [
    "Quiz",
    "Coding Lab",
    "Project",
    "Reference",
    "Discussion",
    "Research",
    "Download",
    "Jupyter",
    "Assignment",
  ],
  assessmentStrategy: { style: "Quiz after every module", methods: ["Quizzes", "Projects"] },
  curriculumStrategy: {
    progression: ["beginner-intermediate-advanced"],
    aiDecidesCurriculum: true,
  },
  learningComponents: [
    "Quiz",
    "Coding Lab",
    "Project",
    "Reference",
    "Discussion",
    "Research",
    "PDF",
    "Example",
    "Mid Exam",
    "Capstone",
    "Final Exam",
  ],
  videoStrategy: {
    includeVideos: true,
    method: "youtube",
    placement: "ai-auto",
    mappings: [
      {
        type: "youtube",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        title: utf8Field("Intro Video"),
        order: 0,
        youtubeId: "dQw4w9WgXcQ",
        youtubeDuration: "3:32",
      },
    ],
  },
};

function buildComprehensiveBlueprint(): ArchitectBlueprint {
  return {
    courseTitle: `AI Pipeline E2E ${RUN_ID}`,
    subtitle: utf8Field("Complete pipeline validation"),
    description: utf8Field("Brand-new course generated to validate the full AI architect pipeline."),
    difficulty: "Intermediate",
    estimatedHours: 8,
    category: "Programming",
    modules: [
      {
        id: "module-01",
        title: utf8Field("Foundations Module"),
        description: utf8Field("Core concepts and hands-on practice."),
        learningOutcomes: [
          utf8Field("Understand pipeline architecture"),
          utf8Field("Apply sanitization patterns"),
        ],
        estimatedHours: 4,
        lessons: [
          {
            id: "lesson-01",
            title: utf8Field("Lesson 1: Pipeline Fundamentals"),
            durationMinutes: 60,
            introduction: utf8Field(
              "Welcome to this lesson on the AI course generation pipeline. You will learn how content flows from blueprint to published course."
            ),
            objectives: [
              utf8Field("Explain each pipeline stage"),
              utf8Field("Identify UTF-8 sanitization requirements"),
              utf8Field("Validate rendered LaTeX output"),
            ],
            realWorldAnalogy: utf8Field(
              "Think of the pipeline like a factory assembly line — each station transforms raw materials into a finished product."
            ),
            theory: utf8Field(
              "The AI Course Architect produces structured JSON blueprints. A normalizer converts these to canonical course documents. The renderer emits LaTeX DSL files deterministically."
            ),
            conceptExplanation: utf8Field(
              "1. Generation — AI agents write lesson content.\n2. Normalization — blueprint fields map to course schema.\n3. Rendering — components become .tex files.\n4. Compilation — LaTeX produces the student PDF."
            ),
            visualDiagram: utf8Field("Diagram: AI → Blueprint → Normalizer → Renderer → LaTeX → PDF"),
            flowchart: utf8Field("Flow: validate → sanitize → emit → compile"),
            mathematicalDerivation: utf8Field("Complexity: O(n) where n = number of lesson components"),
            codeExample: utf8Field('console.log("Hello — sanitized content");'),
            executionSteps: utf8Field("Step 1: Generate. Step 2: Normalize. Step 3: Render. Step 4: Compile."),
            examples: utf8Field(
              "Example 1: A course with quiz and coding lab.\nExample 2: A course with research papers and glossary."
            ),
            caseStudy: utf8Field("Case study: A fintech company reduced course creation time by 80% using AI generation."),
            commonMistakes: [
              utf8Field("Skipping UTF-8 sanitization"),
              utf8Field("Bypassing the centralized renderer"),
              utf8Field("Using placeholder text in production"),
            ],
            bestPractices: [
              utf8Field("Always sanitize AI output before LaTeX emission"),
              utf8Field("Use the shared course renderer for all content"),
              utf8Field("Validate compilation before publishing"),
            ],
            industryNotes: utf8Field(
              "Enterprise LMS platforms require deterministic rendering pipelines for auditability and compliance."
            ),
            summary: utf8Field("This lesson covered the full AI course generation pipeline from blueprint to PDF."),
            keyTakeaways: [
              utf8Field("Sanitization is mandatory for all AI strings"),
              utf8Field("The renderer is the single source of LaTeX truth"),
              utf8Field("End-to-end validation catches integration bugs early"),
            ],
            learningOutcome: utf8Field(
              "You can describe and validate each stage of the AI course generation pipeline."
            ),
            revision: utf8Field("Review: blueprint fields, sanitizer, renderer, compiler."),
            revisionNotes: {
              quickSummary: utf8Field("Pipeline stages and sanitization rules."),
              keyConcepts: [utf8Field("Blueprint normalizer"), utf8Field("Course renderer")],
              importantFormulas: [utf8Field("sanitize(input) → safe_output")],
              commonMistakes: [utf8Field("Double-escaping LaTeX characters")],
              examTips: [utf8Field("Know which fields map to which topic sections")],
              practiceQuestions: [utf8Field("What does deepSanitize do?")],
              furtherPractice: [utf8Field("Trace a quiz question through the pipeline")],
              mindMap: utf8Field("AI → Blueprint → Normalizer → Renderer → Compile"),
            },
            glossary: [
              { term: utf8Field("Blueprint"), definition: utf8Field("Structured JSON course plan from AI agents") },
              { term: utf8Field("Normalizer"), definition: utf8Field("Converts blueprint to LuCourseDocument") },
            ],
            interviewQuestions: [
              {
                question: utf8Field("How do you prevent UTF-8 errors in AI-generated LaTeX?"),
                answer: utf8Field("Centralized sanitization at generation, normalization, and render time."),
              },
            ],
            faq: [
              {
                question: utf8Field("Why not let AI write LaTeX directly?"),
                answer: utf8Field("Deterministic rendering prevents encoding and escaping errors."),
              },
            ],
            flashcards: [
              { front: utf8Field("What is deepSanitize?"), back: utf8Field("Recursive JSON string sanitizer") },
            ],
            industryTips: [utf8Field("Always run compile validation before publishing to students.")],
            cheatSheet: utf8Field("Pipeline: Generate → Normalize → Render → Compile → Publish"),
            furtherReading: [{ title: utf8Field("LaTeX Unicode Guide"), url: "https://www.latex-project.org" }],
            quizQuestions: [
              {
                type: "mcq",
                text: utf8Field("Which component converts blueprint JSON to course document JSON?"),
                options: [
                  utf8Field("luCourseRenderer"),
                  utf8Field("luBlueprintNormalizer"),
                  utf8Field("compileLatexLocally"),
                  utf8Field("lessonContentEngine"),
                ],
                correctAnswer: utf8Field("luBlueprintNormalizer"),
                explanation: utf8Field(
                  "The normalizer maps architect blueprint fields to the canonical LuCourseDocument schema."
                ),
                difficulty: "medium",
                topic: utf8Field("Pipeline Architecture"),
                bloomLevel: "understand",
                timeEstimateSeconds: 60,
                hints: [utf8Field("It runs before the renderer")],
              },
              {
                type: "true-false",
                text: utf8Field("AI agents should write LaTeX files directly."),
                correctAnswer: "False",
                explanation: utf8Field("LaTeX is generated exclusively by luCourseRenderer."),
                difficulty: "easy",
                topic: utf8Field("Architecture"),
                bloomLevel: "remember",
                timeEstimateSeconds: 30,
              },
            ],
            codingLab: {
              title: utf8Field("Sanitizer Validation Lab"),
              language: "python",
              starterCode: '# Write a function that strips zero-width characters\n\ndef clean(text):\n    pass\n',
              expectedOutput: utf8Field("clean('hello\\u200bworld') == 'helloworld'"),
              problemStatement: utf8Field(
                "Implement a function that removes zero-width Unicode characters from a string."
              ),
              colabUrl: "https://colab.research.google.com",
            },
            notebook: {
              title: utf8Field("Pipeline Explorer Notebook"),
              kernel: "python",
              cells: [
                { type: "markdown", source: utf8Field("# AI Course Pipeline\nExplore each stage.") },
                { type: "code", source: 'print("Pipeline stages: generate, normalize, render, compile")' },
              ],
            },
            assignment: {
              title: utf8Field("Pipeline Audit Assignment"),
              instructions: utf8Field("Document every field that passes through the sanitizer."),
              points: 100,
            },
            miniProject: {
              title: utf8Field("Mini Project: Custom Component"),
              description: utf8Field("Add a new lesson component and verify end-to-end rendering."),
              instructions: utf8Field("Extend the normalizer, renderer, and emitter. Compile successfully."),
            },
            researchPaper: {
              title: utf8Field("Deterministic Content Rendering"),
              abstract: utf8Field("This paper discusses separating AI content generation from LaTeX rendering."),
              sections: [
                { title: utf8Field("Background"), content: utf8Field("AI models produce unstructured text.") },
                { title: utf8Field("Method"), content: utf8Field("JSON-first architecture with deterministic renderer.") },
              ],
            },
            researchPapers: [
              {
                title: utf8Field("Attention Is All You Need"),
                authors: utf8Field("Vaswani et al."),
                year: 2017,
                conference: utf8Field("NeurIPS"),
                doi: "10.48550/arXiv.1706.03762",
                url: "https://arxiv.org/abs/1706.03762",
                abstract: utf8Field("The dominant sequence transduction model is the encoder-decoder with attention."),
                summary: utf8Field("Introduced the Transformer architecture."),
                importance: utf8Field("Foundation of modern LLMs used in course generation."),
                difficulty: "advanced",
              },
            ],
            lessonReferences: [
              {
                type: "book",
                title: utf8Field("Clean Architecture"),
                authors: utf8Field("Robert C. Martin"),
                year: 2017,
                description: utf8Field("Software architecture principles."),
                relevance: utf8Field("Pipeline separation of concerns"),
              },
            ],
            references: [{ citation: utf8Field("Martin, R. C. (2017). Clean Architecture.") }],
            resources: [
              { title: utf8Field("Pipeline Docs"), url: "https://example.com/docs", type: "link" },
            ],
            videos: [
              {
                type: "youtube",
                url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                title: utf8Field("Lesson Video"),
                order: 0,
                youtubeId: "dQw4w9WgXcQ",
                youtubeDuration: "3:32",
              },
            ],
            discussionPrompt: utf8Field("How would you extend the pipeline to support new content types?"),
            practice: utf8Field('print("Practice exercise — validate sanitization")'),
          },
        ],
        project: {
          title: utf8Field("Module Project: Full Pipeline"),
          description: utf8Field("Build and validate a complete AI-generated course."),
          instructions: utf8Field("Generate, normalize, render, and compile a course with all components."),
          difficulty: "intermediate",
        },
        midExam: {
          title: utf8Field("Module Mid Exam"),
          questions: [
            {
              text: utf8Field("What is the role of luCourseRenderer?"),
              options: [
                utf8Field("Generate AI content"),
                utf8Field("Emit LaTeX from course JSON"),
                utf8Field("Store courses in DB"),
                utf8Field("Authenticate users"),
              ],
              correctAnswer: utf8Field("Emit LaTeX from course JSON"),
              explanation: utf8Field("The renderer is the only component allowed to generate LaTeX."),
            },
          ],
        },
      },
    ],
    capstone: {
      title: utf8Field("Capstone: Production Course"),
      description: utf8Field("Deliver a production-ready AI-generated course."),
      instructions: utf8Field("Complete all pipeline stages and publish."),
    },
    finalExam: {
      title: utf8Field("Final Exam"),
      questions: [
        {
          type: "mcq",
          text: utf8Field("Which sanitizer is used before LaTeX emission?"),
          options: [
            utf8Field("sanitizeAIContentForJSON"),
            utf8Field("sanitizeAIContentForLaTeX"),
            utf8Field("JSON.parse"),
            utf8Field("encodeURIComponent"),
          ],
          correctAnswer: utf8Field("sanitizeAIContentForLaTeX"),
          explanation: utf8Field("LaTeX fields use the LaTeX-specific sanitizer via escLatex."),
          difficulty: "medium",
          topic: utf8Field("Sanitization"),
          bloomLevel: "apply",
          timeEstimateSeconds: 45,
        },
      ],
    },
    marketing: { tags: ["ai-pipeline", "e2e", String(RUN_ID)] },
  };
}

const REQUIRED_COMPONENTS = [
  "overview.tex",
  "objectives.tex",
  "topics.tex",
  "concepts.tex",
  "analogy.tex",
  "examples.tex",
  "key-takeaways.tex",
  "best-practices.tex",
  "common-mistakes.tex",
  "industry-notes.tex",
  "learning-outcome.tex",
  "videos.tex",
  "research-papers.tex",
  "references.tex",
  "coding-lab-01.tex",
  "project-01.tex",
  "quiz-01.tex",
  "interview-prep.tex",
  "revision-notes.tex",
  "glossary.tex",
] as const;

function validateComponents(files: { path: string; content: string; isFolder: boolean }[]): string[] {
  const missing: string[] = [];
  const texPaths = files.filter((f) => !f.isFolder).map((f) => f.path);

  for (const component of REQUIRED_COMPONENTS) {
    const found = texPaths.some((p) => p.endsWith(`/${component}`));
    if (!found) missing.push(component);
  }

  const quizQuestions = texPaths.filter((p) => /\/quiz-q-\d+\.tex$/i.test(p));
  if (quizQuestions.length === 0) missing.push("quiz question files");

  const quizFiles = files.filter((f) => !f.isFolder && /quiz-q-\d+\.tex$/i.test(f.path));

  if (!quizFiles.some((f) => f.content.includes("explanation="))) missing.push("quiz explanations");
  if (!quizFiles.some((f) => f.content.includes("optionA="))) missing.push("quiz options");
  if (!quizFiles.some((f) => f.content.includes("correct="))) missing.push("quiz correct answers");

  return missing;
}

async function main() {
  console.log("=".repeat(80));
  console.log(`AI ARCHITECT FULL PIPELINE E2E — run ${RUN_ID}`);
  console.log("=".repeat(80));

  const blueprint = buildComprehensiveBlueprint();
  const interview = FULL_INTERVIEW;

  console.log("\n[1/4] Blueprint → Normalizer → Renderer");
  const { project, files } = buildProjectFromBlueprint(blueprint, interview);
  console.log(`Generated ${files.filter((f) => !f.isFolder).length} files`);

  console.log("\n[2/4] Validating components");
  const missing = validateComponents(files);
  if (missing.length > 0) {
    console.error("MISSING COMPONENTS:", missing.join(", "));
    process.exit(1);
  }
  console.log("All required components present");

  console.log("\n[3/4] Writing to DB and compiling");
  const owner = await prisma.user.findFirst({ select: { id: true } });
  if (!owner) {
    console.error("No user in database — seed the DB first (npm run db:seed)");
    process.exit(1);
  }

  const projectRecord = await prisma.latexProject.create({
    data: { title: blueprint.courseTitle, ownerId: owner.id },
  });

  const mainTex = buildMainTexFromProject(project);
  await writeLuProjectToDb(projectRecord.id, project, files, mainTex);

  const luSource = await resolveLuV2CompileSource(projectRecord.id, { forPdf: true });
  if (!luSource?.mergedTex?.trim()) {
    console.error("Failed to resolve LU v2 compile source");
    process.exit(1);
  }

  const compileResult = await compileLatexLocally(projectRecord.id, luSource.mergedTex, {
    preserveProvidedMainTex: true,
    maxPasses: 3,
    copyReferencedImages: false,
    enableBibtex: false,
    timeoutMs: 300000,
  });

  console.log("\n[4/4] Compilation result");
  console.log("Success:", compileResult.success);
  console.log("Compiler:", compileResult.compilerUsed);
  console.log("Time:", compileResult.compilationTime, "ms");

  if (!compileResult.success) {
    console.error("\nCOMPILATION FAILED");
    console.error("Errors:", JSON.stringify(compileResult.errors, null, 2));
    console.log("\n=== FULL COMPILER LOG ===");
    console.log(compileResult.logs);

    const logPath = path.join(__dirname, `e2e-compile-failure-${RUN_ID}.log`);
    fs.writeFileSync(logPath, compileResult.logs, "utf8");
    console.log(`Log saved to ${logPath}`);
    process.exit(1);
  }

  const pdfStat = fs.statSync(compileResult.pdfPath!);
  console.log(`PDF: ${compileResult.pdfPath} (${pdfStat.size} bytes)`);
  console.log("\n" + "=".repeat(80));
  console.log("PIPELINE E2E SUCCESS — all stages passed");
  console.log("=".repeat(80));

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("E2E FAILED:", err);
  await prisma.$disconnect();
  process.exit(1);
});
