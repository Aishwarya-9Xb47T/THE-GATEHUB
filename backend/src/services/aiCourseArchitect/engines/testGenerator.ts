/**
 * V6 Part 3 — Automatic test generation for coding labs.
 */
import type { ArchitectCodingLab } from "../types.js";
import type { SandboxTestCase } from "./codeSandbox.js";

export interface GeneratedTestSuite {
  visible: SandboxTestCase[];
  hidden: SandboxTestCase[];
  edgeCases: SandboxTestCase[];
  sampleInput: string;
  sampleOutput: string;
  complexityNote?: string;
}

export function generateCodingLabTests(lab: ArchitectCodingLab, language = "python"): GeneratedTestSuite {
  const visible: SandboxTestCase[] = [
    { name: "basic-output", expectedOutput: lab.expectedOutput ?? "", hidden: false },
    { name: "sample-run", input: lab.inputDescription ?? "", expectedOutput: lab.expectedOutput ?? "", hidden: false },
  ];

  const hidden: SandboxTestCase[] = [
    { name: "empty-input", input: "", hidden: true },
    { name: "stress-boundary", input: lab.inputDescription ? `${lab.inputDescription}\n${lab.inputDescription}` : "", hidden: true },
  ];

  const edgeCases: SandboxTestCase[] = [
    { name: "null-safe", hidden: true },
    { name: "large-input", hidden: true },
  ];

  if (language.includes("python")) {
    edgeCases.push({ name: "type-error-guard", hidden: true });
  }

  return {
    visible: visible.filter((t) => t.expectedOutput || t.input),
    hidden,
    edgeCases,
    sampleInput: lab.inputDescription ?? "",
    sampleOutput: lab.expectedOutput ?? "",
    complexityNote: "Run visible tests in learner UI; hidden tests validate submissions server-side.",
  };
}

export function attachTestsToLab(lab: ArchitectCodingLab): ArchitectCodingLab {
  const suite = generateCodingLabTests(lab, lab.language);
  return {
    ...lab,
    publicTestCases: [
      ...(lab.publicTestCases ?? []),
      ...suite.visible.map((t) => ({ input: t.input ?? "", output: t.expectedOutput ?? "" })),
    ],
    hiddenTestCases: [
      ...(lab.hiddenTestCases ?? []),
      ...suite.hidden.map((t) => ({ input: t.input ?? "", output: t.expectedOutput ?? "" })),
    ],
    edgeCases: [...(lab.edgeCases ?? []), ...suite.edgeCases.map((t) => t.name)],
  };
}
