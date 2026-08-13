import { repairLessonSectionBody } from "../src/services/lessonContentRepair.js";
import { parseLessonDocumentFromContent } from "../../shared/lesson-body/index.js";

const summaryBody = String.raw`{

\begin{center}
\includegraphics[width=0.7\textwidth]{assets/images/img.png}
\end{center}`;

const repaired = repairLessonSectionBody(
  "Summary",
  summaryBody,
  { lessonTitle: "Foundations & Prerequisites - Domain fundamentals", courseTitle: "ANN" }
);

if (!repaired.includes("\\includegraphics")) {
  console.error("FAIL: repairLessonSectionBody stripped includegraphics");
  console.error("repaired:", repaired);
  process.exit(1);
}

const doc = parseLessonDocumentFromContent({ title: "Summary", body: repaired });
if (!doc.nodes.some((n) => n.type === "image")) {
  console.error("FAIL: repaired body has no image node");
  process.exit(1);
}

console.log("PASS: summary body preserved through repair layer");
