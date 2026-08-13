/**
 * Repository-wide compiler integration test.
 * Every document-producing curriculum command must compile to identical AST.
 *
 * Run: npx tsx backend/scripts/test-compiler-e2e-all-lessons.ts
 */
import { compileTexFile } from "../src/services/luProject/luLessonCompiler.js";
import { parseDocumentBody } from "../../shared/lesson-body/parseDocument.js";

const FIXTURE_BODY = String.raw`Intro paragraph.

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

\begin{lstlisting}
console.log("ok");
\end{lstlisting}

\begin{tcolorbox}[title={Note}]
Callout text.
\end{tcolorbox}

\video{assets/videos/demo.mp4}
`;

const LESSON_WRAPPERS: Array<{ name: string; tex: string }> = [
  {
    name: "overview.tex",
    tex: `\\overviewmarkdown{${FIXTURE_BODY}}`,
  },
  ...[
    "summary",
    "theory",
    "note",
    "tip",
    "warning",
    "keypoints",
    "reflection",
    "discussion",
    "checkpoint",
  ].map((cmd) => ({
    name: `${cmd}.tex`,
    tex: `\\${cmd}{title={${cmd.charAt(0).toUpperCase() + cmd.slice(1)}},body={${FIXTURE_BODY}}}`,
  })),
];

const MOCK_FILES = [
  {
    path: "/assets/images/sample.png",
    name: "sample.png",
    isFolder: false,
    content: "",
  },
  {
    path: "/assets/videos/demo.mp4",
    name: "demo.mp4",
    isFolder: false,
    content: "",
  },
];

function nodeSig(nodes: { type: string }[]): string {
  return nodes.map((n) => n.type).join(",");
}

const referenceSig = nodeSig(parseDocumentBody(FIXTURE_BODY));
let failed = false;

for (const { name, tex } of LESSON_WRAPPERS) {
  const { compiled, issues } = compileTexFile(`/track-01/module-01/lesson-01/${name}`, tex, MOCK_FILES);
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length) {
    console.error(`FAIL ${name}: compile errors`, errors);
    failed = true;
    continue;
  }
  if (!compiled?.nodes.length) {
    console.error(`FAIL ${name}: empty compiled nodes`);
    failed = true;
    continue;
  }
  const sig = nodeSig(compiled.nodes);
  const images = compiled.nodes.filter((n) => n.type === "image").length;
  const match = sig === referenceSig;
  console.log(
    `${match ? "OK" : "FAIL"} ${name}: nodes=${sig} images=${images} assets=${compiled.assets.length}`
  );
  if (!match) failed = true;
  if (compiled.sourceTex !== tex) {
    console.error(`FAIL ${name}: sourceTex mutated during compile`);
    failed = true;
  }
}

if (failed) {
  console.error("\nFAIL: compiler produced differing AST across lesson types");
  process.exit(1);
}

console.log("\nPASS: all lesson wrappers compile to identical Document AST");
