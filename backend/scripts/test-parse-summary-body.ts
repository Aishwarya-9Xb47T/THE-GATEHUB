import { parseLearningUniverseLatex } from "../src/controllers/learning-universe-parser.js";

const tex = String.raw`\theory{
title={Summary},
body={
Foundations \& Prerequisites provides a disciplined approach to Artificial Neural Network at beginner depth.

\begin{center}
\includegraphics[width=0.7\textwidth]{assets/images/img.png}
\end{center}

}
}`;

const parsed = parseLearningUniverseLatex(String.raw`\begin{document}
\lesson{title={Test Lesson}}
${tex}
\end{document}`);

const lesson = parsed.tracks[0].modules[0].lessons[0];
const block = lesson.contentBlocks.find((b) => b.type === "document");
const c = block?.content as { title?: string; nodes: unknown[]; sourceTex?: string };
console.log("block type", block?.type);
console.log("title", c?.title);
console.log("body nodes", c?.nodes?.map((n: { type?: string }) => n.type).join(","));
const hasImage = c?.nodes?.some((n: { type?: string }) => n.type === "image");
const hasProse = c?.nodes?.some(
  (n: { type?: string; content?: string }) =>
    n.type === "markdown" && String(n.content).includes("Foundations")
);
if (!hasImage || !hasProse) {
  console.error("FAIL: expected image + prose nodes");
  process.exit(1);
}
console.log("PASS: summary publishes as document with full AST");
