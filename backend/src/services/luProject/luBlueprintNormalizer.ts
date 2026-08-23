/**
 * Converts AI Architect blueprint (JSON) → canonical LuCourseDocument (JSON).
 * No LaTeX is produced here.
 */
import type {
  ArchitectBlueprint,
  ArchitectLessonBlueprint,
  AICourseArchitectInterview,
  VideoMapping,
} from "../aiCourseArchitect/types.js";
import { sanitizeAIContentForLaTeX } from "../../utils/aiContentSanitizer.js";
import { hasLearningComponent } from "../aiCourseArchitect/types.js";
import {
  normalizeVideoMapping,
} from "../aiCourseArchitect/videoAssignmentEngine.js";
import { sanitizeAIContentForJSON } from "../../utils/aiContentSanitizer.js";
import { isGenericLessonContent, shouldOmitLearnerTheorySection } from "../lessonContentRepair.js";

function deepSanitize(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeAIContentForJSON(value);
  } else if (Array.isArray(value)) {
    return value.map(deepSanitize);
  } else if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      sanitized[key] = deepSanitize(val);
    }
    return sanitized;
  }
  return value;
}
import type {
  LuCourseDocument,
  LuCourseLessonJson,
  LuCourseModuleJson,
  LuCourseQuizJson,
  LuCourseQuizQuestionJson,
  LuCourseTopicSectionJson,
  LuCourseVideoJson,
} from "./luCourseContentSchema.js";
import { LU_COURSE_JSON_VERSION } from "./luCourseContentSchema.js";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function collectLessonVideos(lesson: ArchitectLessonBlueprint): VideoMapping[] {
  const raw = lesson.videos ?? [];
  return [...raw].sort((a, b) => {
    if (a.type === b.type) return (a.order ?? 0) - (b.order ?? 0);
    return a.type === "upload" ? -1 : 1;
  });
}

function resolveLessonVideos(
  lesson: ArchitectLessonBlueprint,
  interview: AICourseArchitectInterview,
  videoPool: VideoMapping[],
  globalVideoIndex: { idx: number }
): VideoMapping[] {
  let lessonVideos = collectLessonVideos(lesson);
  if (!lessonVideos.length && videoPool.length && interview.videoStrategy.includeVideos !== false) {
    if (globalVideoIndex.idx < videoPool.length) {
      const v = normalizeVideoMapping(videoPool[globalVideoIndex.idx], globalVideoIndex.idx);
      if (v) {
        lessonVideos = [v];
        globalVideoIndex.idx++;
      }
    }
  }
  return lessonVideos
    .map((v, i) => normalizeVideoMapping(v, v.order ?? i))
    .filter((v): v is VideoMapping => v !== null);
}

function mappingToVideoJson(v: VideoMapping): LuCourseVideoJson {
  return {
    type: v.type === "upload" ? "upload" : "youtube",
    url: v.url,
    file: v.file,
    title: v.title || (v.type === "youtube" ? "YouTube Video" : "Instructor Video"),
    youtubeId: v.youtubeId,
    thumbnail: v.youtubeThumbnail,
    duration: v.youtubeDuration || v.uploadedVideoDuration,
  };
}

import { sanitizeDslContent } from "../../../../shared/lesson-body/dist/sanitizeDslContent.js";

function addTopic(
  topics: LuCourseTopicSectionJson[],
  id: string,
  title: string,
  body: string | undefined
): void {
  if (!body?.trim()) return;
  let cleanBody = sanitizeDslContent(body.trim());
  if (!cleanBody.trim()) return;
  if (shouldOmitLearnerTopic(id, title, cleanBody)) return;

  if ((id === "flowchart" || id === "diagram") && /^(flowchart|graph|sequenceDiagram|stateDiagram|classDiagram)/i.test(cleanBody.trim())) {
    cleanBody = `\`\`\`mermaid\n${cleanBody.trim()}\n\`\`\``;
  }

  const sanitizedBody = sanitizeAIContentForLaTeX(cleanBody);
  topics.push({ id, title, body: sanitizedBody });
}

function shouldOmitLearnerTopic(id: string, title: string, body: string): boolean {
  if (!body || !body.trim()) return true;
  const trimmed = body.trim();
  if (trimmed.length < 5) return true;
  if (/^(tbd|todo|placeholder|coming soon)$/i.test(trimmed)) return true;
  if (id === "code-example" && /console\.log\("hello from/i.test(trimmed) && trimmed.length < 50) return true;
  return false;
}

function mapQuizQuestions(questions: any[]): LuCourseQuizQuestionJson[] {
  return (questions ?? []).map((q) => {
    let options: string[] = Array.isArray(q.options) ? q.options : ["True", "False"];
    let correctAnswer: string = "";

    if (q.type === "true-false") {
      options = ["True", "False"];
      correctAnswer = String(q.correctAnswer ?? "True");
    } else if (q.type === "fill-blank") {
      const blanks = Array.isArray(q.correctAnswer) ? q.correctAnswer : [String(q.correctAnswer ?? "")];
      options = [blanks.join(", ")];
      correctAnswer = blanks.join(", ");
    } else if (q.type === "match-following" && Array.isArray(q.leftColumn)) {
      options = q.leftColumn.map((left: string, i: number) => `${left} → ${q.rightColumn?.[i] || ""}`);
      correctAnswer = Object.entries(q.correctMatches || {})
        .map(([left, right]) => `${left} → ${right}`)
        .join(", ");
    } else if (typeof q.correctIndex === "number" && options[q.correctIndex]) {
      correctAnswer = options[q.correctIndex];
    } else {
      correctAnswer = String(q.correctAnswer ?? options[0] ?? "Option A");
    }

    const text =
      q.type === "scenario"
        ? `${q.scenario || ""}\n\n${q.text || q.question || ""}`.trim()
        : (q.text || q.question || "Knowledge Check Question");

    return {
      text: text || "Knowledge Check Question",
      options: options.length ? options : ["Option A", "Option B"],
      correctAnswer: correctAnswer || options[0] || "Option A",
      explanation: q.explanation || "Review the lesson material for more details.",
      difficulty: q.difficulty || "medium",
      topic: q.topic,
      bloomLevel: q.bloomLevel,
      timeEstimateSeconds: q.timeEstimateSeconds || 60,
      hints: q.hints,
    };
  });
}

function mapExamToQuiz(title: string, questions: LuCourseQuizQuestionJson[]): LuCourseQuizJson {
  return { title, questions };
}

function lessonToJson(
  lesson: ArchitectLessonBlueprint,
  lessonId: string,
  interview: AICourseArchitectInterview,
  videoPool: VideoMapping[],
  globalVideoIndex: { idx: number }
): LuCourseLessonJson {
  const topics: LuCourseTopicSectionJson[] = [];

  if (hasLearningComponent(interview, "PDF") || lesson.theory?.trim()) {
    addTopic(topics, "topics", "Core Content", lesson.theory);
  }
  addTopic(topics, "analogy", "Real-World Analogy", lesson.realWorldAnalogy);
  addTopic(topics, "concepts", "Concept Explanation", lesson.conceptExplanation);
  addTopic(topics, "diagram", "Visual Diagram", lesson.visualDiagram);
  addTopic(topics, "flowchart", "Process Flowchart", lesson.flowchart);
  addTopic(topics, "derivation", "Mathematical Derivation", lesson.mathematicalDerivation);
  addTopic(topics, "code-example", "Code Example", lesson.codeExample);
  addTopic(topics, "execution-steps", "Execution Steps", lesson.executionSteps);
  if (lesson.commonMistakes?.length) {
    addTopic(topics, "common-mistakes", "Common Mistakes", lesson.commonMistakes.map((m, i) => `${i + 1}. ${m}`).join("\n"));
  }
  if (lesson.bestPractices?.length) {
    addTopic(topics, "best-practices", "Best Practices", lesson.bestPractices.map((p, i) => `${i + 1}. ${p}`).join("\n"));
  }
  addTopic(topics, "industry-notes", "Industry Notes", lesson.industryNotes);
  if (lesson.keyTakeaways?.length) {
    addTopic(topics, "key-takeaways", "Key Takeaways", lesson.keyTakeaways.map((t, i) => `${i + 1}. ${t}`).join("\n"));
  }
  addTopic(topics, "learning-outcome", "Learning Outcome", lesson.learningOutcome);
  if (lesson.furtherReading?.length) {
    addTopic(topics, "further-reading", "Further Reading", lesson.furtherReading.map((r) => `- ${r.title}: ${r.url}`).join("\n"));
  }
  if (hasLearningComponent(interview, "Example") || lesson.examples?.trim()) {
    addTopic(topics, "examples", "Examples", lesson.examples);
  }
  addTopic(topics, "case-study", "Case Study", lesson.caseStudy);
  if (lesson.industryTips?.length) {
    addTopic(topics, "industry-tips", "Industry Tips", lesson.industryTips.map((t, i) => `${i + 1}. ${t}`).join("\n"));
  }
  if (lesson.interviewQuestions?.length) {
    addTopic(
      topics,
      "interview-prep",
      "Interview Questions",
      lesson.interviewQuestions.map((q, i) => `Q${i + 1}: ${q.question}\nA: ${q.answer}`).join("\n\n")
    );
  }
  if (lesson.faq?.length) {
    addTopic(topics, "faq", "FAQ", lesson.faq.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n"));
  }
  if (lesson.flashcards?.length) {
    addTopic(topics, "flashcards", "Flashcards", lesson.flashcards.map((f) => `Front: ${f.front}\nBack: ${f.back}`).join("\n\n"));
  }
  if (lesson.glossary?.length) {
    addTopic(topics, "glossary", "Glossary", lesson.glossary.map((g) => `${g.term}: ${g.definition}`).join("\n"));
  }
  if (lesson.visualContent?.length) {
    const visualText = lesson.visualContent
      .map((v) => `### ${v.title} (${v.type})\n**Placement**: ${v.placement}\n${v.description}${v.suggestedContent ? `\n${v.suggestedContent}` : ""}`)
      .join("\n\n");
    addTopic(topics, "visual-aids", "Visual Learning Aids", visualText);
  }
  if (lesson.diagrams?.length) {
    const diagramText = lesson.diagrams.map((d) => `### ${d.caption}\n\`\`\`mermaid\n${d.mermaid}\n\`\`\``).join("\n\n");
    addTopic(topics, "diagrams", "Diagrams", diagramText);
  }
  addTopic(topics, "cheat-sheet", "Cheat Sheet", lesson.cheatSheet);
  addTopic(topics, "summary", "Summary", lesson.summary);
  addTopic(topics, "revision", "Revision Notes", lesson.revision);

  if (lesson.revisionNotes) {
    const revisionNotesText = [
      `## Quick Summary\n${lesson.revisionNotes.quickSummary}`,
      `## Key Concepts\n${lesson.revisionNotes.keyConcepts.map(c => `- ${c}`).join("\n")}`,
      `## Important Formulas\n${lesson.revisionNotes.importantFormulas.map(f => `- ${f}`).join("\n")}`,
      `## Common Mistakes\n${lesson.revisionNotes.commonMistakes.map(m => `- ${m}`).join("\n")}`,
      `## Exam Tips\n${lesson.revisionNotes.examTips.map(t => `- ${t}`).join("\n")}`,
      `## Practice Questions\n${lesson.revisionNotes.practiceQuestions.map(q => `- ${q}`).join("\n")}`,
      `## Further Practice\n${lesson.revisionNotes.furtherPractice.map(p => `- ${p}`).join("\n")}`,
      lesson.revisionNotes.mindMap ? `## Mind Map\n${lesson.revisionNotes.mindMap}` : "",
    ].filter(Boolean).join("\n\n");

    addTopic(topics, "revision-notes", "Revision Notes (Detailed)", revisionNotesText);
  }

  if (lesson.researchPapers && lesson.researchPapers.length > 0) {
    const researchPapersText = lesson.researchPapers.map(paper => [
      `### ${paper.title}`,
      `**Authors**: ${paper.authors}`,
      `**Year**: ${paper.year}`,
      paper.conference ? `**Conference**: ${paper.conference}` : "",
      paper.journal ? `**Journal**: ${paper.journal}` : "",
      paper.doi ? `**DOI**: ${paper.doi}` : "",
      paper.url ? `**URL**: ${paper.url}` : "",
      `**Abstract**: ${paper.abstract}`,
      `**Summary**: ${paper.summary}`,
      `**Importance**: ${paper.importance}`,
      `**Difficulty**: ${paper.difficulty}`,
    ].filter(Boolean).join("\n")).join("\n\n---\n\n");

    addTopic(topics, "research-papers", "Research Papers", researchPapersText);
  }

  if (!topics.length && lesson.introduction?.trim()) {
    addTopic(topics, "topics", "Core Content", lesson.introduction);
  }

  const videos: LuCourseVideoJson[] = [];
  if (interview.videoStrategy.includeVideos !== false) {
    const resolved = resolveLessonVideos(lesson, interview, videoPool, globalVideoIndex);
    if (resolved.length) {
      videos.push(...resolved.map(mappingToVideoJson));
    }
  }

  const result: LuCourseLessonJson = {
    id: lessonId,
    title: lesson.title,
    durationMinutes: lesson.durationMinutes || 45,
    overview: lesson.introduction?.trim() || `Welcome to ${lesson.title}.`,
    objectives: lesson.objectives?.length ? lesson.objectives : ["Understand core concepts", "Apply techniques in practice"],
    topics,
    videos,
  };

  if (hasLearningComponent(interview, "Quiz") && lesson.quizQuestions?.length) {
    result.quiz = {
      title: `${lesson.title} Quiz`,
      questions: mapQuizQuestions(lesson.quizQuestions),
    };
  }

  if ((hasLearningComponent(interview, "Coding Lab") || hasLearningComponent(interview, "Coding") || hasLearningComponent(interview, "Lab")) && lesson.codingLab) {
    result.codingLab = {
      title: lesson.codingLab.title || `${lesson.title} Lab`,
      language: (lesson.codingLab as any).language || lesson.codeLanguage || "python",
      starterCode: (lesson.codingLab as any).starterCode || (lesson.codingLab as any).initialCode || lesson.codeExample || `// Starter code for ${lesson.title}`,
      expectedOutput: (lesson.codingLab as any).expectedOutput || (lesson.codingLab as any).solutionCode || "Output verification passed",
      problemStatement: (lesson.codingLab as any).problemStatement || (lesson.codingLab as any).instructions || `Implement solution for ${lesson.title}`,
      colabUrl: (lesson.codingLab as any).colabUrl,
      enableColab: true,
    };
  } else if (hasLearningComponent(interview, "Colab")) {
    result.codingLab = {
      title: `${lesson.title} — Google Colab`,
      language: "python",
      starterCode: `# Open in Google Colab\nprint("Colab lab ready")\n`,
      colabUrl: "https://colab.research.google.com",
      enableColab: true,
    };
  }

  if (hasLearningComponent(interview, "Interactive") || hasLearningComponent(interview, "Exercise")) {
    result.practice = {
      language: "python",
      starterCode: lesson.practice?.trim() || `print("Exercise for ${lesson.title}")`,
      expectedOutput: "Exercise completed successfully",
    };
  }

  if (hasLearningComponent(interview, "Jupyter") || hasLearningComponent(interview, "Notebook")) {
    result.notebook = lesson.notebook ?? {
      title: `${lesson.title} Notebook`,
      kernel: "python",
      cells: [
        { type: "markdown", source: `# ${lesson.title}` },
        { type: "code", source: `print("Hello from Jupyter")` },
      ],
    };
  }

  if (hasLearningComponent(interview, "Assignment") && lesson.assignment) {
    result.assignment = lesson.assignment;
  }
  if (hasLearningComponent(interview, "Project") && lesson.miniProject) {
    result.project = { ...lesson.miniProject, difficulty: "intermediate" };
  }
  if (hasLearningComponent(interview, "Research") || (lesson.researchPapers?.length ?? 0) > 0) {
    const papers = lesson.researchPapers ?? [];
    const literatureReview =
      papers.length > 0
        ? papers
            .slice(0, 5)
            .map(
              (p) =>
                `**${p.title}** (${p.authors}, ${p.year})\n${p.summary || p.abstract}`.trim()
            )
            .join("\n\n")
        : "";
    result.researchPaper = lesson.researchPaper ?? {
      title: `${lesson.title} — Research Paper`,
      paperType: "research",
      abstract:
        `Write an original research paper on ${lesson.title}. ` +
        `Synthesize course theory with ${papers.length ? `${papers.length} recommended readings` : "your literature review"}.`,
      enableOverleaf: true,
      enableColab: true,
      sections: [
        {
          title: "Introduction",
          content: lesson.introduction?.slice(0, 600) ?? lesson.theory?.slice(0, 400) ?? "Introduce the research problem and motivation.",
        },
        {
          title: "Literature Review",
          content: literatureReview || "Summarize and compare key papers relevant to this lesson.",
        },
        {
          title: "Methodology",
          content: "Describe your approach, data, and evaluation method.",
        },
        {
          title: "Results and Discussion",
          content: lesson.summary ?? "Present findings and connect them to the lesson objectives.",
        },
        {
          title: "Conclusion",
          content: "Summarize contributions and future work.",
        },
      ],
    };
  }

  if (
    hasLearningComponent(interview, "Download") ||
    hasLearningComponent(interview, "Dataset") ||
    lesson.resources?.length
  ) {
    result.resources = [...(lesson.resources ?? [])];
  }

  if (hasLearningComponent(interview, "Reference")) {
    if (lesson.lessonReferences && lesson.lessonReferences.length > 0) {
      result.references = lesson.lessonReferences.map(ref => ({
        citation: `${ref.title}${ref.authors ? ` by ${ref.authors}` : ''}${ref.year ? ` (${ref.year})` : ''}${ref.url ? ` [${ref.url}]` : ''}`,
      }));
    } else if (lesson.references && lesson.references.length > 0) {
      result.references = lesson.references;
    }
  }

  if (hasLearningComponent(interview, "Discussion") && lesson.discussionPrompt) {
    result.discussionPrompt = lesson.discussionPrompt;
  }

  result.checkpointMessage = `Excellent work completing ${lesson.title}!`;

  return result;
}

/** Blueprint + interview → validated JSON document (no LaTeX). */
export function blueprintToCourseDocument(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
): LuCourseDocument {
  const sanitizedBlueprint = deepSanitize(blueprint) as ArchitectBlueprint;
  const sanitizedInterview = deepSanitize(interview) as AICourseArchitectInterview;

  const videoPool = sanitizedInterview.videoStrategy?.mappings ?? [];
  const globalVideoIndex = { idx: 0 };

  const modules: LuCourseModuleJson[] = sanitizedBlueprint.modules.map((mod, mi) => {
    const modId = mod.id || `module-${pad2(mi + 1)}`;
    const lessons = mod.lessons.map((lesson, li) => {
      const lessonId = lesson.id || `lesson-${pad2(li + 1)}`;
      return lessonToJson(lesson, lessonId, sanitizedInterview, videoPool, globalVideoIndex);
    });

    const moduleJson: LuCourseModuleJson = {
      id: modId,
      title: mod.title,
      description: mod.description,
      learningOutcomes: mod.learningOutcomes,
      estimatedHours: mod.estimatedHours,
      lessons,
    };

    if (mod.project) {
      moduleJson.project = {
        title: mod.project.title,
        description: mod.project.description,
        instructions: mod.project.instructions,
        difficulty: mod.project.difficulty,
      };
    }

    if (mod.midExam && hasLearningComponent(sanitizedInterview, "Mid Exam")) {
      moduleJson.midExam = mapExamToQuiz(mod.midExam.title, mapQuizQuestions(mod.midExam.questions));
    }

    return moduleJson;
  });

  const doc: LuCourseDocument = {
    version: LU_COURSE_JSON_VERSION,
    course: {
      title: sanitizedBlueprint.courseTitle,
      description: sanitizedBlueprint.description,
      difficulty: sanitizedBlueprint.difficulty,
      estimatedHours: sanitizedBlueprint.estimatedHours,
      skills: sanitizedBlueprint.marketing?.tags?.slice(0, 10) ?? [],
      category: sanitizedBlueprint.category,
      modules,
    },
  };

  if (sanitizedBlueprint.capstone && hasLearningComponent(sanitizedInterview, "Capstone")) {
    doc.course.capstone = {
      title: sanitizedBlueprint.capstone.title,
      description: sanitizedBlueprint.capstone.description,
      instructions: sanitizedBlueprint.capstone.instructions,
    };
  }

  if (sanitizedBlueprint.finalExam && hasLearningComponent(sanitizedInterview, "Final Exam")) {
    doc.course.finalExam = mapExamToQuiz(
      sanitizedBlueprint.finalExam.title,
      mapQuizQuestions(sanitizedBlueprint.finalExam.questions)
    );
  }

  return deepSanitize(doc) as LuCourseDocument;
}
