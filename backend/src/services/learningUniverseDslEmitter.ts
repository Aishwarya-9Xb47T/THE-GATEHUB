/**
 * Emit Learning Universe DSL LaTeX from structured JSON.
 * Visual Authoring Studio → same dslSource format as Academic Studio.
 */
import type { LearningUniverseStructured, LuContentBlock, LuQuiz } from "./learningUniverseSchema.js";
import { isRegisteredDslCommand } from "./luProject/luDslEnforcer.js";

function braceValue(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function emitKeyValueBlock(command: string, params: Record<string, string | undefined>): string {
  if (!command || command === "undefined") {
    throw new Error("Cannot emit DSL block with undefined command — use the course renderer");
  }
  if (!isRegisteredDslCommand(command)) {
    throw new Error(`Unregistered DSL command: ${command}`);
  }
  const lines = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}={${braceValue(v!)}}`);
  if (lines.length === 0) return `\\${command}{}\n`;
  return `\\${command}{\n${lines.join(",\n")}\n}\n\n`;
}

function emitQuizInline(quiz: LuQuiz): string {
  const q = quiz.questions[0];
  if (!q) return emitKeyValueBlock("quiz", { title: quiz.title || "Quiz" });

  const params: Record<string, string> = { title: quiz.title || "Quiz", question: q.text };
  if (q.explanation) params.explanation = q.explanation;
  if (q.type === "multiple") params.type = "multiple";

  q.options.forEach((opt, i) => {
    const letter = String.fromCharCode(65 + i);
    params[`option${letter.toLowerCase()}`] = opt.text;
    if (opt.isCorrect) {
      const existing = params.correct || "";
      params.correct = existing ? `${existing},${letter}` : letter;
    }
  });

  return emitKeyValueBlock("quiz", params);
}

function emitQuizNested(quiz: LuQuiz): string {
  let out = emitKeyValueBlock("quiz", { title: quiz.title || "Quiz" });
  for (const q of quiz.questions) {
    const qParams: Record<string, string> = { text: q.text };
    if (q.explanation) qParams.explanation = q.explanation;
    if (q.type) qParams.type = q.type;
    out += emitKeyValueBlock("question", qParams);
    for (const opt of q.options) {
      out += emitKeyValueBlock("option", {
        text: opt.text,
        iscorrect: opt.isCorrect ? "true" : "false",
      });
    }
  }
  return out;
}

export function emitContentBlock(block: LuContentBlock): string {
  const c = (typeof block.content === "object" && block.content !== null
    ? block.content
    : {}) as Record<string, string>;

  switch (block.type) {
    case "overview":
      return typeof block.content === "string"
        ? `\\overviewmarkdown{\n${braceValue(block.content)}\n}\n\n`
        : emitKeyValueBlock("overview", { text: c.text || c.content || "" });

    case "theory":
      return emitKeyValueBlock("theory", { title: c.title || "Theory", body: c.body || c.text || "" });
    case "note":
      return emitKeyValueBlock("note", { text: c.text || c.content || "" });
    case "tip":
      return emitKeyValueBlock("tip", { text: c.text || c.content || "" });
    case "warning":
      return emitKeyValueBlock("warning", { text: c.text || c.content || "" });
    case "summary":
      return emitKeyValueBlock("summary", { text: c.text || c.content || "" });
    case "keypoints":
      return emitKeyValueBlock("keypoints", { text: c.text || c.text || "" });

    case "image":
      return emitKeyValueBlock("image", {
        file: c.file || undefined,
        path: c.path || c.url || undefined,
        caption: c.caption,
        alt: c.alt,
      });

    case "video":
      return emitKeyValueBlock("video", {
        type: c.type || "youtube",
        file: c.file || undefined,
        url: c.url || undefined,
        title: c.title,
      });

    case "codeexample":
      return emitKeyValueBlock("codeexample", {
        language: c.language || "python",
        code: c.code || "",
        output: c.output,
      });

    case "practice":
      return emitKeyValueBlock("practice", {
        title: c.title || "Practice",
        language: c.language || "python",
        startercode: c.initialCode || c.startercode || "",
        expectedoutput: c.expectedOutput || c.expectedoutput || "",
        solution: c.solution,
      });

    case "quiz": {
      const quiz = block.content as unknown as LuQuiz;
      if (!quiz?.questions?.length) return "";
      if (quiz.questions.length === 1 && quiz.questions[0].options.length <= 4) {
        return emitQuizInline(quiz);
      }
      return emitQuizNested(quiz);
    }

    case "project": {
      let out = emitKeyValueBlock("project", {
        title: c.title || "Project",
        description: c.description,
        instructions: c.instructions,
        submissiontype: c.submissionType || c.submissiontype,
      });
      if (c.colabUrl) out += `\\colab{url={${c.colabUrl}}}\n\n`;
      if (c.githubUrl) out += `\\github{url={${c.githubUrl}}}\n\n`;
      return out;
    }

    case "assignment":
      return emitKeyValueBlock("assignment", {
        title: c.title || "Assignment",
        instructions: c.instructions,
        duedate: c.duedate || c.dueDate,
        points: c.points,
      });

    case "resource":
      return emitKeyValueBlock("resource", {
        type: c.type || "website",
        title: c.title || "Resource",
        url: c.url,
      });

    case "download":
      return emitKeyValueBlock("download", {
        title: c.title || "Download",
        url: c.url,
        file: c.file || c.fileUrl,
      });

    case "checkpoint":
      return emitKeyValueBlock("checkpoint", { title: c.title || c.content || "Checkpoint" });
    case "discussion":
      return emitKeyValueBlock("discussion", { prompt: c.prompt || c.text || "" });

    case "certificatecriteria":
      return typeof block.content === "string"
        ? `\\certificatecriteria{\n${braceValue(block.content)}\n}\n\n`
        : emitKeyValueBlock("certificatecriteria", { text: c.text || "" });

    case "finalexam":
      return emitKeyValueBlock("finalexam", {
        title: c.title || "Final Exam",
        duration: c.duration,
        description: c.description,
      });

    default:
      return "";
  }
}

export function emitLessonBodyBlocks(
  lesson: {
    title: string;
    overviewMarkdown?: string;
    contentBlocks?: Array<{ type: string; content: unknown }>;
  }
): string {
  let out = "";
  const blocks = lesson.contentBlocks || [];

  if (blocks.length === 0) {
    if (lesson.overviewMarkdown?.trim()) {
      out += `\\overviewmarkdown{\n${braceValue(lesson.overviewMarkdown.trim())}\n}\n\n`;
    }
    return out;
  }

  for (const block of blocks) {
    if (block.type === "document") {
      const content = (block.content && typeof block.content === "object"
        ? block.content
        : {}) as { sourceTex?: string };
      const tex = content.sourceTex?.trim();
      if (!tex) continue;
      if (tex.startsWith("\\")) {
        out += tex.endsWith("\n") ? `${tex}\n` : `${tex}\n\n`;
      } else {
        out += `\\overviewmarkdown{\n${braceValue(tex)}\n}\n\n`;
      }
      continue;
    }
    out += emitContentBlock(block as LuContentBlock);
  }

  return out;
}

function emitLesson(lesson: import("./learningUniverseSchema.js").LuLesson): string {
  return `\\lesson{title={${lesson.title}}}\n\n${emitLessonBodyBlocks(lesson)}`;
}

export function emitLearningUniverseDsl(data: LearningUniverseStructured): string {
  const u = data.universe;
  const skills = u.skills?.join(",") || "";

  let body = `\\learninguniverse{
title={${u.title}},
description={${u.description || ""}},
difficulty={${u.difficulty || "Beginner"}},
estimatedHours={${u.estimatedHours ?? 0}},
skills={${skills}}
}

`;

  for (const track of data.tracks) {
    body += `\\track{
title={${track.title}},
description={${track.description || ""}},
learningOutcomes={${track.learningOutcomes || ""}},
careerOutcomes={${track.careerOutcomes || ""}},
difficulty={${track.difficulty || ""}},

`;

    for (const mod of track.modules) {
      body += `\\module{
title={${mod.title}},
description={${mod.description || ""}},
prerequisites={${mod.prerequisites || ""}},
learningOutcomes={${mod.learningOutcomes || ""}},
estimatedHours={${mod.estimatedHours ?? 0}},

`;

      for (const lesson of mod.lessons) {
        body += emitLesson(lesson);
      }

      body += `}\n\n`;
    }

    body += `}\n\n`;
  }

  return `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{listings}
\\usepackage{xcolor}

\\begin{document}

${body}\\end{document}
`;
}
