import { parseLearningUniverseLatex } from "../src/controllers/learning-universe-parser.js";

const body = "Intro paragraph.\n\n\\includegraphics{a.png}";
const tex = [
  "\\begin{document}",
  "\\lesson{title={Test}}",
  `\\reflection{title={Reflection},body={${body}}}`,
  "\\end{document}",
].join("\n");

const p = parseLearningUniverseLatex(tex);
console.log(p.tracks[0]?.modules[0]?.lessons[0]?.contentBlocks);
