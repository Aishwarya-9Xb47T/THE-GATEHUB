import {
  extractLessonBodyFromTex,
  parseLessonBody,
  parseLessonTexCommand,
} from "../../shared/lesson-body/index.js";

const summaryTheoryTex = String.raw`\theory{
title={Summary},
body={
Foundations & Prerequisites provides essential background.

\begin{center}
\includegraphics[width=0.7\textwidth]{assets/images/img.png}
\end{center}

More text after image.
}
}`;

const parsed = parseLessonTexCommand(summaryTheoryTex);
const body = extractLessonBodyFromTex(summaryTheoryTex);

if (!parsed || parsed.command !== "theory") {
  console.error("FAIL: expected theory command");
  process.exit(1);
}
if (parsed.title !== "Summary") {
  console.error("FAIL: title expected Summary, got", parsed.title);
  process.exit(1);
}
if (body.includes("\\theory") || body.includes("title={") || body.includes("body={")) {
  console.error("FAIL: body contains raw TeX wrapper");
  console.error(body.slice(0, 200));
  process.exit(1);
}
if (!body.includes("Foundations")) {
  console.error("FAIL: body missing prose");
  process.exit(1);
}
const nodes = parseLessonBody(body);
if (!nodes.some((n) => n.type === "image")) {
  console.error("FAIL: missing image node");
  process.exit(1);
}

const summaryTex = String.raw`\summary{title={Summary},content={
Paragraph before.

\begin{center}
\includegraphics[width=0.7\textwidth]{assets/images/img.png}
\end{center}

Paragraph after.
}}`;

const theoryTex = String.raw`\theory{title={Industry Notes},body={
Notes with image.

\includegraphics{assets/images/chart.png}
}}`;

const overviewTex = String.raw`\overviewmarkdown={
Overview text.

\includegraphics{assets/images/img.png}
}`;

for (const [name, tex] of [
  ["summary", summaryTex],
  ["theory", theoryTex],
  ["overview", overviewTex],
] as const) {
  const body = extractLessonBodyFromTex(tex);
  const nodes = parseLessonBody(body);
  const hasImage = nodes.some((n) => n.type === "image");
  console.log(`${name}: bodyLen=${body.length} hasImage=${hasImage} nodes=${nodes.map((n) => n.type).join(",")}`);
  if (!hasImage) {
    console.error(`FAIL: ${name} missing image node`);
    process.exit(1);
  }
}

console.log("PASS: universal lesson body AST");
