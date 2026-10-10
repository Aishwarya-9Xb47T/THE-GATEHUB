import { describe, it, expect, jest } from "@jest/globals";
import {
  sanitizeLatexSource,
  generateDefaultComponentScaffold,
  planLuAgent,
} from "../luAuthoringAgentService.js";
import { mapErrorsToSourceFiles } from "../luErrorMapper.js";
import type { SourceLineMapping } from "../luIncludeResolver.js";
import type { ParsedLatexError } from "../../latexLogParser.js";

describe("luAuthoringAgentService — Stage 1: Planner & Multi-File Generation", () => {
  it("generates correct GATEHUB DSL scaffolds for all component types", () => {
    const overview = generateDefaultComponentScaffold("overview", "Introduction", "Distributed Systems");
    expect(overview).toContain("\\overviewmarkdown={");
    expect(overview).toContain("Distributed Systems");
    expect(overview).not.toContain("\\begin{document}");

    const topics = generateDefaultComponentScaffold("topics", "Raft Consensus", "Distributed Systems");
    expect(topics).toContain("\\theory{title={");
    expect(topics).toContain("Raft Consensus");

    const lab = generateDefaultComponentScaffold("coding-lab", "Paxos Lab", "Distributed Systems");
    expect(lab).toContain("\\codinglab{");
    expect(lab).toContain("language={python}");
    expect(lab).toContain("startercode={");

    const quiz = generateDefaultComponentScaffold("quiz", "Module Quiz", "Distributed Systems");
    expect(quiz).toContain("\\quiz{");
    expect(quiz).toContain("\\input{question-01}");

    const question = generateDefaultComponentScaffold("question", "Question 1", "Distributed Systems");
    expect(question).toContain("\\quiz{");
    expect(question).toContain("question={");
    expect(question).toContain("correct={B}");

    const paper = generateDefaultComponentScaffold("research-paper", "Formal Verification", "Distributed Systems");
    expect(paper).toContain("\\researchpaper{");
    expect(paper).toContain("\\researchsection{title={Introduction}");

    const checkpoint = generateDefaultComponentScaffold("checkpoint", "Milestone 1", "Distributed Systems");
    expect(checkpoint).toContain("\\checkpoint{");
  });

  it("sanitizes unescaped characters in LaTeX source without breaking macros", () => {
    const raw = "The success rate is 100% and company AT&T uses snake_case_variable.";
    const sanitized = sanitizeLatexSource(raw);
    expect(sanitized).toContain("100\\%");
    expect(sanitized).toContain("AT \\& T");
    expect(sanitized).toContain("snake\\_case\\_variable");

    // Preserves existing macros like \input and \theory
    const macroCode = "\\theory{title={My \\& Your Lesson},body={100\\% completed}}";
    const macroSanitized = sanitizeLatexSource(macroCode);
    expect(macroSanitized).toContain("\\theory");
    expect(macroSanitized).toContain("100\\%");
  });

  it("automatically balances unclosed braces in LaTeX source", () => {
    const unclosed = "\\theory{title={Unclosed Title},body={Some text without closing brace";
    const balanced = sanitizeLatexSource(unclosed);
    const opens = (balanced.match(/(?<!\\)\{/g) || []).length;
    const closes = (balanced.match(/(?<!\\)\}/g) || []).length;
    expect(opens).toBe(closes);
  });
});

describe("luAuthoringAgentService — Stage 2: Diagnostics & Error Mapping", () => {
  it("maps compiler errors back to the specific component source file and line", () => {
    const lineMap: SourceLineMapping[] = [
      { mergedLine: 1, sourcePath: "/track-01/track.tex", sourceLine: 1 },
      { mergedLine: 10, sourcePath: "/track-01/mod-01/lesson-01/overview.tex", sourceLine: 1 },
      { mergedLine: 11, sourcePath: "/track-01/mod-01/lesson-01/overview.tex", sourceLine: 2 },
      { mergedLine: 12, sourcePath: "/track-01/mod-01/lesson-01/overview.tex", sourceLine: 3 },
      { mergedLine: 20, sourcePath: "/track-01/mod-01/lesson-01/topics.tex", sourceLine: 5 },
    ];

    const compilerErrors: ParsedLatexError[] = [
      {
        message: "Undefined control sequence \\unknowncmd",
        file: "/main.tex",
        line: 11,
      },
      {
        message: "Missing $ inserted",
        file: "/main.tex",
        line: 20,
      },
    ];

    const mapped = mapErrorsToSourceFiles(compilerErrors, lineMap);
    expect(mapped).toHaveLength(2);

    expect(mapped[0].sourceFile).toBe("/track-01/mod-01/lesson-01/overview.tex");
    expect(mapped[0].sourceLine).toBe(2);
    expect(mapped[0].message).toContain("\\unknowncmd");

    expect(mapped[1].sourceFile).toBe("/track-01/mod-01/lesson-01/topics.tex");
    expect(mapped[1].sourceLine).toBe(5);
    expect(mapped[1].message).toContain("Missing $ inserted");
  });

  it("preserves direct file errors if compiler already provided a component file", () => {
    const directErrors: ParsedLatexError[] = [
      {
        message: "Package listings Error: Language python undefined",
        file: "track-01/mod-01/lesson-01/coding-lab-01.tex",
        line: 4,
      },
    ];

    const mapped = mapErrorsToSourceFiles(directErrors, []);
    expect(mapped[0].sourceFile).toBe("/track-01/mod-01/lesson-01/coding-lab-01.tex");
    expect(mapped[0].sourceLine).toBe(4);
  });

  it("handles unclosed environments by ensuring proper closure", () => {
    const broken = "\\theory{title={Intro},body={\\begin{itemize}\n\\item First item\n}}";
    const repaired = sanitizeLatexSource(broken);
    expect(repaired).toContain("\\begin{itemize}");
  });

  it("produces compliant Overleaf-style \\input child references", () => {
    const quizContent = generateDefaultComponentScaffold("quiz", "Quiz 1", "Algorithms");
    expect(quizContent).toContain("\\input{question-01}");
    expect(quizContent).toContain("\\input{question-02}");
  });
});

