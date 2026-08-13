/**
 * Agent 11 — Quality Review Engine
 * 100+ validation checks before content is accepted.
 */
import type {
  AICourseArchitectInterview,
  ArchitectBlueprint,
  ArchitectLessonBlueprint,
  ArchitectQualityReport,
} from "../types.js";
import { hasLearningComponent } from "../types.js";
import { scanObjectForPlaceholders, isSubstantiveText } from "./placeholderGuards.js";
import { isLikelyFakeUrl } from "../externalResearchApis.js";
import { isGenericLessonContent } from "../../lessonContentRepair.js";

export function reviewLessonContent(
  lesson: ArchitectLessonBlueprint,
  interview: AICourseArchitectInterview
): ArchitectQualityReport {
  const checks: ArchitectQualityReport["checks"] = [];
  const suggestions: string[] = [];

  const placeholderHits = scanObjectForPlaceholders({
    intro: lesson.introduction,
    theory: lesson.theory,
    summary: lesson.summary,
    quiz: lesson.quizQuestions,
    lab: lesson.codingLab,
  });
  checks.push({
    id: "no-placeholders",
    label: "No placeholder content",
    status: placeholderHits.length === 0 ? "pass" : "fail",
    detail: placeholderHits.length ? placeholderHits.slice(0, 3).join("; ") : "Clean",
  });
  if (placeholderHits.length) suggestions.push("Remove placeholder text and regenerate weak sections.");

  const genericTheory = isGenericLessonContent(lesson.theory || "");
  const genericSummary = lesson.summary ? isGenericLessonContent(lesson.summary) : true;
  checks.push({
    id: "generic-content",
    label: "No generic AI filler",
    status: !genericTheory && !genericSummary ? "pass" : "fail",
    detail: genericTheory ? "Generic theory detected" : genericSummary ? "Generic summary detected" : "Substantive",
  });
  if (genericTheory || genericSummary) {
    suggestions.push(`Regenerate substantive, lesson-specific prose for "${lesson.title}".`);
  }

  const repetitiveTakeaways = hasRepetitiveTakeaways(lesson.keyTakeaways ?? []);
  if ((lesson.keyTakeaways?.length ?? 0) > 0) {
    checks.push({
      id: "distinct-takeaways",
      label: "Distinct key takeaways",
      status: !repetitiveTakeaways ? "pass" : "fail",
      detail: repetitiveTakeaways ? "Repetitive takeaways detected" : "Distinct insights",
    });
  }

  const theoryWords = (lesson.theory || "").split(/\s+/).filter(Boolean).length;
  checks.push({
    id: "theory-depth",
    label: "Theory depth",
    status: theoryWords >= 280 ? "pass" : "fail",
    detail: `${theoryWords} words`,
  });

  checks.push({
    id: "objectives",
    label: "Learning objectives",
    status: (lesson.objectives?.length ?? 0) >= 3 ? "pass" : "fail",
    detail: `${lesson.objectives?.length ?? 0} objectives`,
  });

  checks.push({
    id: "summary",
    label: "Summary present",
    status:
      isSubstantiveText(lesson.summary ?? "", 45) && !isGenericLessonContent(lesson.summary ?? "")
        ? "pass"
        : "fail",
    detail: lesson.summary ? "Summary included" : "Missing summary",
  });
  if (!isSubstantiveText(lesson.summary ?? "", 45) || isGenericLessonContent(lesson.summary ?? "")) {
    suggestions.push(`Strengthen summary quality for "${lesson.title}" with concrete outcomes and next-lesson bridge.`);
  }

  const scaffoldLayerCount = ["## foundation", "## structure", "## application", "## depth"].filter((h) =>
    (lesson.theory || "").toLowerCase().includes(h)
  ).length;
  checks.push({
    id: "progressive-scaffolding",
    label: "Progressive scaffolding",
    status: scaffoldLayerCount >= 4 ? "pass" : "fail",
    detail: `${scaffoldLayerCount}/4 scaffold layers`,
  });
  if (scaffoldLayerCount < 4) {
    suggestions.push(`Add Foundation/Structure/Application/Depth scaffolding to "${lesson.title}".`);
  }

  const continuityMarkers = ["prior lesson", "builds on", "next lesson", "prepare for next"]
    .filter((m) => `${lesson.introduction || ""}\n${lesson.theory || ""}\n${lesson.revision || ""}`.toLowerCase().includes(m)).length;
  checks.push({
    id: "pedagogical-continuity",
    label: "Cross-lesson continuity",
    status: continuityMarkers >= 2 ? "pass" : "fail",
    detail: `${continuityMarkers} continuity markers`,
  });

  if (hasLearningComponent(interview, "Quiz") || interview.lessonStructure.includes("mini-quiz")) {
    const qCount = lesson.quizQuestions?.length ?? 0;
    const badQuiz = lesson.quizQuestions?.some(
      (q) => !isSubstantiveText(q.text, 6) || (q.type === "mcq" && q.options.length < 4) || !q.explanation
    );
    checks.push({
      id: "quiz-quality",
      label: "Quiz assessments",
      status: qCount >= 8 && !badQuiz ? "pass" : qCount >= 5 ? "warn" : "fail",
      detail: `${qCount} questions${badQuiz ? " (quality issues)" : ""}`,
    });
    if (qCount < 8) suggestions.push(`Expand quiz to 10 substantive questions for "${lesson.title}".`);
  }

  if (hasLearningComponent(interview, "Coding") || hasLearningComponent(interview, "Coding Lab")) {
    const lab = lesson.codingLab;
    const labOk =
      lab &&
      lab.starterCode &&
      lab.starterCode.length > 80 &&
      !/your solution here/i.test(lab.starterCode) &&
      lab.expectedOutput;
    checks.push({
      id: "coding-lab",
      label: "Coding lab completeness",
      status: labOk ? "pass" : "fail",
      detail: labOk ? lab!.title : "Missing or stub lab",
    });
    if (!labOk) suggestions.push(`Generate complete coding lab for "${lesson.title}".`);
  }

  if (lesson.videos?.length) {
    checks.push({
      id: "video-attached",
      label: "Instructor/AI videos",
      status: lesson.videos.length >= 3 ? "pass" : "warn",
      detail: `${lesson.videos.length} video(s) mapped`,
    });
    const fakeVideoUrls = lesson.videos.filter((v) => isLikelyFakeUrl(v.url)).length;
    if (fakeVideoUrls > 0) {
      checks.push({
        id: "video-urls",
        label: "Video URL validity",
        status: "fail",
        detail: `${fakeVideoUrls} suspicious video URL(s)`,
      });
      suggestions.push("Replace placeholder video URLs with real resources.");
    }
  } else if (interview.videoStrategy.includeVideos) {
    checks.push({
      id: "video-attached",
      label: "Instructor/AI videos",
      status: "warn",
      detail: "No videos mapped",
    });
  }

  if (lesson.researchPapers?.length) {
    const fakePapers = lesson.researchPapers.filter(
      (p) => isLikelyFakeUrl(p.url) || /example author|research team/i.test(p.authors)
    ).length;
    checks.push({
      id: "research-papers",
      label: "Research papers",
      status: fakePapers === 0 && lesson.researchPapers.length >= 3 ? "pass" : fakePapers > 0 ? "fail" : "warn",
      detail: `${lesson.researchPapers.length} papers${fakePapers ? ` (${fakePapers} suspicious)` : ""}`,
    });
  }

  if (lesson.lessonReferences?.length) {
    const fakeRefs = lesson.lessonReferences.filter((r) => isLikelyFakeUrl(r.url)).length;
    checks.push({
      id: "references",
      label: "Lesson references",
      status: fakeRefs === 0 ? "pass" : "fail",
      detail: `${lesson.lessonReferences.length} references`,
    });
  }
  const further = lesson.furtherReading ?? [];
  if (further.length > 0) {
    const placeholderFurther = further.filter((r) => !r.url || /example\.com|wikipedia\.org\/wiki\/main_page/i.test(r.url)).length;
    checks.push({
      id: "further-reading",
      label: "Further reading quality",
      status: placeholderFurther === 0 && further.length >= 3 ? "pass" : "fail",
      detail: `${further.length} links${placeholderFurther ? ` (${placeholderFurther} weak)` : ""}`,
    });
    if (placeholderFurther > 0) suggestions.push(`Replace weak further-reading links in "${lesson.title}" with authoritative sources.`);
  }

  if (lesson.glossary?.length) {
    checks.push({
      id: "glossary",
      label: "Glossary",
      status: lesson.glossary.length >= 3 ? "pass" : "warn",
      detail: `${lesson.glossary.length} terms`,
    });
  }

  if (lesson.assignment) {
    checks.push({
      id: "assignment",
      label: "Assignment completeness",
      status:
        isSubstantiveText(lesson.assignment.instructions, 40) && (lesson.assignment.rubric?.length ?? 0) >= 2
          ? "pass"
          : "warn",
      detail: lesson.assignment.title,
    });
  }

  if (lesson.flowchart || lesson.visualDiagram) {
    checks.push({
      id: "diagrams",
      label: "Diagrams",
      status: /flowchart|graph|sequenceDiagram/i.test(`${lesson.flowchart}${lesson.visualDiagram}`)
        ? "pass"
        : "warn",
      detail: "Mermaid diagrams present",
    });
  }

  if (hasLearningComponent(interview, "Coding") || lesson.codeExample) {
    const codeOk =
      lesson.codeExample &&
      lesson.codeExample.length >= 40 &&
      !/your (code|solution) here/i.test(lesson.codeExample);
    if (!checks.some((c) => c.id === "coding-lab")) {
      checks.push({
        id: "code-example",
        label: "Code examples",
        status: codeOk ? "pass" : "warn",
        detail: codeOk ? "Runnable code present" : "Missing or stub code",
      });
    }
  }

  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const score = Math.max(0, 100 - failCount * 20 - warnCount * 5);

  return {
    score,
    passed: failCount === 0 && score >= 85,
    checks,
    suggestions,
  };
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function hasRepetitiveTakeaways(takeaways: string[]): boolean {
  const sets = takeaways.map(tokenSet);
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      if (jaccardSimilarity(sets[i], sets[j]) > 0.65) return true;
    }
  }
  return false;
}

export function reviewFullBlueprint(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
): ArchitectQualityReport {
  const checks: ArchitectQualityReport["checks"] = [];
  const suggestions: string[] = [];
  const lessons = blueprint.modules.flatMap((m) => m.lessons);

  const titles = lessons.map((l) => l.title.toLowerCase().trim());
  const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
  checks.push({
    id: "no-duplicate-lessons",
    label: "No duplicate lessons",
    status: dupes.length === 0 ? "pass" : "warn",
    detail: dupes.length ? `${dupes.length} duplicate titles` : "Unique lesson titles",
  });

  const genericLessons = lessons.filter(
    (l) => isGenericLessonContent(l.theory || "") || (l.summary ? isGenericLessonContent(l.summary) : false)
  );
  checks.push({
    id: "course-generic-rate",
    label: "Low-value content rate",
    status: lessons.length && genericLessons.length / lessons.length <= 0.15 ? "pass" : "fail",
    detail: `${genericLessons.length}/${lessons.length} lessons with generic filler`,
  });
  if (genericLessons.length > 0) {
    suggestions.push(`Regenerate ${genericLessons.length} lesson(s) with generic or repetitive content.`);
  }

  const continuityWeakLessons = lessons.filter((l) => {
    const blob = `${l.introduction || ""}\n${l.theory || ""}\n${l.revision || ""}`.toLowerCase();
    const count = ["prior lesson", "builds on", "next lesson", "prepare for next"].filter((m) => blob.includes(m)).length;
    return count < 2;
  });
  checks.push({
    id: "course-continuity-rate",
    label: "Pedagogical continuity rate",
    status: lessons.length && continuityWeakLessons.length / lessons.length <= 0.2 ? "pass" : "fail",
    detail: `${continuityWeakLessons.length}/${lessons.length} lessons with weak continuity`,
  });
  if (continuityWeakLessons.length > 0) {
    suggestions.push(`Improve cross-lesson transitions in ${continuityWeakLessons.length} lesson(s).`);
  }

  let lessonPass = 0;
  for (const lesson of lessons) {
    const r = reviewLessonContent(lesson, interview);
    if (r.passed) lessonPass++;
    checks.push(...r.checks.map((c) => ({ ...c, id: `${lesson.id}-${c.id}`, label: `${lesson.title}: ${c.label}` })));
    suggestions.push(...r.suggestions);
  }

  const avgScore = lessons.length ? Math.round((lessonPass / lessons.length) * 100) : 0;
  checks.push({
    id: "lesson-pass-rate",
    label: "Lesson quality pass rate",
    status: avgScore >= 90 ? "pass" : avgScore >= 75 ? "warn" : "fail",
    detail: `${lessonPass}/${lessons.length} lessons passed (${avgScore}%)`,
  });

  const failCount = checks.filter((c) => c.status === "fail").length;
  const score = Math.max(0, Math.min(100, avgScore - failCount * 2));

  return {
    score,
    passed: score >= 90 && failCount === 0,
    checks,
    suggestions: [...new Set(suggestions)].slice(0, 12),
  };
}
