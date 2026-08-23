/**
 * Lesson Writer AI (Agent 5) — professor-quality lesson body generation.
 */
import { getOpenAi } from "./openaiClient.js";
import type {
  AICourseArchitectInterview,
  ArchitectBlueprint,
  ArchitectLessonBlueprint,
  ArchitectModuleBlueprint,
} from "./types.js";
import type { LessonBlueprintPlan, LessonPipelineContext } from "./orchestrator/contracts.js";
import { hasLearningComponent, hasLessonStructure } from "./types.js";
import { formatPedagogyForPrompt } from "./lessonPlanningEngine.js";
import {
  PROFESSOR_SYSTEM_PROMPT,
  LESSON_DESIGN_SECTIONS,
  buildInterviewContext,
  ANTI_HALLUCINATION_RULES,
  buildBloomObjectiveGuidance,
  buildProgressiveDepthGuidance,
  buildRealWorldExamplesGuidance,
  buildRetentionGuidance,
  buildReferencesGuidance,
  buildPedagogicalConsistencyGuidance,
} from "./instructorPersona.js";
import { getArchitectModel, getLessonMaxTokens } from "./architectModels.js";
import { architectCompletion } from "./architectLLM.js";
import { getAgentSpec } from "./agentSpecifications.js";
import { sanitizeAIContentForJSON } from "../../utils/aiContentSanitizer.js";
import { formatRetrievalForPrompt, RAG_SYNTHESIS_RULES } from "./retrieval/ragPrompt.js";
import { formatAdaptiveProfileForPrompt } from "./adaptiveProfile.js";
import { formatPart4PromptContext } from "./engines/part4Orchestrator.js";
import { sanitizeWriterOutput } from "./agentOwnership.js";
import { buildPremiumLessonReading } from "../lessonContentRepair.js";
import { normalizeLessonContent } from "./lessonContentNormalizer.js";


export async function generateLessonContent(
  skeleton: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview,
  lessonIndex: number,
  blueprint: ArchitectBlueprint,
  plan: LessonBlueprintPlan,
  outline: import("./lessonPlanningEngine.js").LessonOutlineContext,
  retryHint?: string
): Promise<ArchitectLessonBlueprint> {
  const c = interview.courseInfo;
  const structure = interview.lessonStructure ?? [];
  const tier = skeleton.difficultyTier ?? "intermediate";

  const sections = structure.map((s) => `- ${s}`).join("\n");
  const videoContext =
    skeleton.videos?.length ?
      `\nInstructor-provided videos (MUST reference in introduction and align content — embed in student view):\n${skeleton.videos
        .map((v) => {
          const kind = v.type === "youtube" ? "YouTube" : "Uploaded instructor video";
          return `- ${kind}: ${v.title}${v.youtubeDuration || v.uploadedVideoDuration ? ` (${v.youtubeDuration || v.uploadedVideoDuration})` : ""}`;
        })
        .join("\n")}\n`
    : "";

  const continuity = `
COURSE CONTINUITY:
Lesson ${outline.globalIndex + 1} of ${blueprint.modules.reduce((n, m) => n + m.lessons.length, 0)}.
Prior: ${outline.priorLessons.map((p) => p.lessonTitle).join(" → ") || "Start of course"}
Next: ${outline.nextLessons[0]?.lessonTitle ?? "End of course"}
Knowledge graph: ${blueprint.knowledgeGraph ?? "Sequential progression"}
`;

  const codingInstructions = hasLearningComponent(interview, "Coding")
    ? `
CODING LAB (when enabled): include working code with comments, expectedOutput, explanation, timeComplexity, spaceComplexity, edgeCases[], debuggingTips[], advancedVersion, miniChallenge. Colab-compatible Python preferred.`
    : "";

  const pipelineCtx: LessonPipelineContext = {
    interview,
    blueprint,
    mod,
    modIndex: lessonIndex >= 0 ? blueprint.modules.findIndex((m) => m.id === mod.id) : 0,
    lessonIndex,
    skeleton,
    adaptiveProfile: plan.adaptiveProfile,
    retrievalBundle: plan.retrievalContext,
    memoryContext: undefined,
  };

  const prompt = `Write a complete university-professor quality lesson as JSON.

${buildInterviewContext(interview)}

Module: ${mod.title}
Lesson: ${skeleton.title}
Difficulty tier: ${tier}
${continuity}
${formatPedagogyForPrompt(plan)}
${plan.adaptiveProfile ? formatAdaptiveProfileForPrompt(plan.adaptiveProfile, interview) : ""}
${formatPart4PromptContext(plan, pipelineCtx)}
${formatRetrievalForPrompt(plan.retrievalContext)}
${RAG_SYNTHESIS_RULES}
${videoContext}${retryHint ? `IMPROVE: ${retryHint}` : ""}

${LESSON_DESIGN_SECTIONS}
${buildBloomObjectiveGuidance(tier)}
${buildProgressiveDepthGuidance(tier)}
${buildRealWorldExamplesGuidance(tier, c.industry, interview.courseInfo.subject)}
${buildRetentionGuidance()}
${buildReferencesGuidance(interview.courseInfo.subject)}
${buildPedagogicalConsistencyGuidance(mod.title, outline?.priorLessons?.map((p) => p.lessonTitle) ?? [], interview.courseInfo.subject)}

${ANTI_HALLUCINATION_RULES}
${getAgentSpec("lesson-writer")}

Every section must be substantive — NO placeholders, NO "TBD", NO generic filler.
Explain WHY concepts exist, WHERE used in ${c.industry}, HOW they work, with real examples.
Build explicitly on prior lessons. Prepare the learner for the next lesson.
Publication-quality prose — read like a professional textbook chapter.
Avoid empty academic filler such as "modern curricula formalize..." or vague statements that never name the concrete workflow, failure mode, or decision point.
Each major prose field must include at least one concrete scenario, one operational checkpoint, and one clear cause/effect explanation.
Use GitHub-flavored Markdown in all prose fields (introduction, theory, examples, summary, etc.):
**bold** for key terms, *italic* for emphasis, ## for section headings, numbered lists for steps.
Do NOT output raw LaTeX escapes or literal backslash sequences in prose.

Required lesson structure sections:
${sections}
${codingInstructions}

Return JSON with all applicable fields: introduction, objectives, realWorldAnalogy, theory (300+ words), conceptExplanation, visualDiagram, flowchart, mathematicalDerivation, codeExample, executionSteps, examples, caseStudy, practice, commonMistakes[], bestPractices[], industryNotes, summary, keyTakeaways[], revision, learningOutcome, glossary[], flashcards[], interviewQuestions[], furtherReading[], references[], cheatSheet, discussionPrompt.
Do NOT include quizQuestions or codingLab — separate agents generate those.`;

  if (getOpenAi() || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY) {
    try {
      const raw = await architectCompletion({
        phase: "lesson",
        system: PROFESSOR_SYSTEM_PROMPT,
        user: prompt,
        maxTokens: getLessonMaxTokens(),
        temperature: 0.55,
      });
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ArchitectLessonBlueprint>;
        return mergeLesson(skeleton, parsed, interview);
      }
    } catch (err) {
      console.error("[Lesson Content] LLM failed:", err);
    }
  }

  return buildProfessorQualityMock(skeleton, mod, interview, lessonIndex, outline);
}

function sanitizeLessonField(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeAIContentForJSON(value);
  } else if (Array.isArray(value)) {
    return value.map(sanitizeLessonField);
  } else if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      sanitized[key] = sanitizeLessonField(val);
    }
    return sanitized;
  }
  return value;
}

function mergeLesson(
  skeleton: ArchitectLessonBlueprint,
  content: Partial<ArchitectLessonBlueprint>,
  interview: AICourseArchitectInterview
): ArchitectLessonBlueprint {
  const preservedVideos = skeleton.videos?.length ? skeleton.videos : undefined;
  const sanitizedSkeleton = sanitizeLessonField(skeleton) as ArchitectLessonBlueprint;
  const sanitizedContent = sanitizeLessonField(content) as Partial<ArchitectLessonBlueprint>;
  const merged = {
    ...sanitizedSkeleton,
    ...sanitizedContent,
    id: skeleton.id,
    title: skeleton.title,
    durationMinutes: skeleton.durationMinutes,
    difficultyTier: skeleton.difficultyTier,
  };

  if (preservedVideos?.length) {
    merged.videos = preservedVideos;
  }

  if (preservedVideos?.length && merged.introduction) {
    const videoLines = preservedVideos.map((v) => {
      const label = v.title || (v.type === "youtube" ? "YouTube Video" : "Instructor Video");
      const dur = v.youtubeDuration || v.uploadedVideoDuration;
      return dur ? `- Watch: ${label} (${dur})` : `- Watch: ${label}`;
    });
    if (!merged.introduction.includes("Watch:")) {
      merged.introduction = `${merged.introduction}\n\nInstructor videos for this lesson:\n${videoLines.join("\n")}`;
    }
  }

  return normalizeLessonContent(sanitizeWriterOutput(merged), skeleton, { interview });
}

function buildProfessorQualityMock(
  skeleton: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview,
  lessonIndex: number,
  outline: import("./lessonPlanningEngine.js").LessonOutlineContext
): ArchitectLessonBlueprint {
  const subject = interview.courseInfo.subject;
  const tier = skeleton.difficultyTier ?? "intermediate";
  const topic = skeleton.title.split("—")[0]?.trim() || skeleton.title;
  const priorLesson = outline.priorLessons.at(-1)?.lessonTitle ?? "course foundations";
  const nextLesson = outline.nextLessons[0]?.lessonTitle ?? "the next module checkpoint";
  const repairCtx = {
    lessonTitle: skeleton.title,
    moduleTitle: mod.title,
    courseTitle: interview.courseInfo.subject,
    subject: interview.courseInfo.subject,
    industry: interview.courseInfo.industry,
  };
  const premiumTheory = buildPremiumLessonReading(repairCtx);
  const scaffoldedTheory = `
## Foundation
${premiumTheory}

This lesson explicitly builds on **${priorLesson}** and establishes the minimum vocabulary you need for ${topic}: prerequisites, decision checkpoints, and measurable outcomes used by ${interview.courseInfo.industry} teams.

## Structure
In production workflows, ${topic} links three layers: **inputs and constraints**, **execution rules**, and **verification evidence**. Teams document these layers in artifacts such as design docs, test plans, deployment checklists, and incident timelines so handoffs remain consistent across roles.

## Application
A realistic workflow in ${interview.courseInfo.industry} starts with requirement framing, then proceeds through implementation checkpoints, and ends with explicit acceptance criteria. The practitioner records what was tested, what failed, and why a chosen mitigation is preferred over alternatives.

## Depth
Advanced use of ${topic} focuses on failure modes and trade-offs: when to prioritize reliability over delivery speed, when to simplify an architecture to reduce incident risk, and when to escalate uncertainty instead of guessing. This prepares learners for **${nextLesson}** where these decisions become more complex.
`.trim();
  const furtherReading = buildAuthoritativeFurtherReading(subject, topic);
  const references = buildFallbackReferences(subject, topic, interview.courseInfo.industry);
  const summary = `In lesson ${lessonIndex + 1}, you learned how ${topic} moves from theory to delivery by using a four-layer scaffold: Foundation, Structure, Application, and Depth. In practical ${interview.courseInfo.industry} work, this matters because decisions are judged by evidence, not intention, so checkpoints and trade-off reasoning reduce costly defects. Next, you are prepared to tackle **${nextLesson}** with a stronger decision framework and clearer terminology continuity from **${priorLesson}**.`;

  return mergeLesson(
    skeleton,
    {
      introduction: `In professional ${subject} practice, **${topic}** is not an abstract topic—it is a capability that separates practitioners who can deliver results from those who only recognize terminology. This lesson builds directly on **${priorLesson}** and explains why ${topic} is essential in the ${interview.courseInfo.industry} delivery lifecycle.\n\nBy the end of this ${tier}-level unit, you will understand the problem ${topic} solves, the trade-offs practitioners accept, and how to apply the ideas in realistic scenarios before progressing to **${nextLesson}**.`,
      objectives: [
        `Explain the purpose and scope of ${topic} within ${subject}`,
        `Identify where ${topic} is applied in ${interview.courseInfo.industry} workflows`,
        `Execute core techniques with correct reasoning and documentation`,
        `Evaluate common failure modes and select appropriate mitigations`,
      ],
      realWorldAnalogy: hasLessonStructure(interview, "real-world-analogy")
        ? `Think of ${topic} like a pre-flight checklist: expertise does not remove the need to verify prerequisites, instruments, and conditions before high-stakes work begins.`
        : undefined,
      theory: scaffoldedTheory,
      conceptExplanation: `1. **Starting conditions** - Identify the knowledge, tools, dependencies, or assumptions that must already exist.\n2. **Rules of operation** - Define the boundaries and standards that keep the work consistent.\n3. **Execution path** - Break the activity into a deliberate sequence instead of jumping straight to implementation.\n4. **Verification** - Check outputs against expected behavior, edge cases, and failure signals.\n5. **Readiness for next steps** - State what has been proven and what later work can now safely build upon.`,
      examples: `## Example 1: Guided walkthrough\nA ${interview.courseInfo.industry} delivery team applies **${topic}** during sprint planning. The tech lead lists prerequisites, assigns ownership for each checkpoint, and records acceptance criteria in the design doc before implementation begins.\n\n## Example 2: Industry workflow\nA platform engineer integrates ${topic} into the staging pipeline so every release verifies the same invariants production depends on. QA signs off only after the operational checklist passes.\n\n## Example 3: Contrast and recovery\nA production incident traced to skipped prerequisites—not faulty code—forces the team to adopt ${topic} as a mandatory gate. Recovery time drops because investigators inspect setup before rewriting logic.`,
      caseStudy: hasLessonStructure(interview, "case-study")
        ? `## Situation\nA mid-size ${interview.courseInfo.industry} organization scales a ${subject} platform serving multiple product teams.\n\n## Challenge\nRelease velocity increases, but defect escape rate rises because teams skip shared readiness checks.\n\n## Approach\nEngineering leadership mandates ${topic} as a pre-merge gate with documented artifacts and peer review.\n\n## Outcome\nFewer rollback events, faster root-cause analysis, and clearer handoffs between development and operations.\n\n## Lessons Learned\n- Standardize checkpoints before optimizing speed.\n- Make readiness visible to non-implementers.\n- Treat verification as part of delivery, not overhead.`
        : undefined,
      practice: `Map a minimal ${topic} workflow for a realistic task in ${subject}. List the starting conditions, the exact checks you would perform, two likely failure modes, and how you would prove the system is ready for the next step.`,
      commonMistakes: [
        "Skipping prerequisites and jumping to advanced patterns",
        "Optimizing before correctness",
        "Copying solutions without understanding invariants",
      ],
      bestPractices: [
        "Write measurable objectives and acceptance criteria upfront",
        "Prefer explicit interfaces and small testable units",
        "Maintain a decision log for architectural choices",
      ],
      industryNotes: `${interview.courseInfo.industry} teams treat ${topic} as evidence that a practitioner can work systematically, prevent avoidable defects, and communicate readiness clearly across teams.`,
      summary,
      keyTakeaways: [
        `${topic} turns implicit assumptions into verifiable readiness checks`,
        "Mechanism and trade-offs matter as much as final answers",
        "Verification and documentation are part of professional delivery",
        `Connect ${topic} decisions to measurable outcomes in ${interview.courseInfo.industry}`,
      ],
      revision: `## Quick recall\n- Define ${topic} in one sentence.\n- Name two insights carried forward from ${priorLesson}.\n- Walk through the core procedure without notes.\n\n## Explain to a peer\nTeach a colleague when to use ${topic} versus an alternative approach, using one ${interview.courseInfo.industry} example.\n\n## Prepare for next lesson\nList one assumption you must verify before starting ${nextLesson}.`,
      discussionPrompt: `Where in your current or past ${interview.courseInfo.industry} work would ${topic} have prevented a defect or delay? What evidence would convince a skeptical teammate?`,
      learningOutcome: `You can explain when ${topic} is needed, apply it with a repeatable workflow, and defend your choices using concrete verification criteria.`,
      glossary: [{ term: topic, definition: `Core concept in ${subject} covered in this lesson.` }],
      flashcards: hasLessonStructure(interview, "flashcards")
        ? [{ front: `What problem does ${topic} solve?`, back: "Structured handling of complexity with measurable outcomes." }]
        : undefined,
      interviewQuestions: hasLessonStructure(interview, "interview-questions")
        ? [{ question: `Explain ${topic} to a non-technical executive.`, answer: "Focus on risk reduction, efficiency, and measurable outcomes." }]
        : undefined,
      references,
      furtherReading,
      lessonReferences: furtherReading.map((r) => ({
        type: "further-reading" as const,
        title: r.title,
        url: r.url,
        description: `Authoritative further reading for ${topic}.`,
        relevance: `Supports deeper study of ${topic} in ${subject}.`,
      })),
      miniProject: hasLearningComponent(interview, "Project")
        ? {
            title: `${topic} Applied Mini Project`,
            description: `Deliver a small portfolio artifact that applies ${topic} in a realistic ${interview.courseInfo.industry} scenario.`,
            instructions: `1. Frame the problem and success criteria.\n2. Implement or design the solution using this lesson's Structure and Application layers.\n3. Add verification evidence and a short retrospective that prepares for ${nextLesson}.`,
          }
        : undefined,
      assignment: hasLearningComponent(interview, "Assignment") || hasLearningComponent(interview, "Project")
        ? {
            title: `Assignment: ${topic} in practice`,
            problemStatement: `Apply ${topic} to a realistic ${interview.courseInfo.industry} challenge with clear constraints and evidence of correctness.`,
            instructions: `Complete a working solution, document decisions, verify outcomes, and explain how this builds on ${priorLesson}.`,
            objectives: [
              `Implement core techniques from ${topic}`,
              `Document trade-offs with measurable criteria`,
              `Verify readiness for ${nextLesson}`,
            ],
            requirements: [
              "Working deliverable with sample inputs/outputs",
              "Decision log covering at least two trade-offs",
              "Verification checklist with pass/fail evidence",
            ],
            submissionChecklist: ["Deliverable", "README", "Verification evidence"],
            rubric: [
              { criterion: "Correctness", points: 40, description: "Meets functional requirements" },
              { criterion: "Reasoning", points: 30, description: "Explains trade-offs clearly" },
              { criterion: "Verification", points: 20, description: "Evidence of testing and checks" },
              { criterion: "Communication", points: 10, description: "Clear documentation" },
            ],
            evaluationCriteria: ["Functional correctness", "Trade-off reasoning", "Professional documentation"],
            hints: [`Reuse Foundation/Structure checkpoints from the lesson`, `Prefer measurable acceptance criteria`],
            points: 100,
          }
        : undefined,
    },
    interview
  );
}

function buildAuthoritativeFurtherReading(subject: string, topic: string): Array<{ title: string; url: string }> {
  const s = subject.toLowerCase();
  if (s.includes("artificial intelligence")) {
    return [
      { title: `Google Machine Learning Glossary (${topic})`, url: "https://developers.google.com/machine-learning/glossary" },
      { title: "DeepLearning.AI short courses and practical guides", url: "https://www.deeplearning.ai/short-courses/" },
      { title: "Stanford CS229 course materials", url: "https://cs229.stanford.edu/" },
    ];
  }
  if (s.includes("data structure")) {
    return [
      { title: "MIT OpenCourseWare: Introduction to Algorithms", url: "https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/" },
      { title: "VisuAlgo interactive data-structure visualizations", url: "https://visualgo.net/en" },
      { title: "CPython data model documentation", url: "https://docs.python.org/3/reference/datamodel.html" },
    ];
  }
  if (s.includes("operating system")) {
    return [
      { title: "OSTEP free textbook", url: "https://pages.cs.wisc.edu/~remzi/OSTEP/" },
      { title: "Linux kernel documentation", url: "https://docs.kernel.org/" },
      { title: "MIT 6.S081 Operating Systems", url: "https://pdos.csail.mit.edu/6.S081/" },
    ];
  }
  if (s.includes("database")) {
    return [
      { title: "PostgreSQL official documentation", url: "https://www.postgresql.org/docs/" },
      { title: "CMU Database Group course resources", url: "https://db.cs.cmu.edu/" },
      { title: "SQLBolt interactive SQL lessons", url: "https://sqlbolt.com/" },
    ];
  }
  if (s.includes("python")) {
    return [
      { title: "Python official tutorial", url: "https://docs.python.org/3/tutorial/" },
      { title: "Real Python learning paths", url: "https://realpython.com/learning-paths/" },
      { title: "PyPI packaging guide", url: "https://packaging.python.org/" },
    ];
  }
  if (s.includes("network")) {
    return [
      { title: "Cisco Networking Academy resources", url: "https://www.netacad.com/" },
      { title: "Computer Networking: a Top-Down Approach companion site", url: "https://gaia.cs.umass.edu/kurose_ross/index.php" },
      { title: "Wireshark official docs", url: "https://www.wireshark.org/docs/" },
    ];
  }
  return [
    { title: `${subject} official documentation`, url: "https://developer.mozilla.org/" },
    { title: "MIT OpenCourseWare", url: "https://ocw.mit.edu/" },
    { title: "Stanford Online resources", url: "https://online.stanford.edu/" },
  ];
}

function buildFallbackReferences(subject: string, topic: string, industry: string): Array<{ citation: string }> {
  return [
    { citation: `${subject} Handbook (2023). Topic chapter: ${topic}. Use for foundational definitions and terminology consistency.` },
    { citation: `Official ${industry} implementation docs (current release). Use for production constraints and operational checkpoints.` },
    { citation: `University course notes on ${topic} (MIT/Stanford open materials). Use for bridging theory to structured practice.` },
  ];
}
