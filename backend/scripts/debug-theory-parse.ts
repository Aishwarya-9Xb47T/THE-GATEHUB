import { parseLearningUniverseLatex } from "../src/controllers/learning-universe-parser.js";

const FIXTURE = String.raw`Intro paragraph.

\begin{center}
\includegraphics[width=0.6\textwidth]{assets/images/sample.png}
\end{center}

Outro.`;

const tex = String.raw`\begin{document}
\lesson{title={Test}}
\theory{title={Theory},body={${FIXTURE}}}
\end{document}`;

const p = parseLearningUniverseLatex(tex);
const blocks = p.tracks[0]?.modules[0]?.lessons[0]?.contentBlocks ?? [];
console.log("block types", blocks.map((b) => b.type));
console.log("nodes", (blocks[0]?.content as { nodes?: unknown[] })?.nodes?.length);
