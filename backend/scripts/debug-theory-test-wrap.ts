import { parseLearningUniverseLatex } from "../src/controllers/learning-universe-parser.js";

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

const cmd = "theory";
const title = cmd.charAt(0).toUpperCase() + cmd.slice(1);
const tex = String.raw`\begin{document}
\lesson{title={Test}}
\${cmd}{title={${title}},body={${FIXTURE}}}
\end{document}`;

const parsed = parseLearningUniverseLatex(tex);
const lesson = parsed.tracks[0]?.modules[0]?.lessons[0];
console.log("lesson?", !!lesson);
console.log("blocks", lesson?.contentBlocks?.map((b) => b.type));
const docBlock = lesson?.contentBlocks.find((b) => b.type === "document");
console.log("docBlock?", !!docBlock);
