/**
 * Universal document AST parity across every LU lesson command wrapper.
 * Injects the same rich content fixture into each wrapper and asserts identical node types.
 */
import {
  parseLessonDocument,
  parseLessonDocumentFromContent,
  type DocumentNode,
} from "../../shared/lesson-body/index.js";

const FIXTURE = String.raw`Intro paragraph with **bold** text.

\begin{center}
\includegraphics[width=0.6\textwidth]{assets/images/sample.png}
\end{center}

Middle paragraph.

\[
E = mc^2
\]

\begin{tabular}{|l|l|}
\hline
A & B \\
\hline
\end{tabular}

\begin{itemize}
\item First item
\item Second item
\end{itemize}

\begin{lstlisting}
console.log("hello");
\end{lstlisting}

\begin{tcolorbox}[title={Note}]
Important callout text.
\end{tcolorbox}

\video{assets/videos/demo.mp4}
`;

const WRAPPERS: Array<{ name: string; wrap: (body: string) => string }> = [
  {
    name: "overviewmarkdown",
    wrap: (body) => String.raw`\overviewmarkdown{${body}}`,
  },
  {
    name: "theory",
    wrap: (body) => String.raw`\theory{title={Test Lesson},body={${body}}}`,
  },
  {
    name: "summary",
    wrap: (body) => String.raw`\summary{title={Summary},content={${body}}}`,
  },
  {
    name: "note",
    wrap: (body) => String.raw`\note{title={Note},body={${body}}}`,
  },
  {
    name: "tip",
    wrap: (body) => String.raw`\tip{title={Tip},body={${body}}}`,
  },
  {
    name: "warning",
    wrap: (body) => String.raw`\warning{title={Warning},body={${body}}}`,
  },
  {
    name: "keypoints",
    wrap: (body) => String.raw`\keypoints{title={Key Points},body={${body}}}`,
  },
  {
    name: "reflection",
    wrap: (body) => String.raw`\reflection{title={Reflection},body={${body}}}`,
  },
  {
    name: "discussion",
    wrap: (body) => String.raw`\discussion{title={Discussion},body={${body}}}`,
  },
  {
    name: "checkpoint",
    wrap: (body) => String.raw`\checkpoint{title={Checkpoint},body={${body}}}`,
  },
];

function nodeSignature(nodes: DocumentNode[]): string {
  return nodes.map((n) => n.type).join(",");
}

function assertHasTypes(nodes: DocumentNode[], required: DocumentNode["type"][]) {
  const types = new Set(nodes.map((n) => n.type));
  for (const t of required) {
    if (!types.has(t)) {
      throw new Error(`missing node type: ${t} (have: ${[...types].join(", ")})`);
    }
  }
}

let referenceSig: string | null = null;
let referenceNodes: DocumentNode[] | null = null;

for (const { name, wrap } of WRAPPERS) {
  const tex = wrap(FIXTURE);
  const doc = parseLessonDocument(tex);

  if (!doc.nodes.length) {
    console.error(`FAIL: ${name} produced empty AST`);
    process.exit(1);
  }

  assertHasTypes(doc.nodes, [
    "markdown",
    "image",
    "equation",
    "table",
    "list",
    "code",
    "callout",
    "video",
  ]);

  const sig = nodeSignature(doc.nodes);
  console.log(`${name}: nodes=${sig} count=${doc.nodes.length}`);

  if (referenceSig === null) {
    referenceSig = sig;
    referenceNodes = doc.nodes;
  } else if (sig !== referenceSig) {
    console.error(`FAIL: ${name} node sequence differs from reference`);
    console.error(`  reference: ${referenceSig}`);
    console.error(`  got:       ${sig}`);
    process.exit(1);
  }
}

const plainDoc = parseLessonDocument(FIXTURE);
const plainSig = nodeSignature(plainDoc.nodes);
if (plainSig !== referenceSig) {
  console.error("FAIL: plain body node sequence differs from wrapped lessons");
  console.error(`  reference: ${referenceSig}`);
  console.error(`  plain:     ${plainSig}`);
  process.exit(1);
}

const contentDoc = parseLessonDocumentFromContent({
  title: "Pre-parsed",
  nodes: referenceNodes!,
});
if (nodeSignature(contentDoc.nodes) !== referenceSig) {
  console.error("FAIL: parseLessonDocumentFromContent(nodes) mismatch");
  process.exit(1);
}

console.log("PASS: all lesson wrappers produce identical document AST");
