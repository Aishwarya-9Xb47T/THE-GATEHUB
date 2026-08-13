export type ProjectTemplateId =
  | "blank"
  | "course"
  | "academic-course"
  | "learning-universe"
  | "learning-universe-v2"
  | "academic"
  | "assignment";

export interface ProjectTemplate {
  id: ProjectTemplateId;
  label: string;
  description: string;
  folders: string[];
  mainTex: string;
}

const BASE_PACKAGES = `\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{amsfonts}
\\usepackage{amssymb}
\\usepackage{graphicx}
\\usepackage[margin=1in]{geometry}
\\usepackage{hyperref}
\\usepackage{listings}
\\usepackage{xcolor}`;

import { buildMainTexFromProject } from "./luProject/luProjectMainTexBuilder.js";
import { buildScaffoldV2Files } from "./luProject/luProjectFileEmitter.js";

const LEARNING_PREAMBLE = `
% GATEHUB learning commands are auto-injected on compile (quiz, practice, track, etc.)
`;

function doc(title: string, body: string): string {
  return `\\documentclass{article}
${BASE_PACKAGES}
${LEARNING_PREAMBLE}

\\title{${title}}
\\author{Instructor}
\\date{\\today}

\\begin{document}
\\maketitle

${body}

\\end{document}`;
}

export const PROJECT_TEMPLATES: Record<ProjectTemplateId, ProjectTemplate> = {
  blank: {
    id: "blank",
    label: "Blank Project",
    description: "Empty article with main.tex only",
    folders: [],
    mainTex: doc("Untitled", "\\section{Introduction}\n\nStart writing here."),
  },
  course: {
    id: "course",
    label: "Course Template",
    description: "Paid LMS lecture notes with sections and image support",
    folders: ["/images", "/uploads", "/chapters"],
    mainTex: doc(
      "Course Lecture Notes",
      `\\section{Learning Objectives}
List what students will learn.

\\section{Core Concepts}
Explain the main ideas here.

\\subsection{Example}
\\includegraphics[width=0.7\\linewidth]{images/diagram.png}

\\section{Summary}
Key takeaways.`
    ),
  },
  "academic-course": {
    id: "academic-course",
    label: "Academic Course Studio Template",
    description: "LaTeX DSL for traditional courses with chapters, lessons, quizzes, and videos",
    folders: ["/images", "/uploads", "/chapters", "/assets"],
    mainTex: doc(
      "Academic Course",
      `\\course{
title={Deep Learning},
description={Complete Deep Learning Course},
price={0},
difficulty={Advanced},
category={Data Science},
subcategory={Deep Learning}
}

\\chapter{
title={Neural Networks},

\\lesson{
title={Perceptrons},

\\overview{
text={Introduction to perceptrons and their role in neural network history.}
}

\\video{
type={youtube},
url={https://www.youtube.com/watch?v=IHZwWFHWa-w}
}

\\quiz{
question={Who invented the perceptron?},
optionA={Minsky},
optionB={Rosenblatt},
optionC={Hinton},
optionD={LeCun},
correct={B},
explanation={Frank Rosenblatt developed the perceptron in 1957.}
}
}
}`
    ),
  },
  "learning-universe": {
    id: "learning-universe",
    label: "Learning Universe Template",
    description: "Full DSL for tracks, modules, quizzes, and projects",
    folders: ["/images", "/uploads", "/chapters", "/assets"],
    mainTex: doc(
      "Learning Universe Course",
      `\\learninguniverse{
title={Your Course Title},
description={Course description},
difficulty={Beginner},
estimatedHours={20},
skills={Skill1,Skill2},
category={Category}
}

\\track{
title={Track 1},
description={First learning track},

\\module{
title={Module 1},
description={Introduction module},

\\lesson{
title={Lesson 1},
overviewmarkdown={
Overview text without hash symbols. Use plain sentences instead of markdown headers.
}
}

\\quiz{
question={Sample question?},
optionA={Option A},
optionB={Option B},
optionC={Option C},
optionD={Option D},
correct={B},
explanation={Because...}
}

\\checkpoint{title={Module complete!}}
\\discussion{prompt={What did you learn?}}
}
}`
    ),
  },
  "learning-universe-v2": {
    id: "learning-universe-v2",
    label: "Learning Universe 2.0 (Project-Based)",
    description: "Multi-file project with project.json, tracks, modules, and per-lesson .tex files",
    folders: [
      "/assets/images",
      "/assets/videos",
      "/assets/pdf",
      "/assets/downloads",
      "/assets/datasets",
      "/assets/thumbnails",
      "/track-01",
      "/track-01/module-01",
      "/legacy-backup",
      "/output",
    ],
    mainTex: "% AUTO-GENERATED from project.json — do not edit manually\n",
  },
  academic: {
    id: "academic",
    label: "Academic Template",
    description: "Structured academic content with chapters folder",
    folders: ["/chapters", "/images", "/uploads"],
    mainTex: `\\documentclass{article}
${BASE_PACKAGES}

\\title{Academic Paper / Notes}
\\author{Author}
\\date{\\today}

\\begin{document}
\\maketitle
\\tableofcontents

\\section{Introduction}
\\input{chapters/introduction.tex}

\\section{Methods}
\\input{chapters/methods.tex}

\\end{document}`,
  },
  assignment: {
    id: "assignment",
    label: "Assignment Template",
    description: "Problem sets with practice blocks and submission guidance",
    folders: ["/uploads", "/images"],
    mainTex: doc(
      "Assignment",
      `\\section{Instructions}
Read each problem carefully. Show your work.

\\assignment{
title={Problem Set 1},
duedate={2026-01-15},
points={100},
instructions={Submit PDF and code files to the uploads folder.}
}

\\practice{
language={python},
startercode={
def solve():
    pass
},
expectedoutput={42}
}

\\section{Problems}
\\subsection{Problem 1}
State the problem here.`
    ),
  },
};

export const DEFAULT_PROJECT_FOLDERS = ["/images", "/uploads", "/chapters", "/assets"];

export function getTemplate(id?: string): ProjectTemplate {
  const key = (id || "blank") as ProjectTemplateId;
  return PROJECT_TEMPLATES[key] ?? PROJECT_TEMPLATES.blank;
}

export function templateFolderEntries(template: ProjectTemplate): Array<{
  name: string;
  path: string;
  isFolder: boolean;
  content: string;
}> {
  if (template.id === "learning-universe-v2") {
    const { project, files } = buildScaffoldV2Files("Learning Universe Course");
    const mainTex = buildMainTexFromProject(project);
    const entries: Array<{ name: string; path: string; isFolder: boolean; content: string }> = [
      { name: "main.tex", path: "/main.tex", isFolder: false, content: mainTex },
      {
        name: "project.json",
        path: "/project.json",
        isFolder: false,
        content: JSON.stringify(project, null, 2),
      },
      ...files.map((f) => ({
        name: f.name,
        path: f.path,
        isFolder: f.isFolder,
        content: f.content,
      })),
    ];
    return entries;
  }

  const folders = new Set([...DEFAULT_PROJECT_FOLDERS, ...template.folders]);
  const entries: Array<{ name: string; path: string; isFolder: boolean; content: string }> = [
    { name: "main.tex", path: "/main.tex", isFolder: false, content: template.mainTex },
  ];

  for (const folderPath of folders) {
    const name = folderPath.split("/").filter(Boolean).pop() || folderPath;
    entries.push({ name, path: folderPath, isFolder: true, content: "" });
  }

  if (template.id === "academic") {
    entries.push(
      {
        name: "introduction.tex",
        path: "/chapters/introduction.tex",
        isFolder: false,
        content: "Introduction chapter content.\n",
      },
      {
        name: "methods.tex",
        path: "/chapters/methods.tex",
        isFolder: false,
        content: "Methods chapter content.\n",
      }
    );
  }

  return entries;
}
