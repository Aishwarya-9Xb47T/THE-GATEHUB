/**
 * Canonical JSON course schema — the ONLY format AI may produce.
 * No LaTeX, no LMS commands, no .tex syntax.
 */

export const LU_COURSE_JSON_VERSION = 1;

export interface LuCourseVideoJson {
  type: "youtube" | "upload" | "placeholder";
  url?: string;
  file?: string;
  title: string;
  youtubeId?: string;
  thumbnail?: string;
  duration?: string;
}

export interface LuCourseQuizQuestionJson {
  text: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  difficulty?: string;
  topic?: string;
  bloomLevel?: string;
  timeEstimateSeconds?: number;
  hints?: string[];
  wrongOptionExplanations?: Record<string, string>;
  followUpReading?: string;
}

export interface LuCourseQuizJson {
  title: string;
  questions: LuCourseQuizQuestionJson[];
}

export interface LuCourseCodingLabJson {
  title: string;
  language: string;
  starterCode: string;
  expectedOutput?: string;
  problemStatement?: string;
  timeLimitMs?: number;
  colabUrl?: string;
}

export interface LuCourseTopicSectionJson {
  id: string;
  title: string;
  body: string;
}

export interface LuCourseResourceJson {
  title: string;
  url: string;
  type: string;
}

export interface LuCourseReferenceJson {
  citation: string;
}

export interface LuCourseLessonJson {
  id: string;
  title: string;
  durationMinutes: number;
  overview: string;
  objectives: string[];
  topics: LuCourseTopicSectionJson[];
  videos: LuCourseVideoJson[];
  quiz?: LuCourseQuizJson;
  codingLab?: LuCourseCodingLabJson;
  practice?: { language: string; starterCode: string; expectedOutput: string };
  notebook?: { title: string; kernel: string; cells: Array<{ type: string; source: string }> };
  assignment?: { title: string; instructions: string; points: number; dueDate?: string };
  project?: { title: string; description: string; instructions: string; difficulty?: string };
  researchPaper?: { title: string; abstract: string; sections: Array<{ title: string; content: string }> };
  resources?: LuCourseResourceJson[];
  references?: LuCourseReferenceJson[];
  discussionPrompt?: string;
  checkpointMessage?: string;
}

export interface LuCourseModuleJson {
  id: string;
  title: string;
  description: string;
  learningOutcomes: string[];
  estimatedHours: number;
  lessons: LuCourseLessonJson[];
  project?: { title: string; description: string; instructions: string; difficulty?: string };
  midExam?: LuCourseQuizJson;
}

export interface LuCourseDocument {
  version: typeof LU_COURSE_JSON_VERSION;
  course: {
    title: string;
    description: string;
    difficulty: string;
    estimatedHours: number;
    skills: string[];
    category?: string;
    modules: LuCourseModuleJson[];
    capstone?: { title: string; description: string; instructions: string };
    finalExam?: LuCourseQuizJson;
  };
}

export interface LuCourseValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface LuCourseValidationResult {
  valid: boolean;
  issues: LuCourseValidationIssue[];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function validateQuiz(quiz: LuCourseQuizJson, path: string, issues: LuCourseValidationIssue[]): void {
  if (!isNonEmptyString(quiz.title)) {
    issues.push({ path: `${path}.title`, code: "MISSING_TITLE", message: "Quiz title is required" });
  }
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    issues.push({ path: `${path}.questions`, code: "NO_QUESTIONS", message: "Quiz must have at least one question" });
    return;
  }
  quiz.questions.forEach((q, qi) => {
    const qp = `${path}.questions[${qi}]`;
    if (!isNonEmptyString(q.text)) {
      issues.push({ path: `${qp}.text`, code: "MISSING_QUESTION_TEXT", message: "Question text is required" });
    }
    if (!Array.isArray(q.options) || q.options.length < 1) {
      issues.push({ path: `${qp}.options`, code: "INVALID_OPTIONS", message: "Question needs at least 1 option" });
    }
    if (!isNonEmptyString(q.correctAnswer)) {
      issues.push({ path: `${qp}.correctAnswer`, code: "MISSING_CORRECT", message: "Correct answer is required" });
    }
    if (!isNonEmptyString(q.explanation)) {
      issues.push({ path: `${qp}.explanation`, code: "MISSING_EXPLANATION", message: "Explanation is required" });
    }
  });
}

function validateLesson(lesson: LuCourseLessonJson, path: string, issues: LuCourseValidationIssue[]): void {
  if (!isNonEmptyString(lesson.id)) {
    issues.push({ path: `${path}.id`, code: "MISSING_ID", message: "Lesson id is required" });
  }
  if (!isNonEmptyString(lesson.title)) {
    issues.push({ path: `${path}.title`, code: "MISSING_TITLE", message: "Lesson title is required" });
  }
  if (!isNonEmptyString(lesson.overview)) {
    issues.push({ path: `${path}.overview`, code: "MISSING_OVERVIEW", message: "Lesson overview is required" });
  }
  if (!Array.isArray(lesson.objectives) || lesson.objectives.length === 0) {
    issues.push({ path: `${path}.objectives`, code: "MISSING_OBJECTIVES", message: "Lesson objectives are required" });
  }
  if (!Array.isArray(lesson.topics) || lesson.topics.length === 0) {
    if (!lesson.codingLab && !lesson.quiz) {
      issues.push({ path: `${path}.topics`, code: "MISSING_CONTENT", message: "Lesson needs topics or interactive content" });
    }
  }
  if (lesson.quiz) validateQuiz(lesson.quiz, `${path}.quiz`, issues);
  if (lesson.codingLab) {
    const lab = lesson.codingLab;
    if (!isNonEmptyString(lab.title)) {
      issues.push({ path: `${path}.codingLab.title`, code: "MISSING_LAB_TITLE", message: "Coding lab title is required" });
    }
    if (!isNonEmptyString(lab.starterCode)) {
      issues.push({ path: `${path}.codingLab.starterCode`, code: "MISSING_STARTER", message: "Coding lab starter code is required" });
    }
  }
}

/** Validate course JSON before any LaTeX rendering. */
export function validateCourseDocument(doc: LuCourseDocument): LuCourseValidationResult {
  const issues: LuCourseValidationIssue[] = [];

  if (doc.version !== LU_COURSE_JSON_VERSION) {
    issues.push({ path: "version", code: "INVALID_VERSION", message: `Expected version ${LU_COURSE_JSON_VERSION}` });
  }

  const c = doc.course;
  if (!c) {
    issues.push({ path: "course", code: "MISSING_COURSE", message: "course object is required" });
    return { valid: false, issues };
  }

  if (!isNonEmptyString(c.title)) {
    issues.push({ path: "course.title", code: "MISSING_TITLE", message: "Course title is required" });
  }
  if (!Array.isArray(c.modules) || c.modules.length === 0) {
    issues.push({ path: "course.modules", code: "NO_MODULES", message: "At least one module is required" });
  }

  c.modules?.forEach((mod, mi) => {
    const mp = `course.modules[${mi}]`;
    if (!isNonEmptyString(mod.title)) {
      issues.push({ path: `${mp}.title`, code: "MISSING_TITLE", message: "Module title is required" });
    }
    if (!Array.isArray(mod.lessons) || mod.lessons.length === 0) {
      issues.push({ path: `${mp}.lessons`, code: "NO_LESSONS", message: "Module must have at least one lesson" });
    }
    mod.lessons?.forEach((lesson, li) => validateLesson(lesson, `${mp}.lessons[${li}]`, issues));
    if (mod.midExam) validateQuiz(mod.midExam, `${mp}.midExam`, issues);
  });

  if (c.finalExam) validateQuiz(c.finalExam, "course.finalExam", issues);

  return { valid: issues.length === 0, issues };
}

export class CourseJsonValidationError extends Error {
  readonly issues: LuCourseValidationIssue[];

  constructor(issues: LuCourseValidationIssue[]) {
    super(issues[0]?.message ?? "Course JSON validation failed");
    this.name = "CourseJsonValidationError";
    this.issues = issues;
  }
}

export function assertValidCourseDocument(doc: LuCourseDocument): void {
  const result = validateCourseDocument(doc);
  if (!result.valid) throw new CourseJsonValidationError(result.issues);
}
