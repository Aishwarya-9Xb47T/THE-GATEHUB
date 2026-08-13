/**
 * Universal document pipeline integration test.
 * Every curriculum command wrapper must produce identical AST node sequences.
 */
import { parseLearningUniverseLatex } from "../src/controllers/learning-universe-parser.js";
import { commandInnerToDocument } from "../../shared/lesson-body/documentPipeline.js";

const FIXTURE = String.raw`Intro paragraph.

\begin{center}
\includegraphics[width=0.6\textwidth]{assets/images/sample.png}
\end{center}

Outro paragraph.

\[
E = mc^2
\]

\begin{tabular}{|l|l|}
\hline
A & B \\
\hline
\end{tabular}

\begin{itemize}
\item First
\item Second
\end{itemize}

\begin{lstlisting}
console.log("ok");
\end{lstlisting}

\begin{tcolorbox}[title={Note}]
Callout text.
\end{tcolorbox}

\video{assets/videos/demo.mp4}
`;

const COMMANDS = [
  "overviewmarkdown",
  "theory",
  "summary",
  "note",
  "tip",
  "warning",
  "keypoints",
  "reflection",
  "discussion",
  "checkpoint",
] as const;

function nodeSig(nodes: { type: string }[]): string {
  return nodes.map((n) => n.type).join(",");
}

function wrapOverview(body: string): string {
  return [
    "\\begin{document}",
    "\\lesson{title={Test}}",
    `\\overviewmarkdown{${body}}`,
    "\\end{document}",
  ].join("\n");
}

function wrapTheoryLike(cmd: string, body: string): string {
  const title = cmd.charAt(0).toUpperCase() + cmd.slice(1);
  return [
    "\\begin{document}",
    "\\lesson{title={Test}}",
    `\\${cmd}{title={${title}},body={${body}}}`,
    "\\end{document}",
  ].join("\n");
}

let reference: string | null = null;

for (const cmd of COMMANDS) {
  const tex =
    cmd === "overviewmarkdown" ? wrapOverview(FIXTURE) : wrapTheoryLike(cmd, FIXTURE);
  const parsed = parseLearningUniverseLatex(tex);
  const lesson = parsed.tracks[0]?.modules[0]?.lessons[0];
  const docBlock = lesson?.contentBlocks.find((b) => b.type === "document");
  if (!docBlock) {
    console.error(`FAIL: ${cmd} did not emit document block`);
    process.exit(1);
  }
  const content = docBlock.content as { nodes: { type: string }[] };
  const sig = nodeSig(content.nodes);
  const hasImage = content.nodes.some((n) => n.type === "image");
  const hasProse = content.nodes.some(
    (n) => n.type === "markdown" && n.content.includes("Intro paragraph")
  );
  console.log(`${cmd}: type=document nodes=${sig} image=${hasImage} prose=${hasProse}`);
  if (!hasImage || !hasProse) {
    console.error(`FAIL: ${cmd} missing image or prose in AST`);
    process.exit(1);
  }
  if (reference === null) reference = sig;
  else if (sig !== reference) {
    console.error(`FAIL: ${cmd} AST differs from reference`);
    console.error(`  reference: ${reference}`);
    console.error(`  got:       ${sig}`);
    process.exit(1);
  }
}

// Direct commandInnerToDocument parity
const direct = commandInnerToDocument("summary", `title={Summary},body={${FIXTURE}}`);
const directSig = nodeSig(direct.nodes);
if (directSig !== reference) {
  console.error("FAIL: commandInnerToDocument mismatch");
  process.exit(1);
}

console.log("PASS: universal document pipeline — all curriculum types emit identical AST");
