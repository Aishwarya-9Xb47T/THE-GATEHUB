import { parseCommandBlock } from "./learning-universe-parser.js";

/** Commands recognized by the Academic Course Studio DSL parser */
export const COURSE_PARSER_COMMANDS = [
  "course",
  "chapter",
  "lesson",
  "overview",
  "overviewmarkdown",
  "video",
  "quiz",
  "question",
  "option",
  "practice",
  "assignment",
  "image",
  "resource",
] as const;

export interface ParsedCourseMeta {
  title: string;
  description: string;
  subtitle?: string;
  price?: number;
  difficulty?: string;
  category?: string;
  subcategory?: string;
  language?: string;
  thumbnail?: string;
}

export interface ParsedCourseLesson {
  title: string;
  overview?: string;
  videos: Array<{ type: string; url: string; title?: string }>;
  quiz?: {
    title?: string;
    questions: Array<{
      text: string;
      explanation?: string;
      options: Array<{ text: string; isCorrect: boolean }>;
    }>;
  };
  practice?: {
    title: string;
    language: string;
    initialCode: string;
    expectedOutput?: string;
  };
  assignment?: {
    title: string;
    instructions: string;
    dueDate?: string;
    points?: number;
  };
  resources: Array<{ type: string; title: string; url?: string }>;
}

export interface ParsedCourseChapter {
  title: string;
  description?: string;
  lessons: ParsedCourseLesson[];
}

export interface ParsedCourseDsl {
  course: ParsedCourseMeta;
  chapters: ParsedCourseChapter[];
  warnings: string[];
}

function stripLatexComments(text: string): string {
  let result = "";
  let braceDepth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "\\" && i + 1 < text.length) {
      result += char + text[i + 1];
      i++;
      continue;
    }
    if (char === "{") {
      braceDepth++;
      result += char;
      continue;
    }
    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      result += char;
      continue;
    }
    if (char === "%" && braceDepth === 0) {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    result += char;
  }
  return result;
}

function extractCommandContent(latex: string, startIndex: number): { content: string; endIndex: number } {
  let braceCount = 0;
  let content = "";
  let i = startIndex;
  let insideContent = false;

  while (i < latex.length) {
    const char = latex[i];
    if (char === "{") {
      braceCount++;
      if (braceCount === 1) {
        insideContent = true;
        i++;
        continue;
      }
      if (insideContent) content += char;
    } else if (char === "}") {
      braceCount--;
      if (braceCount === 0) break;
      if (insideContent) content += char;
    } else if (insideContent) {
      content += char;
    }
    i++;
  }

  return { content, endIndex: i + 1 };
}

function parseInlineQuizOptions(params: Record<string, string>) {
  const options: Array<{ text: string; isCorrect: boolean }> = [];
  const correctRaw = (params["correct"] || params["answer"] || "").trim().toUpperCase();
  const correctLetters = new Set(
    correctRaw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
  );

  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(97 + i);
    const upperLetter = String.fromCharCode(65 + i);
    const optionKey = `option${letter}`;
    if (params[optionKey]) {
      options.push({
        text: params[optionKey],
        isCorrect: correctLetters.has(upperLetter) || correctLetters.has(params[optionKey].toUpperCase()),
      });
    }
  }
  return options;
}

function detectVideoType(url: string, explicit?: string): string {
  if (explicit) return explicit;
  const lower = (url || "").toLowerCase();
  if (lower.includes("vimeo.com")) return "vimeo";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  if (lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov")) return "upload";
  return "youtube";
}

function emptyLesson(title = "Untitled Lesson"): ParsedCourseLesson {
  return { title, videos: [], resources: [] };
}

export function parseCourseDslLatex(latexContent: string): ParsedCourseDsl {
  let docContent = latexContent;
  const beginDocMatch = latexContent.indexOf("\\begin{document}");
  const endDocMatch = latexContent.indexOf("\\end{document}");
  if (beginDocMatch !== -1 && endDocMatch !== -1) {
    docContent = latexContent.slice(beginDocMatch + "\\begin{document}".length, endDocMatch);
  }

  docContent = stripLatexComments(docContent)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "");

  const commands: Array<{ type: string; content: string }> = [];
  const commandPositions: Array<{ name: string; startIndex: number; openBraceIndex: number }> = [];

  for (const cmdName of COURSE_PARSER_COMMANDS) {
    const variants = [`\\${cmdName}{`, `\\${cmdName}={`];
    for (const searchStr of variants) {
      let lastFound = 0;
      while (true) {
        const foundIndex = docContent.indexOf(searchStr, lastFound);
        if (foundIndex === -1) break;
        const openBraceIndex = foundIndex + searchStr.length - 1;
        commandPositions.push({ name: cmdName, startIndex: foundIndex, openBraceIndex });
        lastFound = foundIndex + 1;
      }
    }
  }

  commandPositions.sort((a, b) => {
    if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
    return b.name.length - a.name.length;
  });

  const seenStarts = new Set<number>();
  for (const pos of commandPositions) {
    if (seenStarts.has(pos.startIndex)) continue;
    seenStarts.add(pos.startIndex);
    const { content } = extractCommandContent(docContent, pos.openBraceIndex);
    commands.push({ type: pos.name, content });
  }

  let course: ParsedCourseMeta = { title: "Untitled Course", description: "" };
  const chapters: ParsedCourseChapter[] = [];
  let currentChapter: ParsedCourseChapter | null = null;
  let currentLesson: ParsedCourseLesson | null = null;
  let currentQuiz: NonNullable<ParsedCourseLesson["quiz"]> | null = null;
  let currentQuestion: NonNullable<ParsedCourseLesson["quiz"]>["questions"][number] | null = null;
  const warnings: string[] = [];

  function flushLesson() {
    if (currentLesson && currentChapter) {
      currentChapter.lessons.push(currentLesson);
      currentLesson = null;
      currentQuiz = null;
      currentQuestion = null;
    }
  }

  function flushChapter() {
    flushLesson();
    if (currentChapter) {
      chapters.push(currentChapter);
      currentChapter = null;
    }
  }

  for (const cmd of commands) {
    const params = parseCommandBlock(cmd.content);
    switch (cmd.type) {
      case "course": {
        course = {
          title: params["title"] || "Untitled Course",
          description: params["description"] || "",
          subtitle: params["subtitle"],
          price: params["price"] ? parseFloat(params["price"]) : undefined,
          difficulty: params["difficulty"],
          category: params["category"],
          subcategory: params["subcategory"],
          language: params["language"],
          thumbnail: params["thumbnail"],
        };
        break;
      }
      case "chapter": {
        flushChapter();
        currentChapter = {
          title: params["title"] || "Untitled Chapter",
          description: params["description"],
          lessons: [],
        };
        break;
      }
      case "lesson": {
        flushLesson();
        if (!currentChapter) {
          currentChapter = { title: "Chapter 1", lessons: [] };
          chapters.push(currentChapter);
          warnings.push("Lesson found without \\chapter — auto-created default chapter.");
        }
        currentLesson = emptyLesson(params["title"] || "Untitled Lesson");
        break;
      }
      case "overview":
      case "overviewmarkdown": {
        if (!currentLesson) {
          warnings.push(`\\${cmd.type} without \\lesson — skipped.`);
          break;
        }
        currentLesson.overview =
          params["text"] ||
          params["overviewmarkdown"] ||
          params["overview"] ||
          params["content"] ||
          cmd.content.trim();
        break;
      }
      case "video": {
        if (!currentLesson) {
          warnings.push("\\video without \\lesson — skipped.");
          break;
        }
        const url = params["url"] || params["file"] || "";
        currentLesson.videos.push({
          type: detectVideoType(url, params["type"]),
          url,
          title: params["title"],
        });
        break;
      }
      case "quiz": {
        if (!currentLesson) {
          warnings.push("\\quiz without \\lesson — skipped.");
          break;
        }
        currentQuiz = { title: params["title"], questions: [] };
        if (params["question"]) {
          currentQuiz.questions.push({
            text: params["question"],
            explanation: params["explanation"],
            options: parseInlineQuizOptions(params),
          });
        }
        currentLesson.quiz = currentQuiz;
        break;
      }
      case "question": {
        if (!currentQuiz) break;
        currentQuestion = {
          text: params["text"] || params["question"] || params["content"] || "",
          explanation: params["explanation"],
          options: [],
        };
        currentQuiz.questions.push(currentQuestion);
        break;
      }
      case "option": {
        if (!currentQuestion) break;
        currentQuestion.options.push({
          text: params["text"] || params["content"] || "",
          isCorrect:
            params["iscorrect"]?.toLowerCase() === "true" ||
            params["correct"]?.toLowerCase() === "true",
        });
        break;
      }
      case "practice": {
        if (!currentLesson) break;
        currentLesson.practice = {
          title: params["title"] || "Practice",
          language: params["language"] || "python",
          initialCode: params["startercode"] || params["initialcode"] || "",
          expectedOutput: params["expectedoutput"],
        };
        break;
      }
      case "assignment": {
        if (!currentLesson) break;
        currentLesson.assignment = {
          title: params["title"] || "Assignment",
          instructions: params["instructions"] || params["content"] || cmd.content.trim(),
          dueDate: params["duedate"] || params["due_date"],
          points: params["points"] ? parseInt(params["points"], 10) : undefined,
        };
        break;
      }
      case "resource": {
        if (!currentLesson) break;
        currentLesson.resources.push({
          type: params["type"] || "link",
          title: params["title"] || "Resource",
          url: params["url"],
        });
        break;
      }
      default:
        break;
    }
  }

  flushChapter();

  if (chapters.length === 0) {
    warnings.push("No \\chapter blocks found — course will be created with metadata only.");
  }

  return { course, chapters, warnings };
}
