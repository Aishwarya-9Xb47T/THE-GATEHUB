/**
 * PDF fallback cards for nodes that cannot render natively in print (video, download, interactive).
 * Shared by latexPdfRenderer — never duplicate card markup elsewhere.
 */

export interface PdfLinkContext {
  frontendBaseUrl?: string;
  apiBaseUrl?: string;
  learningUniverseId?: string;
  lessonTitle?: string;
  lessonId?: string;
  stepId?: string;
}

export interface PdfVideoCardInput {
  title?: string;
  ref: string;
  description?: string;
  duration?: string;
  watchUrl?: string;
}

export interface PdfDownloadCardInput {
  title: string;
  filename: string;
  url?: string;
}

export interface PdfInteractiveCardInput {
  title: string;
  activityType: string;
  url?: string;
  duration?: string;
  summary?: string;
  companionUrl?: string;
  companionLabel?: string;
}

export interface PdfQuizQuestionLike {
  text?: string;
  question?: string;
  explanation?: string;
  options?: Array<{ text?: string; isCorrect?: boolean }>;
  correctAnswer?: string;
}

export interface PdfQuizBlockInput {
  title?: string;
  questions?: PdfQuizQuestionLike[];
  onlineUrl?: string;
}

export interface PdfCodingLabInput {
  title?: string;
  language?: string;
  instructions?: string;
  problemStatement?: string;
  starterCode?: string;
  expectedOutput?: string;
  onlineUrl?: string;
  colabUrl?: string;
}

export interface PdfResearchPaperInput {
  title?: string;
  abstract?: string;
  sections?: Array<{ title?: string; body?: string; content?: string }>;
  onlineUrl?: string;
  overleafUrl?: string;
}

function escPdfText(text: string): string {
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\$/g, "\\$")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

function escUrl(url: string): string {
  return escPdfText(url);
}

function onlineLinkLine(url?: string, label = "Complete this activity online"): string {
  if (!url?.trim()) return "";
  return `\\\\[0.5em]\\textbf{${escPdfText(label)}:}\\\\\\url{${escUrl(url.trim())}}`;
}

function companionLinkLine(url?: string, label?: string): string {
  if (!url?.trim()) return "";
  return `\\\\[0.35em]\\textbf{${escPdfText(label || "Open companion workspace")}:}\\\\\\url{${escUrl(url.trim())}}`;
}

const OPTION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function questionText(q: PdfQuizQuestionLike): string {
  return String(q.text ?? q.question ?? "").trim();
}

function correctAnswerLabel(q: PdfQuizQuestionLike): string {
  const options = q.options ?? [];
  const correct = options.filter((o) => o.isCorrect);
  if (!correct.length) {
    return String(q.correctAnswer ?? "").trim();
  }
  const labels: string[] = [];
  for (let i = 0; i < options.length; i++) {
    if (options[i]?.isCorrect) {
      const letter = OPTION_LETTERS[i] ?? String(i + 1);
      const text = String(options[i]?.text ?? "").trim();
      labels.push(text ? `${letter}. ${text}` : letter);
    }
  }
  return labels.join("; ");
}

/** Full quiz block — question, options, correct answer, explanation. */
export function renderPdfQuizBlock(input: PdfQuizBlockInput): string {
  const title = escPdfText(input.title || "Quiz");
  const questions = input.questions ?? [];
  let out = `\\subsubsection*{${title}}\n\n`;

  if (!questions.length) {
    out += `\\textit{No quiz questions defined.}\n\n`;
    out += onlineLinkLine(input.onlineUrl, "Take this quiz online");
    return out;
  }

  questions.forEach((q, qi) => {
    const qText = escPdfText(questionText(q));
    out += `\\textbf{Question ${qi + 1}:} ${qText}\n\n`;
    const options = q.options ?? [];
    if (options.length) {
      out += "\\begin{itemize}[leftmargin=*,itemsep=2pt]\n";
      options.forEach((opt, oi) => {
        const letter = OPTION_LETTERS[oi] ?? String(oi + 1);
        const optText = escPdfText(String(opt.text ?? "").trim());
        const mark = opt.isCorrect ? " \\textbf{(Correct)}" : "";
        out += `  \\item[\\textbf{${letter}.}] ${optText}${mark}\n`;
      });
      out += "\\end{itemize}\n\n";
    }
    const answer = correctAnswerLabel(q);
    if (answer) {
      out += `\\textbf{Answer:} ${escPdfText(answer)}\n\n`;
    }
    const explanation = String(q.explanation ?? "").trim();
    if (explanation) {
      out += `\\textbf{Explanation:} ${escPdfText(explanation)}\n\n`;
    }
    out += "\\vspace{0.35em}\n";
  });

  out += `\\begin{center}
\\fbox{\\parbox{0.92\\linewidth}{%
\\centering
\\textit{Interactive quiz — also available online}${onlineLinkLine(input.onlineUrl, "Open quiz in THE GATEHUB")}%
}}
\\end{center}\n\n`;
  return out;
}

/** Coding lab — instructions, starter code, Colab + online workspace links. */
export function renderPdfCodingLabCard(input: PdfCodingLabInput): string {
  const title = escPdfText(input.title || "Coding Lab");
  const lang = escPdfText(input.language || "python");
  const instructions = String(input.instructions ?? input.problemStatement ?? "").trim();
  const starter = String(input.starterCode ?? "").trim();
  const expected = String(input.expectedOutput ?? "").trim();

  let out = `\\subsubsection*{${title}}\n\n`;
  out += `\\begin{center}
\\fbox{\\parbox{0.92\\linewidth}{%
\\centering
\\textbf{${title}}\\\\[0.35em]
\\textit{Coding Lab — run and submit in THE GATEHUB workspace}\\\\[0.35em]
\\small Language: \\texttt{${lang}}%
${onlineLinkLine(input.onlineUrl, "Open Coding Lab")}%
${companionLinkLine(input.colabUrl, "Open in Google Colab")}%
}}
\\end{center}\n\n`;

  if (instructions) {
    out += `\\textbf{Instructions:}\n\n${escPdfText(instructions)}\n\n`;
  }
  if (starter) {
    out += `\\textbf{Starter code:}\n\n\\begin{lstlisting}[language=${lang}]\n${starter}\n\\end{lstlisting}\n\n`;
  }
  if (expected) {
    out += `\\textbf{Expected output:} \\texttt{${escPdfText(expected)}}\n\n`;
  }
  return out;
}

/** Research paper assignment — abstract, section prompts, Overleaf + workspace links. */
export function renderPdfResearchPaperCard(input: PdfResearchPaperInput): string {
  const title = escPdfText(input.title || "Research Paper");
  const abstract = String(input.abstract ?? "").trim();
  const sections = input.sections ?? [];

  let out = `\\subsubsection*{${title}}\n\n`;
  out += `\\begin{center}
\\fbox{\\parbox{0.92\\linewidth}{%
\\centering
\\textbf{${title}}\\\\[0.35em]
\\textit{Research Paper — write in THE GATEHUB workspace or Overleaf}\\\\[0.35em]
\\small Submit your compiled PDF when complete%
${onlineLinkLine(input.onlineUrl, "Open Research Workspace")}%
${companionLinkLine(input.overleafUrl, "Open in Overleaf")}%
}}
\\end{center}\n\n`;

  if (abstract) {
    out += `\\textbf{Assignment brief:}\n\n${escPdfText(abstract)}\n\n`;
  }
  if (sections.length) {
    out += `\\textbf{Required sections:}\n\n\\begin{itemize}[leftmargin=*]\n`;
    for (const section of sections) {
      const sectionTitle = escPdfText(String(section.title ?? "Section").trim());
      const body = String(section.body ?? section.content ?? "").trim();
      const bodyLine = body ? ` — ${escPdfText(body.slice(0, 280))}${body.length > 280 ? "…" : ""}` : "";
      out += `  \\item \\textbf{${sectionTitle}}${bodyLine}\n`;
    }
    out += "\\end{itemize}\n\n";
  }
  return out;
}

/** Beautiful video card for PDF — watch URL link. */
export function renderPdfVideoCard(input: PdfVideoCardInput): string {
  const title = escPdfText(input.title || "Lesson Video");
  const url = (input.watchUrl || input.ref || "").trim();
  const urlEsc = url ? escUrl(url) : "";
  const duration = input.duration ? `\\\\[0.25em]\\small Duration: ${escPdfText(input.duration)}` : "";
  const urlBlock = urlEsc
    ? `\\\\[0.5em]\\textbf{Watch on THE GATEHUB:}\\\\\\url{${urlEsc}}`
    : `\\\\[0.5em]\\textit{Video available in the online course player}`;
  return `\\begin{center}
\\fbox{\\parbox{0.85\\linewidth}{%
\\centering
\\textbf{${title}}\\\\[0.5em]
\\textit{Video lesson — not playable in PDF}${duration}${urlBlock}%
}}
\\end{center}\n\n`;
}

export function renderPdfDownloadCard(input: PdfDownloadCardInput): string {
  const title = escPdfText(input.title);
  const file = escPdfText(input.filename);
  const urlLine = input.url ? `\\\\[0.5em]\\url{${escUrl(input.url)}}` : "";
  return `\\begin{center}
\\fbox{\\parbox{0.85\\linewidth}{%
\\centering
\\textbf{Download: ${title}}\\\\[0.5em]
\\small ${file}${urlLine}%
}}
\\end{center}\n\n`;
}

export function renderPdfInteractiveCard(input: PdfInteractiveCardInput): string {
  const title = escPdfText(input.title);
  const type = escPdfText(input.activityType);
  const dur = input.duration ? `\\\\[0.25em]\\small Estimated time: ${escPdfText(input.duration)}` : "";
  const summary = input.summary ? `\\\\[0.35em]\\small ${escPdfText(input.summary)}` : "";
  const urlLine = onlineLinkLine(input.url, "Complete online");
  const companion = companionLinkLine(input.companionUrl, input.companionLabel);
  return `\\begin{center}
\\fbox{\\parbox{0.85\\linewidth}{%
\\centering
\\textbf{${title}}\\\\[0.35em]
\\textit{This activity is interactive — complete it online}\\\\[0.35em]
\\small Activity type: ${type}${dur}${summary}${urlLine}${companion}%
}}
\\end{center}\n\n`;
}

export function renderPdfUnsupportedNodeCard(nodeType: string, detail?: string): string {
  const t = escPdfText(nodeType);
  const d = detail ? `\\\\[0.35em]\\small ${escPdfText(detail)}` : "";
  return `\\begin{center}
\\fbox{\\parbox{0.85\\linewidth}{%
\\centering
\\textit{[${t} content — view online for full experience]}${d}%
}}
\\end{center}\n\n`;
}

export function buildLessonLearnUrl(linkCtx?: PdfLinkContext): string | undefined {
  if (!linkCtx?.frontendBaseUrl) return undefined;
  const base = linkCtx.frontendBaseUrl.replace(/\/$/, "");
  if (linkCtx.learningUniverseId && linkCtx.lessonId) {
    return `${base}/learning-universe/${linkCtx.learningUniverseId}/learn/${linkCtx.lessonId}`;
  }
  if (linkCtx.learningUniverseId) {
    return `${base}/learning-universe/${linkCtx.learningUniverseId}/learn`;
  }
  return base;
}

/** Deep-link to the lesson video step in the online player (PDF watch links). */
export function buildVideoWatchUrl(linkCtx?: PdfLinkContext): string | undefined {
  const lessonUrl = buildLessonLearnUrl(linkCtx);
  if (!lessonUrl || !linkCtx?.lessonId) return lessonUrl;
  const stepId = `videos-${linkCtx.lessonId}`;
  const sep = lessonUrl.includes("?") ? "&" : "?";
  return `${lessonUrl}${sep}step=${encodeURIComponent(stepId)}`;
}

export function linkifyWatchMarkdownForPdf(text: string, watchUrl?: string): string {
  if (!watchUrl?.trim() || !text.includes("Watch:")) return text;
  const url = escUrl(watchUrl.trim());
  return text
    .replace(
      /^([ \t]*[-*•][ \t]+)Watch:\s*(.+?)(?:\s*\([^)]*\))?\s*$/gim,
      (_line, prefix, title) =>
        `${prefix}\\href{${url}}{Watch: ${escPdfText(String(title).trim())}}`
    )
    .replace(
      /^Watch:\s*(.+?)(?:\s*\([^)]*\))?\s*$/gim,
      (_line, title) => `\\href{${url}}{Watch: ${escPdfText(String(title).trim())}}`
    );
}

function extractYouTubeIdFromUrl(url: string): string | undefined {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/i);
  return m?.[1];
}

export function resolvePdfVideoWatchUrl(
  content: Record<string, unknown>,
  linkCtx?: PdfLinkContext
): string | undefined {
  const videoCtx: PdfLinkContext | undefined = linkCtx?.lessonId
    ? { ...linkCtx, stepId: `videos-${linkCtx.lessonId}` }
    : linkCtx;
  const websiteUrl = buildVideoWatchUrl(videoCtx);
  if (websiteUrl) return websiteUrl;

  const url = String(content.url ?? content.file ?? content.path ?? "").trim();
  const type = String(content.type ?? content.sourceType ?? "").toLowerCase();
  const youtubeId = String(content.youtubeId ?? content.youtubeid ?? content.videoid ?? "").trim();
  if (type === "youtube" || youtubeId || /youtu/i.test(url)) {
    const id = youtubeId || extractYouTubeIdFromUrl(url);
    if (id) return `https://www.youtube.com/watch?v=${id}`;
  }
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/uploads/") && linkCtx?.apiBaseUrl) {
    return `${linkCtx.apiBaseUrl.replace(/\/$/, "")}${url}`;
  }
  return undefined;
}

export function buildWorkspaceLearnUrl(
  linkCtx: PdfLinkContext | undefined,
  workspace: "coding-lab" | "notebook" | "research" | "project"
): string | undefined {
  const lessonUrl = buildLessonLearnUrl(linkCtx);
  if (!lessonUrl || !linkCtx?.stepId) return lessonUrl;
  return `${lessonUrl}/${workspace}/${linkCtx.stepId}`;
}
