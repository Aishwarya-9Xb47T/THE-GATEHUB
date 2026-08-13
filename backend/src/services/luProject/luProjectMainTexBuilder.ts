import { createHash } from "crypto";
import type { LuProjectJson } from "./luProjectSchema.js";

const BASE_PACKAGES = `\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{amsfonts}
\\usepackage{amssymb}
\\usepackage{graphicx}
\\usepackage[margin=1in]{geometry}
\\usepackage{hyperref}
\\usepackage{listings}
\\usepackage{xcolor}`;

const GENERATED_HEADER = `% AUTO-GENERATED — DO NOT EDIT
% This file is rebuilt from project.json. Edit track/module/lesson files instead.
`;

export function buildMainTexFromProject(project: LuProjectJson): string {
  const inputLines: string[] = ["\\input{metadata}"];

  for (const track of project.tracks) {
    const trackInput = `${track.folder}/${track.file.replace(/\.tex$/i, "")}`;
    inputLines.push(`\\input{${trackInput}}`);
  }

  const body = inputLines.join("\n");

  return `${GENERATED_HEADER}\\documentclass{article}
${BASE_PACKAGES}

% GATEHUB learning commands are auto-injected on compile

\\begin{document}

${body}

\\end{document}
`;
}

export function hashMainTex(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}
