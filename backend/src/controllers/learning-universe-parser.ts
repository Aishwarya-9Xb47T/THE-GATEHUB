import { PARSER_COMMANDS } from "../services/learningCommandRegistry.js";
import { validateColabUrl } from "../services/colabUrlValidator.js";
import { unescapeLatex } from "../services/luProject/luTexEscape.js";
import { repairStarterCode } from "../services/labCodeRepair.js";

// New, clean parser for Learning Universe LaTeX commands
interface LearningUniverse {
  title: string;
  description: string;
  thumbnail?: string;
  difficulty?: string;
  estimatedHours?: number;
  skills?: string[];
  categoryRel?: any;
}

interface Track {
  title: string;
  description: string;
  learningOutcomes?: string;
  careerOutcomes?: string;
  difficulty?: string;
  modules: Module[];
}

interface Module {
  title: string;
  description: string;
  prerequisites?: string;
  learningOutcomes?: string;
  estimatedHours?: number;
  lessons: Lesson[];
}

interface ContentBlock {
  type: string;
  content: any;
}

interface Lesson {
  title: string;
  overviewMarkdown?: string;
  overviewHtml?: string;
  contentBlocks: ContentBlock[]; // NEW: All content in ordered blocks
  videos: Video[];
  practice?: Practice;
  quiz?: Quiz;
  project?: Project;
  resources: Resource[];
}

interface Video {
  type: string;
  url: string;
  title?: string;
}

interface Practice {
  title: string;
  language: string;
  initialCode: string;
  expectedOutput?: string;
  solution?: string;
  hints?: string[];
}

interface Quiz {
  title?: string;
  questions: QuizQuestion[];
}

interface QuizQuestion {
  text: string;
  type?: string;
  explanation?: string;
  difficulty?: string;
  points?: number;
  options: QuizOption[];
  blanks?: Array<{ id: string; answer: string; caseSensitive: boolean }>;
  matching?: Array<{ left: string; right: string }>;
  sampleAnswer?: string;
  rubric?: string;
  starterCode?: string;
}

interface QuizOption {
  text: string;
  isCorrect: boolean;
}

interface Project {
  title: string;
  description: string;
  difficulty?: string;
  instructions: string;
  expectedOutput?: string;
  colabUrl?: string;
  githubUrl?: string;
  submissionType?: string;
}

interface Resource {
  type: string;
  title: string;
  url?: string;
  fileUrl?: string;
}

export interface ParsedLearningUniverse {
  universe: LearningUniverse;
  tracks: Track[];
  warnings: string[];
}

/** Strip LaTeX % comments only outside brace-balanced regions (preserves modulo % in DSL values). */
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

// Helper to extract a brace-balanced {value} starting at index of '{'
function extractBraceValue(text: string, openBraceIndex: number): { value: string; end: number } | null {
  if (text[openBraceIndex] !== "{") return null;
  let depth = 0;
  for (let i = openBraceIndex; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        return { value: text.slice(openBraceIndex + 1, i), end: i + 1 };
      }
    }
  }
  return null;
}

const CODE_PARAM_KEYS = new Set([
  "startercode",
  "initialcode",
  "solution",
  "code",
  "starter_code",
  "initial_code",
]);

function normalizeParamValue(key: string, value: string): string {
  let v = value;
  if (key === "url" || key === "file") {
    v = v.replace(/\\&/g, "&").replace(/\\%/g, "%").replace(/\\#/g, "#").replace(/\\_/g, "_");
  }
  if (CODE_PARAM_KEYS.has(key)) {
    return v.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");
  }
  return v.trim();
}

// Helper function to parse a single command block
export function parseCommandBlock(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  const lines = content.split(/\r?\n/);
  let topLevelContent = "";
  for (const line of lines) {
    if (line.trim().startsWith("\\")) break;
    topLevelContent += line + "\n";
  }
  topLevelContent = topLevelContent.trimEnd();

  const keyPattern = /(\w+)\s*=/g;
  let match: RegExpExecArray | null;
  while ((match = keyPattern.exec(topLevelContent)) !== null) {
    const key = match[1].toLowerCase();
    let pos = match.index + match[0].length;
    while (pos < topLevelContent.length && /\s/.test(topLevelContent[pos])) pos++;

    if (topLevelContent[pos] === "{") {
      const extracted = extractBraceValue(topLevelContent, pos);
      if (extracted) {
        parsed[key] = normalizeParamValue(key, extracted.value);
        keyPattern.lastIndex = extracted.end;
        continue;
      }
    }
    if (topLevelContent[pos] === '"') {
      const end = topLevelContent.indexOf('"', pos + 1);
      if (end !== -1) {
        parsed[key] = topLevelContent.slice(pos + 1, end).trim();
        keyPattern.lastIndex = end + 1;
        continue;
      }
    }
    if (topLevelContent[pos] === "'") {
      const end = topLevelContent.indexOf("'", pos + 1);
      if (end !== -1) {
        parsed[key] = topLevelContent.slice(pos + 1, end).trim();
        keyPattern.lastIndex = end + 1;
        continue;
      }
    }
    const bare = topLevelContent.slice(pos).match(/^([^\s,}]+)/);
    if (bare) {
      parsed[key] = bare[1].trim();
      keyPattern.lastIndex = pos + bare[0].length;
    }
  }

  if (Object.keys(parsed).length === 0) {
    parsed["content"] = content.trim();
  }

  return parsed;
}

function parseLegacyOptions(params: Record<string, string>): QuizOption[] {
  const raw = params["options"];
  if (!raw) return [];

  const answer = (params["answer"] || params["correct"] || "").trim();
  const items = raw.split("|").map((s) => s.trim()).filter(Boolean);

  return items.map((text, i) => {
    const letter = String.fromCharCode(65 + i);
    const isCorrect =
      text === answer ||
      letter === answer.toUpperCase() ||
      text.toLowerCase() === answer.toLowerCase();
    return { text, isCorrect };
  });
}

function parseB64Json<T>(params: Record<string, string>, key: string): T | null {
  const raw = params[`${key}b64`];
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function parseFillBlankAnswers(params: Record<string, string>): Array<{ id: string; answer: string; caseSensitive: boolean }> {
  const ids = (params["blankids"] || params["blankIds"] || "b1")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.map((id) => ({
    id,
    answer: params[`${id.toLowerCase()}answer`] ?? params[`${id}answer`] ?? "",
    caseSensitive:
      (params[`${id.toLowerCase()}case`] ?? params[`${id}case`] ?? "false").toLowerCase() === "true",
  }));
}

function parseMatchingPairs(params: Record<string, string>): Array<{ left: string; right: string }> {
  const left = (params["matchleft"] || params["matchLeft"] || "").split("|").map((s) => s.replace(/\\\|/g, "|"));
  const right = (params["matchright"] || params["matchRight"] || "").split("|").map((s) => s.replace(/\\\|/g, "|"));
  const pairs: Array<{ left: string; right: string }> = [];
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i++) {
    pairs.push({ left: left[i] ?? "", right: right[i] ?? "" });
  }
  return pairs;
}

function buildQuestionOptions(params: Record<string, string>, qType: string): QuizOption[] {
  const type = qType.toLowerCase();
  if (type === "true-false") {
    const correct = (params["correct"] || "true").toLowerCase();
    return [
      { text: "True", isCorrect: correct === "true" },
      { text: "False", isCorrect: correct === "false" },
    ];
  }
  if (type === "fill-blank" || type === "short-answer" || type === "long-answer" || type === "essay" || type === "numerical" || type === "coding") {
    return [];
  }
  return parseInlineQuizOptions(params);
}

function parseInlineQuizOptions(params: Record<string, string>): QuizOption[] {
  // Legacy pipe-separated format: options={A|B|C}, answer={A}
  if (params["options"]?.includes("|")) {
    return parseLegacyOptions(params);
  }

  const options: QuizOption[] = [];
  const correctRaw = (params["correct"] || params["answer"] || "").trim().toUpperCase();
  const correctLetters = new Set(
    correctRaw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
  );

  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(97 + i);
    const upperLetter = String.fromCharCode(65 + i);
    const optionKey = `option${letter}`;
    if (optionKey === "options") continue;
    if (params[optionKey]) {
      options.push({
        text: params[optionKey],
        isCorrect: correctLetters.has(upperLetter) || correctLetters.has(params[optionKey].toUpperCase()),
      });
    }
  }

  if (options.length === 0) {
    return parseLegacyOptions(params);
  }
  return options;
}

import { detectVideoSourceType, extractYouTubeId } from "../utils/videoSourceUtils.js";
import {
  commandInnerToDocument,
  toDocumentBlock,
} from "../../../shared/lesson-body/dist/documentPipeline.js";

// Helper function to extract command content with nested braces
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
        insideContent = true; // start capturing after first {
        i++;
        continue;
      }
      if (insideContent) {
        content += char;
      }
    } else if (char === "}") {
      braceCount--;
      if (braceCount === 0) {
        // found matching closing brace
        break;
      }
      if (insideContent) {
        content += char;
      }
    } else if (insideContent) {
      content += char;
    }
    i++;
  }

  return { content, endIndex: i + 1 }; // +1 to skip the closing brace
}


const allCommands = [...PARSER_COMMANDS];

// Helper to parse content and build hierarchy
export function parseLearningUniverseLatex(latexContent: string): ParsedLearningUniverse {
  // Extract content between \begin{document} and \end{document}
  let docContent = latexContent;
  const beginDocMatch = latexContent.indexOf("\\begin{document}");
  const endDocMatch = latexContent.indexOf("\\end{document}");
  if (beginDocMatch !== -1 && endDocMatch !== -1) {
    docContent = latexContent.slice(beginDocMatch + "\\begin{document}".length, endDocMatch);
  }

  // Remove LaTeX comments outside braces (keeps % modulo in quiz/code values)
  docContent = stripLatexComments(docContent)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "");

  // Extract all commands, in order
  const commands: Array<{ type: string; content: string }> = [];
  const commandPositions: Array<{ name: string; startIndex: number; openBraceIndex: number }> = [];

  // Collect command positions — support both \cmd{ and \cmd={ syntax
  for (const cmdName of allCommands) {
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

  // Sort by document position; at same index prefer longer command name (e.g. overviewmarkdown over overview)
  commandPositions.sort((a, b) => {
    if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
    return b.name.length - a.name.length;
  });

  // Deduplicate overlapping positions at same startIndex
  const seenStarts = new Set<number>();
  const uniquePositions = commandPositions.filter((pos) => {
    if (seenStarts.has(pos.startIndex)) return false;
    seenStarts.add(pos.startIndex);
    return true;
  });

  // Extract each command's content
  for (const pos of uniquePositions) {
    const { content } = extractCommandContent(docContent, pos.openBraceIndex);
    commands.push({ type: pos.name, content });
  }

  // Build the hierarchy with state management
  let universe: LearningUniverse = { title: "Untitled", description: "" };
  const tracks: Track[] = [];
  let currentTrack: Track | null = null;
  let currentModule: Module | null = null;
  let currentLesson: Lesson | null = null;
  let currentQuiz: Quiz | null = null;
  let currentQuestion: QuizQuestion | null = null;
  let currentProject: Project | null = null;
  let currentNotebook: { title: string; kernel: string; cells: { type: string; source: string }[] } | null = null;
  let currentResearchPaper: {
    title: string;
    paperType: string;
    abstract: string;
    sections: { title: string; body: string }[];
  } | null = null;
  let currentReferences: { items: { citation: string }[] } | null = null;
  const warnings: string[] = [];
  const pendingOrphanBlocks: ContentBlock[] = [];

  function assignColabUrl(project: Project, raw?: string) {
    if (!raw?.trim()) return;
    const check = validateColabUrl(raw.trim());
    if (check.valid && check.normalizedUrl) {
      project.colabUrl = check.normalizedUrl;
    }
  }

  function attachBlockToLesson(block: ContentBlock) {
    if (!currentLesson) {
      pendingOrphanBlocks.push(block);
      return;
    }
    currentLesson.contentBlocks.push(block);
    if (block.type === "video") {
      currentLesson.videos.push(block.content as Video);
    }
  }

  function syncProjectBlock() {
    if (!currentLesson || !currentProject) return;
    const block = currentLesson.contentBlocks.find((b) => b.type === "project");
    if (block) {
      block.content = { ...currentProject };
    }
  }

  function flushOrphanBlocksToLesson(lesson: Lesson) {
    if (pendingOrphanBlocks.length === 0) return;
    for (const block of pendingOrphanBlocks) {
      lesson.contentBlocks.push(block);
      if (block.type === "video") {
        lesson.videos.push(block.content as Video);
      }
    }
    pendingOrphanBlocks.length = 0;
  }

  for (const cmd of commands) {
    const params = parseCommandBlock(cmd.content);
    switch (cmd.type) {
      case "learninguniverse":
      case "course": {
        universe = {
          title: params["title"] || "Untitled",
          description: params["description"] || "",
          difficulty: params["difficulty"],
          estimatedHours: params["estimatedhours"] ? parseInt(params["estimatedhours"]) : undefined,
          skills: params["skills"] ? params["skills"].split(",").map((s) => s.trim()) : undefined,
        };
        break;
      }
      case "track": {
        // FLUSH EXISTING HIERARCHY FIRST!
        if (currentLesson && currentModule) {
          currentModule.lessons.push(currentLesson);
        }
        if (currentModule && currentTrack) {
          currentTrack.modules.push(currentModule);
        }
        if (currentTrack) {
          tracks.push(currentTrack);
        }

        currentTrack = {
          title: params["title"] || "Untitled Track",
          description: params["description"] || "",
          learningOutcomes: params["learningoutcomes"] || "",
          careerOutcomes: params["careeroutcomes"] || "",
          difficulty: params["difficulty"] || "",
          modules: [],
        };
        currentModule = null;
        currentLesson = null;
        break;
      }
      case "module": {
        // FLUSH EXISTING HIERARCHY FIRST!
        if (currentLesson && currentModule) {
          currentModule.lessons.push(currentLesson);
        }
        if (currentModule && currentTrack) {
          currentTrack.modules.push(currentModule);
        }
        
        if (!currentTrack) {
          currentTrack = {
            title: "Default Track",
            description: "",
            learningOutcomes: "",
            careerOutcomes: "",
            difficulty: "",
            modules: [],
          };
        }

        currentModule = {
          title: params["title"] || "Untitled Module",
          description: params["description"] || "",
          prerequisites: params["prerequisites"] || "",
          learningOutcomes: params["learningoutcomes"] || "",
          estimatedHours: params["estimatedhours"] ? parseInt(params["estimatedhours"]) : 0,
          lessons: [],
        };
        currentLesson = null;
        break;
      }
      case "lesson": {
        // FLUSH EXISTING HIERARCHY FIRST!
        if (currentLesson && currentModule) {
          currentModule.lessons.push(currentLesson);
        }
        
        if (!currentModule) {
          if (!currentTrack) {
            currentTrack = {
              title: "Default Track",
              description: "",
              learningOutcomes: "",
              careerOutcomes: "",
              difficulty: "",
              modules: [],
            };
          }
          currentModule = {
            title: "Default Module",
            description: "",
            prerequisites: "",
            learningOutcomes: "",
            estimatedHours: 0,
            lessons: [],
          };
          currentTrack.modules.push(currentModule);
        }

        currentLesson = {
          title: unescapeLatex(params["title"] || "Untitled Lesson"),
          overviewMarkdown: "",
          contentBlocks: [],
          videos: [],
          resources: [],
        };
        flushOrphanBlocksToLesson(currentLesson);
        currentQuiz = null;
        currentQuestion = null;
        currentProject = null;
        currentNotebook = null;
        currentResearchPaper = null;
        currentReferences = null;
        break;
      }
      case "overview":
      case "overviewmarkdown": {
        if (currentLesson) {
          const overviewText =
            params["overviewmarkdown"] ||
            params["overview"] ||
            params["text"] ||
            params["content"] ||
            cmd.content ||
            "";
          const trimmed = overviewText.trim();
          currentLesson.overviewMarkdown = trimmed;
          const doc = commandInnerToDocument("overviewmarkdown", trimmed);
          currentLesson.contentBlocks.push(
            toDocumentBlock({ title: doc.title ?? "Overview", nodes: doc.nodes }, trimmed)
          );
        }
        break;
      }
      case "video": {
        if (currentLesson || true) {
          let processedParams = { ...params };
          if (params.file && !params.url) {
            processedParams.url = params.file;
            if (!params.type) processedParams.type = "upload";
          }
          const url = processedParams.url || "";
          processedParams.type = detectVideoSourceType(url, processedParams.type);
          if (processedParams.type === "external") processedParams.type = "upload";
          const youtubeId = processedParams.type === "youtube" ? extractYouTubeId(url) : undefined;
          const video = {
            type: processedParams.type,
            url,
            file: params.file || (processedParams.type === "upload" ? url : undefined),
            title: processedParams.title,
            youtubeId: params.youtubeid || params.videoid || youtubeId,
            thumbnail: params.thumbnail,
            duration: params.duration,
          };
          attachBlockToLesson({ type: "video", content: video });
        }
        break;
      }
      case "practice": {
        if (currentLesson) {
          const practice = {
            title: params["title"] || "Practice",
            language: params["language"] || "python",
            initialCode: params["startercode"] || params["initialcode"] || "",
            expectedOutput: params["expectedoutput"],
            solution: params["solution"],
            hints: params["hints"]
              ? params["hints"].split(",").map((s) => s.trim())
              : params["hint"]
                ? [params["hint"]]
                : undefined,
          };
          currentLesson.practice = practice;
          currentLesson.contentBlocks.push({
            type: "practice",
            content: practice,
          });
        }
        break;
      }
      case "codinglab": {
        if (currentLesson) {
          const lang = params["language"] || "python";
          const rawStarter = params["startercode"] || params["initialcode"] || "";
          const lab = {
            title: params["title"] || "Coding Lab",
            language: lang,
            starterCode: repairStarterCode(rawStarter, lang),
            expectedOutput: params["expectedoutput"],
            instructions: params["instructions"] || params["problemstatement"] || "",
            solution: params["solution"],
            hints: params["hints"]
              ? params["hints"].split(",").map((s) => s.trim())
              : undefined,
            timeLimitMs: params["timelimitms"] ? parseInt(params["timelimitms"], 10) : 5000,
            enableColab: params["enablecolab"] !== "false",
            colabUrl: params["colaburl"] || params["colabUrl"],
          };
          currentLesson.contentBlocks.push({ type: "coding-lab", content: lab });
        }
        break;
      }
      case "notebook": {
        if (currentLesson) {
          currentNotebook = {
            title: params["title"] || "Notebook",
            kernel: params["kernel"] || "python",
            cells: [],
          };
          currentLesson.contentBlocks.push({ type: "notebook", content: currentNotebook });
        }
        break;
      }
      case "notebookcell": {
        if (currentNotebook) {
          currentNotebook.cells.push({
            type: (params["type"] || "markdown").toLowerCase(),
            source: params["source"] || params["content"] || "",
          });
        }
        break;
      }
      case "researchpaper": {
        if (currentLesson) {
          currentResearchPaper = {
            title: params["title"] || "Research Paper",
            paperType: params["papertype"] || "research",
            abstract: params["abstract"] || "",
            enableOverleaf: params["enableoverleaf"] !== "false",
            enableColab: params["enablecolab"] !== "false",
            overleafUrl: params["overleafurl"] || params["overleafUrl"],
            colabUrl: params["colaburl"] || params["colabUrl"],
            sections: [],
          };
          currentLesson.contentBlocks.push({ type: "research-paper", content: currentResearchPaper });
        }
        break;
      }
      case "researchsection": {
        if (currentResearchPaper) {
          currentResearchPaper.sections.push({
            title: params["title"] || "Section",
            body: params["body"] || params["content"] || "",
          });
        }
        break;
      }
      case "references": {
        if (currentLesson) {
          currentReferences = { items: [] };
          currentLesson.contentBlocks.push({ type: "references", content: currentReferences });
        }
        break;
      }
      case "referenceitem": {
        if (currentReferences) {
          currentReferences.items.push({ citation: params["citation"] || params["content"] || "" });
        } else if (currentLesson) {
          currentReferences = { items: [{ citation: params["citation"] || params["content"] || "" }] };
          currentLesson.contentBlocks.push({ type: "references", content: currentReferences });
        }
        break;
      }
      case "quiz": {
        if (currentLesson) {
          currentQuiz = {
            title: params["title"],
            questions: [],
          };
          
          if (params["question"]) {
            const question: QuizQuestion = {
              text: params["question"],
              type: params["type"]?.toLowerCase() === "multiple" ? "multiple" : "single",
              explanation: params["explanation"],
              options: parseInlineQuizOptions(params),
            };
            currentQuiz.questions.push(question);
          }
          
          currentLesson.quiz = currentQuiz;
          currentLesson.contentBlocks.push({
            type: "quiz",
            content: currentQuiz,
          });
        }
        break;
      }
      case "question": {
        if (!currentQuiz && currentLesson) {
          const quizBlock = [...currentLesson.contentBlocks].reverse().find((b) => b.type === "quiz");
          if (quizBlock?.content && typeof quizBlock.content === "object") {
            currentQuiz = quizBlock.content as typeof currentQuiz;
            currentLesson.quiz = currentQuiz;
          }
        }
        if (currentQuiz) {
          const qType = (params["type"] || "multiple-choice").toLowerCase();
          const options = buildQuestionOptions(params, qType);
          const blanks = qType === "fill-blank" ? parseFillBlankAnswers(params) : undefined;
          const matching = qType === "matching" ? parseMatchingPairs(params) : undefined;

          currentQuestion = {
            text: params["text"] || params["question"] || params["content"] || "",
            type:
              qType === "multiple-select" || qType === "multiple-choice"
                ? qType === "multiple-select"
                  ? "multiple"
                  : "single"
                : qType,
            explanation: params["explanation"],
            difficulty: params["difficulty"],
            points: params["marks"] ? parseInt(params["marks"], 10) : undefined,
            options,
            blanks,
            matching,
            sampleAnswer: params["sampleanswer"] || params["sampleAnswer"],
            rubric: params["rubric"],
            starterCode: params["startercode"] || params["starterCode"],
          };
          currentQuiz.questions.push(currentQuestion);
        }
        break;
      }
      case "option": {
        if (currentQuestion) {
          currentQuestion.options.push({
            text: params["text"] || params["content"] || "",
            isCorrect:
              params["iscorrect"]?.toLowerCase() === "true" ||
              params["correct"]?.toLowerCase() === "true",
          });
        }
        break;
      }
      case "project": {
        if (currentLesson) {
          const submissionType = (params["submissiontype"] || params["submission_type"] || "").toLowerCase();
          const rawColab = params["colab"] || params["colaburl"];
          currentProject = {
            title: params["title"] || "Project",
            description: params["description"] || "",
            difficulty: params["difficulty"] || "Beginner",
            instructions: params["instructions"] || params["description"] || "",
            expectedOutput: params["expectedoutput"],
            colabUrl: undefined,
            githubUrl: params["github"] || params["githuburl"],
            submissionType: submissionType || (rawColab ? "colab" : undefined),
          };
          if (rawColab) assignColabUrl(currentProject, rawColab);
          currentLesson.project = currentProject;
          currentLesson.contentBlocks.push({
            type: "project",
            content: currentProject,
          });
        }
        break;
      }
      case "colab": {
        if (currentProject) {
          assignColabUrl(currentProject, params["url"] || params["content"]);
          syncProjectBlock();
        }
        break;
      }
      case "github": {
        if (currentProject) {
          currentProject.githubUrl = params["url"] || params["content"];
          syncProjectBlock();
        }
        break;
      }
      case "assignment": {
        if (currentLesson) {
          currentLesson.contentBlocks.push({
            type: "assignment",
            content: { ...params },
          });
        }
        break;
      }
      case "resource":
      case "download": {
        if (currentLesson) {
          const resource = {
            type: cmd.type === "download" ? "download" : params["type"] || "website",
            title: params["title"] || "Resource",
            url: params["url"],
            fileUrl: params["file"] || params["fileurl"],
          };
          currentLesson.resources.push(resource);
          currentLesson.contentBlocks.push({
            type: cmd.type === "download" ? "download" : "resource",
            content: resource,
          });
        }
        break;
      }
      case "theory":
      case "note":
      case "tip":
      case "warning":
      case "summary":
      case "keypoints":
      case "checkpoint":
      case "discussion":
      case "reflection":
      case "certificatecriteria":
      case "finalexam": {
        const doc = commandInnerToDocument(cmd.type, cmd.content);
        const title = doc.title ?? params.title;
        attachBlockToLesson(
          toDocumentBlock({ title, nodes: doc.nodes }, `\\${cmd.type}{${cmd.content}}`)
        );
        break;
      }
      case "image":
      case "codeexample": {
        let processedParams = { ...params };
        if (params.file && !params.path && !params.url) {
          processedParams.path = params.file;
          processedParams.file = params.file;
        }
        if (params.url && !params.path && !params.file) {
          processedParams.path = params.url;
        }
        attachBlockToLesson({ type: cmd.type, content: processedParams });
        break;
      }
    }
  }

  // Push any remaining items
  if (currentLesson && currentModule) currentModule.lessons.push(currentLesson);
  if (currentModule && currentTrack) currentTrack.modules.push(currentModule);
  if (currentTrack) tracks.push(currentTrack);

  if (pendingOrphanBlocks.length > 0) {
    warnings.push(
      `${pendingOrphanBlocks.length} content block(s) appear outside any \\lesson and could not be assigned — wrap them inside a lesson.`
    );
  }


  return { universe, tracks, warnings };
}
