import type { LuLessonComponentKind } from "./luComponentRegistry.js";
import { COMPONENT_TITLES } from "./luComponentRegistry.js";
import { escLatex as esc } from "./luTexEscape.js";

export function emitQuizQuestionTex(title: string, config: Record<string, unknown> = {}): string {
  return `\\quiz{
question={${esc(String(config.question ?? title))}},
optionA={${esc(String(config.optionA ?? "Option A"))}},
optionB={${esc(String(config.optionB ?? "Option B"))}},
optionC={${esc(String(config.optionC ?? "Option C"))}},
optionD={${esc(String(config.optionD ?? "Option D"))}},
correct={${esc(String(config.correct ?? "B"))}},
explanation={${esc(String(config.explanation ?? ""))}}
}`;
}

export function emitResourceItemTex(title: string, config: Record<string, unknown> = {}): string {
  const type = String(config.type ?? "link");
  if (type === "download") {
    return `\\download{title={${esc(title)}},file={${esc(String(config.url ?? ""))}}}`;
  }
  return `\\resource{type={${esc(type)}},title={${esc(title)}},url={${esc(String(config.url ?? "https://example.com"))}}}`;
}

import { sanitizeDslContent } from "../../../../shared/lesson-body/dist/sanitizeDslContent.js";

export function emitTexFromComponent(
  kind: LuLessonComponentKind,
  title: string,
  config: Record<string, unknown> = {}
): string {
  switch (kind) {
    case "video": {
      const type = String(config.type ?? config.sourceType ?? "upload");
      const url = String(config.url ?? "");
      const file = String(config.file ?? "");
      const videoTitle = String(config.title ?? title);
      if (type === "youtube" || type === "embed") {
        return `\\video{
type={youtube},
url={${esc(url)}},
title={${esc(videoTitle)}}
}`;
      }
      return `\\video{
type={upload},
file={${esc(file)}},
title={${esc(videoTitle)}}
}`;
    }
    case "overview": {
      const clean = sanitizeDslContent(String(config.body ?? `Welcome to ${title}.`));
      return `\\overviewmarkdown={\n${esc(clean)}\n}`;
    }
    case "objectives": {
      const items = (config.items as string[]) ?? [];
      const cleanItems = items.map((i) => sanitizeDslContent(i)).filter(Boolean);
      const body =
        cleanItems.length > 0
          ? esc(
              `By the end of this lesson you will be able to:\n${cleanItems
                .map((i, idx) => `${idx + 1}. ${i}`)
                .join("\n")}`
            )
          : esc("Add learning objectives here.");
      return `\\theory{title={Learning Objectives},body={${body}\n}}`;
    }
    case "topics": {
      const cleanTitle = sanitizeDslContent(String(config.title ?? title));
      const cleanBody = sanitizeDslContent(String(config.body ?? ""));
      return `\\theory{title={${esc(cleanTitle)}},body={\n${esc(cleanBody)}\n}}`;
    }
    case "examples": {
      const cleanBody = sanitizeDslContent(String(config.body ?? "Worked examples go here."));
      return `\\theory{title={Examples},body={\n${esc(cleanBody)}\n}}`;
    }
    case "practice":
      return `\\practice{
language={${esc(String(config.language ?? "python"))}},
startercode={
${String(config.starterCode ?? "")}
},
expectedoutput={${esc(String(config.expectedOutput ?? ""))}}
}`;
    case "coding-lab":
      return `\\codinglab{
title={${esc(title)}},
language={${esc(String(config.language ?? "python"))}},
startercode={
${String(config.starterCode ?? "")}
},
expectedoutput={${esc(String(config.expectedOutput ?? ""))}},
instructions={${esc(String(config.problemStatement ?? config.instructions ?? ""))}},
timeLimitMs={${Number(config.timeLimitMs ?? 5000)}},
enableColab={true}
}`;
    case "notebook": {
      const cells = (config.cells as { type: string; source: string }[]) ?? [];
      const cellTex = cells
        .map(
          (c) => `\\notebookcell{type={${c.type}},source={${esc(c.source)}}}`
        )
        .join("\n");
      return `\\notebook{
title={${esc(title)}},
kernel={${esc(String(config.kernel ?? "python"))}},
${cellTex}
}
`;
    }
    case "project": {
      const deliverables = ((config.deliverables as { title: string }[]) ?? [])
        .map((d) => d.title)
        .join(", ");
      return `\\project{
title={${esc(title)}},
description={${esc(String(config.introduction ?? ""))}},
difficulty={${esc(String(config.difficulty ?? "intermediate"))}},
estimatedHours={${Number(config.estimatedHours ?? 4)}},
instructions={${esc(String(config.instructions ?? ""))}},
deliverables={${esc(deliverables)}},
submissionType={${esc(String((config.submission as { type?: string })?.type ?? "zip"))}}
}`;
    }
    case "research-paper": {
      const sections = (config.sections as { title: string; content: string }[]) ?? [];
      const sectionTex = sections
        .map((s) => `\\researchsection{title={${esc(s.title)}},body={${esc(s.content)}}}`)
        .join("\n");
      return `\\researchpaper{
title={${esc(String(config.title ?? title))}},
paperType={${esc(String(config.paperType ?? "research"))}},
abstract={${esc(String(config.abstract ?? ""))}},
enableOverleaf={true},
enableColab={true},
${sectionTex}
}
`;
    }
    case "assignment":
      return `\\assignment{
title={${esc(title)}},
duedate={${esc(String(config.dueDate ?? ""))}},
points={${Number(config.points ?? 100)}},
instructions={${esc(String(config.instructions ?? ""))}}
}`;
    case "discussion":
      return `\\discussion{prompt={${esc(String(config.prompt ?? ""))}}}`;
    case "resources":
      return `\\resource{type={link},title={${esc(title)}},url={https://example.com}}`;
    case "quiz":
      return `\\quiz{title={${esc(String(config.title ?? title))}}}`;
    case "checkpoint":
      return `\\checkpoint{title={${esc(String(config.title ?? "Lesson complete"))}},message={${esc(String(config.message ?? ""))}}}`;
    case "reflection":
      return `\\reflection{prompt={${esc(String(config.prompt ?? ""))}}}`;
    case "references": {
      const items = (config.items as { citation: string }[]) ?? [];
      const refs = items.map((r) => `\\referenceitem{citation={${esc(r.citation)}}}`).join("\n");
      return `\\references{\n${refs || `\\referenceitem{citation={Add references here.}}`}\n}`;
    }
    default:
      return `% ${COMPONENT_TITLES[kind as LuLessonComponentKind] ?? kind}`;
  }
}
