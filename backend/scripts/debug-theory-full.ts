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

const tex = String.raw`\begin{document}
\lesson{title={Test}}
\theory{title={Theory},body={${FIXTURE}}}
\end{document}`;

const p = parseLearningUniverseLatex(tex);
console.log("warnings", p.warnings);
console.log("tracks", p.tracks.length);
console.log("blocks", p.tracks[0]?.modules[0]?.lessons[0]?.contentBlocks);
