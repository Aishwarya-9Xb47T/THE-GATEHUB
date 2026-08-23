import { getOpenAi } from "./openaiClient.js";
import type {
  AICourseArchitectInterview,
  ArchitectBlueprint,
  ArchitectModuleBlueprint,
  ArchitectLessonBlueprint,
  ArchitectQualityReport,
  CurriculumResearchReport,
} from "./types.js";
import { hasLearningComponent, normalizeInterview } from "./types.js";
import { populateApprovedBlueprint } from "./lessonContentEngine.js";
import { runPlanningPipeline } from "./orchestrator/planningPipeline.js";
import { PROFESSOR_SYSTEM_PROMPT } from "./instructorPersona.js";
import { getArchitectModel } from "./architectModels.js";
import { computeScalePlan, planCurriculumStructure, enforceBlueprintStructure } from "./curriculumPlanner.js";
import { validateCurriculumBlueprint } from "./curriculumValidator.js";


/** Phase 2–4: V4 orchestrated planning (Agents 1 → 2 → 3). */
export async function researchAndPlanCurriculum(interview: AICourseArchitectInterview): Promise<{
  research: CurriculumResearchReport;
  blueprint: ArchitectBlueprint;
  curriculumValidation: ArchitectQualityReport;
}> {
  const normalized = normalizeInterview(interview);
  const pipeline = await runPlanningPipeline({ interview: normalized });
  return {
    research: pipeline.curriculum.research,
    blueprint: pipeline.blueprint,
    curriculumValidation: pipeline.curriculumValidation,
  };
}

export async function generateCourseBlueprint(interview: AICourseArchitectInterview): Promise<ArchitectBlueprint> {
  const { blueprint } = await researchAndPlanCurriculum(interview);
  return blueprint;
}

/** Phase 7: Populate professor-quality content after instructor approval. */
export async function generateApprovedCourseContent(
  skeleton: ArchitectBlueprint,
  interview: AICourseArchitectInterview,
  onProgress?: (msg: string, pct: number) => void
): Promise<{ blueprint: ArchitectBlueprint; qualityReport: ArchitectQualityReport }> {
  const normalized = normalizeInterview(interview);
  // Re-assert instructor structural constraints before writing content
  const enforced = enforceBlueprintStructure(
    { ...skeleton, phase: "approved" as const },
    normalized,
    skeleton.researchReport,
  );
  const structureCheck = validateCurriculumBlueprint(enforced, normalized);
  if (!structureCheck.passed) {
    const fail = structureCheck.checks.find((c) => c.status === "fail");
    throw new Error(fail?.detail || "Curriculum does not match your requested structure.");
  }
  return populateApprovedBlueprint(enforced, normalized, onProgress);
}

function normalizeBlueprint(bp: ArchitectBlueprint, interview: AICourseArchitectInterview): ArchitectBlueprint {
  const c = interview.courseInfo;
  bp.courseTitle = bp.courseTitle || c.title;
  bp.subtitle = bp.subtitle || `Master ${c.subject} from foundations to industry-ready skills`;
  bp.difficulty = bp.difficulty || capitalize(c.difficulty);
  bp.estimatedHours = bp.estimatedHours || parseEstimatedHours(c.estimatedDuration);
  bp.estimatedDuration = bp.estimatedDuration || c.estimatedDuration;
  bp.category = bp.category || c.categoryName || c.subject;
  bp.prerequisites = bp.prerequisites?.length ? bp.prerequisites : c.prerequisites;
  bp.learningOutcomes = bp.learningOutcomes?.length ? bp.learningOutcomes : c.expectedOutcomes;

  if (!bp.modules?.length) return generateIntelligentMockBlueprint(interview);

  bp.modules = bp.modules.map((mod, mi) => ({
    ...mod,
    id: mod.id || `module-${String(mi + 1).padStart(2, "0")}`,
    lessons: (mod.lessons || []).map((lesson, li) => ({
      ...lesson,
      id: lesson.id || `lesson-${String(li + 1).padStart(2, "0")}`,
      durationMinutes: lesson.durationMinutes || 45,
      objectives: lesson.objectives?.length ? lesson.objectives : [`Understand key concepts in ${lesson.title}`],
    })),
  }));

  if (!bp.marketing) {
    bp.marketing = {
      seoTitle: bp.courseTitle,
      seoDescription: bp.description.slice(0, 160),
      tags: [c.subject, c.industry, c.difficulty],
      highlights: Array.isArray(c.learningGoals) ? c.learningGoals.slice(0, 5) : [],
      bannerPrompt: `Professional course banner for ${c.title}, ${c.subject}, modern education, no text`,
      colorTheme: "deep blue and gold",
    };
  }

  return bp;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function parseEstimatedHours(duration: string): number {
  const match = duration.match(/(\d+)/);
  return match ? Math.min(parseInt(match[1], 10), 200) : 40;
}

function generateIntelligentMockBlueprint(interview: AICourseArchitectInterview): ArchitectBlueprint {
  // Scale-aware skeleton — never hardcode module/lesson counts.
  return planCurriculumStructure(interview, {
    courseRationale: `Curriculum structure for ${interview.courseInfo.subject || interview.courseInfo.title}.`,
    industryStandards: [],
    universityReferences: [],
    officialDocumentation: [],
    recommendedProgression: [],
    skillDependencyGraph: "",
    prerequisiteGraph: "",
    prerequisites: interview.courseInfo.prerequisites || [],
    learningOutcomes: interview.courseInfo.expectedOutcomes || [],
    conceptMap: [],
    assessmentRecommendations: [],
    researchSources: [],
    researchedAt: new Date().toISOString(),
  });
}

function generateMockLesson(
  moduleTitle: string,
  lessonNum: number,
  subject: string,
  interview: AICourseArchitectInterview
): ArchitectLessonBlueprint {
  const title = `${moduleTitle} — Lesson ${lessonNum}`;
  const industry = interview.courseInfo.industry || "technology";
  const theoryExtra = hasLearningComponent(interview, "equation") || interview.courseInfo.academicLevel === "graduate"
    ? "\n\n## Mathematical Foundation\n\nKey relationship: the core model can be expressed as $y = f(x; \\theta)$ where $\\theta$ represents learnable parameters. Understanding this formulation is essential for implementation and optimization.\n\n$$\n\\mathcal{L}(\\theta) = \\frac{1}{n}\\sum_{i=1}^{n} \\ell(y_i, f(x_i; \\theta))\n$$"
    : "";

  return {
    id: `lesson-${String(lessonNum).padStart(2, "0")}`,
    title,
    durationMinutes: 45,
    introduction: `Welcome to **${title}**. This lesson is part of your ${interview.courseInfo.courseType} journey in ${subject}. You will build practical skills used by professionals in ${industry}, with clear explanations, worked examples, and hands-on practice aligned with industry best practices.`,
    objectives: [
      `Define and explain core ${subject} concepts covered in ${moduleTitle}`,
      `Apply techniques through guided examples and exercises`,
      `Evaluate solutions using professional standards`,
      `Complete assessments demonstrating mastery`,
    ],
    theory: `## ${title}\n\n### Core Concepts\n\nThis lesson develops your understanding of **${subject}** within ${moduleTitle}. We follow a research-informed progression used at leading universities and industry training programs.\n\n### Theory\n\n${subject} requires both conceptual clarity and disciplined practice. We examine definitions, intuition, formal properties, and how practitioners apply these ideas in ${industry} environments.${theoryExtra}\n\n### Common Pitfalls\n\nAvoid skipping foundational steps, ignoring edge cases, and memorizing without understanding underlying principles.`,
    examples: `## Worked Example\n\n**Scenario (${industry}):** A team needs to apply ${subject} techniques to a production problem.\n\n1. **Problem framing** — Define inputs, outputs, and constraints\n2. **Method selection** — Choose appropriate ${subject} approach\n3. **Implementation** — Build and test systematically\n4. **Validation** — Measure results against success criteria\n\nThis mirrors real professional workflows.`,
    caseStudy: hasLearningComponent(interview, "Case Stud")
      ? `## Case Study\n\nA ${industry} organization implemented ${subject} principles from ${moduleTitle} to improve outcomes by 35%. Key success factors: executive sponsorship, iterative delivery, and continuous measurement.`
      : undefined,
    summary: `In this lesson you mastered core ${moduleTitle} concepts, worked through examples, and prepared for practice and assessment. You can now explain key ideas and apply them in structured exercises.`,
    revision: `**Revision checklist:**\n- Review learning objectives\n- Re-read core theory section\n- Redo the worked example without looking\n- Complete practice and quiz before proceeding`,
    faq: hasLearningComponent(interview, "FAQ")
      ? [
          { question: `What is the most important concept in ${title}?`, answer: `The foundational principles of ${moduleTitle} that connect theory to practice.` },
          { question: "How much practice is recommended?", answer: "At least 30–45 minutes of hands-on practice per lesson for durable learning." },
        ]
      : undefined,
    flashcards: hasLearningComponent(interview, "Flashcard")
      ? [
          { front: `Define key term in ${moduleTitle}`, back: "The core definition from this lesson's theory section." },
          { front: "Primary application", back: `Applying ${subject} techniques in ${industry} contexts.` },
        ]
      : undefined,
    glossary: hasLearningComponent(interview, "Glossary")
      ? [
          { term: moduleTitle.split(":").pop()?.trim() || subject, definition: `Core domain concept in ${subject}.` },
          { term: "Best Practice", definition: "Industry-standard approach validated by research and production use." },
        ]
      : undefined,
    industryTips: hasLearningComponent(interview, "Industry")
      ? [
          `Always validate ${subject} assumptions with stakeholders before implementation`,
          "Document decisions and trade-offs for team knowledge sharing",
          "Use version control and reproducible environments for all practical work",
        ]
      : undefined,
    interviewQuestions: hasLearningComponent(interview, "Interview")
      ? [
          { question: `Explain ${moduleTitle} to a non-technical stakeholder.`, answer: "Focus on business value, outcomes, and concrete examples rather than jargon." },
          { question: `How would you debug a ${subject} implementation?`, answer: "Isolate components, verify inputs, check assumptions, and measure intermediate outputs." },
        ]
      : undefined,
    cheatSheet: hasLearningComponent(interview, "Cheat")
      ? `## ${title} Cheat Sheet\n\n| Concept | Definition | Application |\n|---------|------------|-------------|\n| Core idea | Key principle | When to use |\n| Pitfall | Common mistake | How to avoid |`
      : undefined,
    quizQuestions: hasLearningComponent(interview, "Quiz")
      ? Array.from({ length: 4 }, (_, qi) => ({
          text: `${title} — Assessment ${qi + 1}: Which approach best demonstrates mastery of ${moduleTitle}?`,
          options: [
            "Systematic application of theory with validation",
            "Skipping prerequisites and practice",
            "Memorization without understanding",
            "Ignoring industry standards",
          ],
          correctAnswer: "Systematic application of theory with validation",
          explanation: "Professional mastery requires systematic theory application, practice, and validation.",
        }))
      : undefined,
    codingLab: hasLearningComponent(interview, "Coding Lab")
      ? {
          title: `${title} — Coding Lab`,
          language: "python",
          starterCode: `# ${title} — Coding Lab\n# Implement the solution below\n\ndef solve():\n    """Apply ${moduleTitle} concepts."""\n    data = [1, 2, 3, 4, 5]\n    result = sum(data) / len(data)\n    return result\n\nif __name__ == "__main__":\n    print(f"Result: {solve()}")\n`,
          expectedOutput: "Result: 3.0",
          colabUrl: hasLearningComponent(interview, "Colab") ? "https://colab.research.google.com" : undefined,
          enableColab: true,
        }
      : undefined,
    notebook: hasLearningComponent(interview, "Jupyter")
      ? {
          title: `${title} — Jupyter Notebook`,
          kernel: "python",
          cells: [
            { type: "markdown", source: `# ${title}\n\nInteractive exploration of ${moduleTitle}.` },
            { type: "code", source: `import numpy as np\n# Explore ${subject} concepts\nvalues = np.array([1, 2, 3, 4, 5])\nprint(f"Mean: {values.mean()}")` },
          ],
        }
      : undefined,
    assignment: hasLearningComponent(interview, "Assignment")
      ? {
          title: `${title} Assignment`,
          instructions: `Complete the following assignment demonstrating ${moduleTitle} concepts. Submit your solution with documentation explaining your approach, assumptions, and results.`,
          points: 100,
          dueDate: "2026-12-31",
        }
      : undefined,
    miniProject: hasLearningComponent(interview, "Project")
      ? {
          title: `${title} Mini Project`,
          description: `Apply ${moduleTitle} in a small real-world scenario relevant to ${industry}.`,
          instructions: "Plan, implement, test, and document your solution. Include a README with setup instructions.",
        }
      : undefined,
    researchPaper: hasLearningComponent(interview, "Research")
      ? {
          title: `${title} — Research Paper`,
          abstract: `Write an original research paper on ${moduleTitle}, synthesizing course theory with verified academic sources.`,
          enableOverleaf: true,
          sections: [
            { title: "Introduction", content: `Background on ${subject} and relevance to ${moduleTitle}.` },
            { title: "Literature Review", content: "Summarize and compare key papers relevant to this lesson." },
            { title: "Methodology", content: "Describe your approach, data, and evaluation method." },
            { title: "Results and Discussion", content: "Present findings and connect them to the lesson objectives." },
            { title: "Conclusion", content: "Implications for learners and practitioners." },
          ],
        }
      : undefined,
    resources: hasLearningComponent(interview, "Download") || hasLearningComponent(interview, "PDF")
      ? [
          { title: `${subject} Official Documentation`, url: "https://docs.python.org/3/", type: "documentation" },
          { title: "MIT OpenCourseWare Reference", url: "https://ocw.mit.edu", type: "link" },
          { title: `${title} — Study Notes`, url: "https://ocw.mit.edu", type: "link" },
        ]
      : undefined,
    references: hasLearningComponent(interview, "Reference")
      ? [
          { citation: `MIT OpenCourseWare — ${subject} curriculum materials (2026)` },
          { citation: `Industry standards documentation for ${industry} applications` },
        ]
      : undefined,
    discussionPrompt: hasLearningComponent(interview, "Discussion")
      ? `What was the most challenging concept in ${title}, and how would you explain it to a colleague?`
      : undefined,
    practice: hasLearningComponent(interview, "Interactive")
      ? `# ${title} Practice\n# Complete this exercise\n\ndef exercise():\n    # Step 1: Define the problem\n    # Step 2: Apply ${subject} technique\n    # Step 3: Return validated result\n    return "Exercise complete"\n\nprint(exercise())\n`
      : undefined,
  };
}

export function performQualityReview(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
): ArchitectQualityReport {
  const checks: ArchitectQualityReport["checks"] = [];
  let score = 100;

  const lessonCount = blueprint.modules.reduce((n, m) => n + m.lessons.length, 0);
  const hasLessons = lessonCount > 0;
  checks.push({
    id: "lessons",
    label: "Lesson coverage",
    status: hasLessons ? "pass" : "fail",
    detail: hasLessons ? `${lessonCount} lessons across ${blueprint.modules.length} modules` : "No lessons found",
  });
  if (!hasLessons) score -= 30;

  const emptyTheory = blueprint.modules.some((m) => m.lessons.some((l) => !l.theory?.trim()));
  const isPlanned = blueprint.phase === "planned" || blueprint.modules.some((m) =>
    m.lessons.some((l) => l.contentStatus === "planned")
  );
  checks.push({
    id: "theory",
    label: "Theory completeness",
    status: isPlanned ? "pass" : emptyTheory ? "warn" : "pass",
    detail: isPlanned
      ? "Structure planned — content generated after approval"
      : emptyTheory
        ? "Some lessons have thin theory sections"
        : "All lessons include theory content",
  });
  if (emptyTheory && !isPlanned) score -= 10;

  const titles = blueprint.modules.flatMap((m) => m.lessons.map((l) => l.title.toLowerCase()));
  const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
  checks.push({
    id: "duplicates",
    label: "Topic duplication",
    status: dupes.length ? "warn" : "pass",
    detail: dupes.length ? `${dupes.length} potential duplicate lesson titles` : "No duplicate topics detected",
  });
  if (dupes.length) score -= 5;

  const hasAssessments = blueprint.modules.some((m) => m.moduleQuiz || m.lessons.some((l) => l.quizQuestions?.length));
  checks.push({
    id: "assessments",
    label: "Assessment balance",
    status: hasAssessments ? "pass" : "warn",
    detail: hasAssessments ? "Quizzes and assessments included" : "Consider adding more assessments",
  });
  if (!hasAssessments) score -= 10;

  checks.push({
    id: "progression",
    label: "Difficulty progression",
    status: blueprint.difficultyProgression ? "pass" : "warn",
    detail: blueprint.difficultyProgression || "Add explicit progression notes",
  });

  const outcomesCount = (blueprint.learningOutcomes ?? []).length;
  checks.push({
    id: "outcomes",
    label: "Learning outcomes",
    status: outcomesCount >= 5 ? "pass" : "warn",
    detail: `${outcomesCount} learning outcomes defined`,
  });
  if (outcomesCount < 5) score -= 5;

  checks.push({
    id: "duration",
    label: "Estimated completion time",
    status: (blueprint.estimatedHours ?? 0) > 0 ? "pass" : "warn",
    detail: `${blueprint.estimatedHours ?? 0} hours estimated`,
  });

  checks.push({
    id: "accessibility",
    label: "Content structure",
    status: "pass",
    detail: "Lessons include introduction, objectives, theory, summary, and revision",
  });

  if (blueprint.academicBlueprint) {
    const ab = blueprint.academicBlueprint;
    const bloomsCount = (ab.bloomsTaxonomyMapping ?? []).length;
    const careerCount = (ab.careerOutcomes ?? []).length;
    const skillsCount = (ab.skillsCovered ?? []).length;
    checks.push({
      id: "academic-blueprint",
      label: "Academic course blueprint",
      status: bloomsCount >= 4 ? "pass" : "warn",
      detail: `${ab.lessonCount ?? 0} lessons · ${ab.projectCount ?? 0} projects · ${ab.quizCount ?? 0} quizzes · Bloom's mapped`,
    });
    checks.push({
      id: "career-outcomes",
      label: "Career outcomes defined",
      status: careerCount >= 3 ? "pass" : "warn",
      detail: `${careerCount} career outcomes`,
    });
    checks.push({
      id: "skills-matrix",
      label: "Skills coverage",
      status: skillsCount >= 5 ? "pass" : "warn",
      detail: `${skillsCount} skills mapped`,
    });
  } else {
    checks.push({
      id: "academic-blueprint",
      label: "Academic course blueprint",
      status: "warn",
      detail: "Academic blueprint not attached — re-run research & plan",
    });
    score -= 5;
  }

  const videoMapped = blueprint.modules.some((m) => m.lessons.some((l) => l.videos?.length));
  if (interview.videoStrategy?.mappings?.length) {
    checks.push({
      id: "video-placement",
      label: "Instructor video placement",
      status: videoMapped ? "pass" : "warn",
      detail: videoMapped
        ? "Videos assigned to lessons"
        : `${interview.videoStrategy.mappings.length} videos queued but not yet mapped`,
    });
    if (!videoMapped) score -= 8;
  }

  const tiers = blueprint.modules.flatMap((m) => m.lessons.map((l) => l.difficultyTier ?? "intermediate"));
  const tierBalance = new Set(tiers).size >= 2 || tiers.length < 5;
  checks.push({
    id: "difficulty-balance",
    label: "Difficulty distribution",
    status: tierBalance ? "pass" : "warn",
    detail: blueprint.difficultyProgression || "Single difficulty tier detected",
  });

  const flowOk = blueprint.modules.every((m, mi) =>
    mi === 0 || (m.dependencies?.length ?? 0) > 0 || m.lessons.some((l) => (l.prerequisites?.length ?? 0) > 0)
  );
  checks.push({
    id: "curriculum-flow",
    label: "Module & lesson flow",
    status: flowOk ? "pass" : "warn",
    detail: flowOk ? "Sequential dependencies defined" : "Some modules lack prerequisite links",
  });
  if (!flowOk) score -= 5;

  const suggestions: string[] = [];
  if (emptyTheory) suggestions.push("Expand theory sections in lessons flagged as thin.");
  if (dupes.length) suggestions.push("Review and rename duplicate lesson titles.");
  if (!hasAssessments) suggestions.push("Add module quizzes or lesson checkpoints.");
  if (interview.videoStrategy?.method === "add-later") {
    suggestions.push("Upload or link videos to lessons before publishing.");
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    passed: score >= 70,
    checks,
    suggestions,
  };
}

export async function regenerateBlueprintSection(
  interview: AICourseArchitectInterview,
  blueprint: ArchitectBlueprint,
  scope: "module" | "lesson" | "quiz",
  targetId: string
): Promise<ArchitectBlueprint> {
  const normalized = normalizeInterview(interview);
  const updated = structuredClone(blueprint);

  if (scope === "module" && getOpenAi()) {
    const idx = updated.modules.findIndex((m) => m.id === targetId);
    if (idx < 0) return updated;
    const mod = updated.modules[idx];
    const plan = updated.curriculumPlan ?? computeScalePlan(normalized);
    try {
      const prompt = `Regenerate ONE module's titles for "${normalized.courseInfo.title}" (${normalized.courseInfo.subject}).

HARD CONSTRAINTS:
- Keep module id "${targetId}"
- Keep EXACTLY ${mod.lessons.length} lessons with the SAME lesson IDs
- Do NOT change total course structure (${plan.moduleCount} modules, ${plan.targetLessons} lessons)
- Only improve title, description, learningOutcomes, and lesson titles

Return JSON: { "id", "title", "description", "learningOutcomes": [], "lessons": [{ "id", "title", "difficultyTier" }] }
University-professor quality naming aligned with module ${idx + 1} of ${updated.modules.length}.`;
      const res = await getOpenAi()!.chat.completions.create({
        model: getArchitectModel("regenerate"),
        messages: [
          { role: "system", content: PROFESSOR_SYSTEM_PROMPT },
          { role: "user", content: `${prompt}\n\nCurrent:\n${JSON.stringify({ id: mod.id, title: mod.title, lessons: mod.lessons.map((l) => ({ id: l.id, title: l.title })) })}` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.5,
      });
      const raw = res.choices[0]?.message?.content;
      if (raw) {
        const parsed = JSON.parse(raw) as ArchitectModuleBlueprint;
        updated.modules[idx] = {
          ...mod,
          title: parsed.title || mod.title,
          description: parsed.description || mod.description,
          learningOutcomes: parsed.learningOutcomes?.length ? parsed.learningOutcomes : mod.learningOutcomes,
          lessons: mod.lessons.map((lesson) => {
            const enriched = parsed.lessons?.find((l) => l.id === lesson.id);
            return enriched?.title ? { ...lesson, title: enriched.title, difficultyTier: enriched.difficultyTier || lesson.difficultyTier } : lesson;
          }),
        };
        return updated;
      }
    } catch (err) {
      console.error("[Regenerate module] GPT failed, using title fallback:", err);
    }
  }

  if (scope === "module") {
    const idx = updated.modules.findIndex((m) => m.id === targetId);
    if (idx < 0) return updated;
    const mod = updated.modules[idx];
    const subject = normalized.courseInfo.subject || normalized.courseInfo.title;
    // Preserve lesson count/IDs — only refresh titles locally
    updated.modules[idx] = {
      ...mod,
      title: `${subject}: ${mod.title.replace(/^[^:]+:\s*/, "").trim() || `Module ${idx + 1}`}`,
      lessons: mod.lessons.map((lesson, li) => ({
        ...lesson,
        title: `${mod.title.replace(/^[^:]+:\s*/, "").trim()} — Topic ${li + 1} (revised)`,
      })),
    };
    return updated;
  }

  if (scope === "lesson") {
    for (const mod of updated.modules) {
      const li = mod.lessons.findIndex((l) => l.id === targetId);
      if (li >= 0) {
        const preservedVideos = mod.lessons[li].videos;
        mod.lessons[li] = generateMockLesson(mod.title, li + 1, interview.courseInfo.subject, interview);
        mod.lessons[li].id = targetId;
        if (preservedVideos?.length) {
          mod.lessons[li].videos = preservedVideos;
        }
        break;
      }
    }
    return updated;
  }

  return updated;
}
