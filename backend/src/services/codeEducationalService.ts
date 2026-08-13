/**
 * Educational code validation and beginner-friendly error explanations.
 * Used by the practice playground execution API.
 */

export interface ValidationIssue {
  line: number | null;
  column?: number | null;
  type: string;
  message: string;
  explanation: string;
  suggestedFix?: string;
}

export interface EducationalError {
  errorType: string;
  rawError: string;
  line: number | null;
  explanation: string;
  suggestedFix?: string;
  correctedCode?: string;
  hints: string[];
}

export interface ExecutionEducationalResult {
  success: boolean;
  output: string;
  validationIssues?: ValidationIssue[];
  educationalError?: EducationalError;
  outputMatchesExpected?: boolean | null;
}

const BLOCK_STARTERS =
  /^\s*(if|elif|else|for|while|def|class|try|except|finally|with)\b/;

export function normalizeLanguage(language: string): string {
  const l = (language || "javascript").toLowerCase();
  if (l === "py") return "python";
  if (l === "js" || l === "node") return "javascript";
  if (l === "ts") return "typescript";
  if (l === "c++") return "cpp";
  return l;
}

/** Pre-execution syntax checks — catches obvious mistakes before running. */
export function validateCode(code: string, language: string): ValidationIssue[] {
  const lang = normalizeLanguage(language);
  if (lang === "python") return validatePython(code);
  if (lang === "javascript" || lang === "typescript") return validateJavaScript(code);
  if (lang === "java") return validateJava(code);
  if (lang === "c" || lang === "cpp") return validateCStyle(code, lang);
  return [];
}

function validatePython(code: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lines = code.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const blockMatch = trimmed.match(
      /^(if|elif|for|while|def|class|try|except|finally|with)\b(.+)$/
    );
    if (blockMatch) {
      const rest = blockMatch[2].trim();
      if (!rest.endsWith(":")) {
        const fixed = `${line.trimEnd()}:`;
        issues.push({
          line: i + 1,
          type: "SyntaxError",
          message: "Missing colon ':' after statement",
          explanation: `Python ${blockMatch[1]} statements must end with a colon (:).`,
          suggestedFix: fixed,
        });
      }
    } else if (/^else\b/.test(trimmed) && !trimmed.endsWith(":")) {
      issues.push({
        line: i + 1,
        type: "SyntaxError",
        message: "Missing colon ':' after else",
        explanation: "The else statement must end with a colon (:).",
        suggestedFix: `${line.trimEnd()}:`,
      });
    }

    if (i > 0) {
      const prev = lines[i - 1];
      const prevTrim = prev.trim();
      if (prevTrim.endsWith(":") && !prevTrim.startsWith("#")) {
        const prevIndent = prev.match(/^(\s*)/)?.[1].length ?? 0;
        const currIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
        if (trimmed && currIndent <= prevIndent) {
          const indent = " ".repeat(prevIndent + 4);
          issues.push({
            line: i + 1,
            type: "IndentationError",
            message: "Expected an indented block",
            explanation:
              "Python uses indentation to define blocks. The line after a colon must be indented.",
            suggestedFix: `${indent}${trimmed}`,
          });
        }
      }
    }

    if (/\/\s*0\b/.test(trimmed) || /%\s*0\b/.test(trimmed)) {
      issues.push({
        line: i + 1,
        type: "RuntimeWarning",
        message: "Possible infinite loop",
        explanation:
          "while True runs forever unless you break out. Add a break condition or limit iterations.",
      });
    }

    if (/\/\s*0\b/.test(trimmed) || /%\s*0\b/.test(trimmed)) {
      issues.push({
        line: i + 1,
        type: "ZeroDivisionError",
        message: "Possible division by zero",
        explanation: "Dividing or modulo by zero will crash your program.",
      });
    }
  }

  issues.push(...pythonMultilineStringIssues(code));

  return issues.filter(
    (issue, idx, arr) =>
      arr.findIndex((x) => x.line === issue.line && x.type === issue.type) === idx
  );
}

/** Whole-file string state machine — avoids false positives on multiline docstrings. */
function pythonMultilineStringIssues(code: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let inTripleD = false;
  let inTripleS = false;
  let inStrD = false;
  let inStrS = false;
  let line = 1;
  let openLine = 1;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === "\n") {
      line++;
      continue;
    }

    if (!inTripleD && !inTripleS && !inStrD && !inStrS) {
      if (ch === "#") {
        while (i < code.length && code[i] !== "\n") i++;
        continue;
      }
      if (code.startsWith('"""', i)) {
        inTripleD = true;
        openLine = line;
        i += 2;
        continue;
      }
      if (code.startsWith("'''", i)) {
        inTripleS = true;
        openLine = line;
        i += 2;
        continue;
      }
      if (ch === '"') {
        inStrD = true;
        openLine = line;
        continue;
      }
      if (ch === "'") {
        inStrS = true;
        openLine = line;
        continue;
      }
    } else if (inTripleD) {
      if (code.startsWith('"""', i)) {
        inTripleD = false;
        i += 2;
        continue;
      }
    } else if (inTripleS) {
      if (code.startsWith("'''", i)) {
        inTripleS = false;
        i += 2;
        continue;
      }
    } else if (inStrD) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === '"') {
        inStrD = false;
        continue;
      }
    } else if (inStrS) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === "'") {
        inStrS = false;
        continue;
      }
    }
  }

  if (inTripleD || inTripleS || inStrD || inStrS) {
    issues.push({
      line: openLine,
      type: "SyntaxError",
      message: "Unclosed string quotes",
      explanation: "A string or docstring was opened but not closed.",
    });
  }

  return issues;
}

function validateJavaScript(code: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lines = code.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("//")) continue;

    const openParen = (trimmed.match(/\(/g) || []).length;
    const closeParen = (trimmed.match(/\)/g) || []).length;
    const openBrace = (trimmed.match(/\{/g) || []).length;
    const closeBrace = (trimmed.match(/\}/g) || []).length;
    const openBracket = (trimmed.match(/\[/g) || []).length;
    const closeBracket = (trimmed.match(/\]/g) || []).length;

    if (openParen !== closeParen || openBrace !== closeBrace || openBracket !== closeBracket) {
      issues.push({
        line: i + 1,
        type: "SyntaxError",
        message: "Mismatched brackets or parentheses",
        explanation: "Every (, {, [ needs a matching closing bracket on this line or later.",
      });
    }
  }

  issues.push(...javascriptTemplateAndStringIssues(code));

  return issues;
}

function javascriptTemplateAndStringIssues(code: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let inTemplate = false;
  let inStrD = false;
  let inStrS = false;
  let line = 1;
  let openLine = 1;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === "\n") {
      line++;
      continue;
    }
    if (!inTemplate && !inStrD && !inStrS) {
      if (ch === "/" && code[i + 1] === "/") {
        while (i < code.length && code[i] !== "\n") i++;
        continue;
      }
      if (ch === "`") {
        inTemplate = true;
        openLine = line;
        continue;
      }
      if (ch === '"') {
        inStrD = true;
        openLine = line;
        continue;
      }
      if (ch === "'") {
        inStrS = true;
        openLine = line;
        continue;
      }
    } else if (inTemplate) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === "`") {
        inTemplate = false;
        continue;
      }
    } else if (inStrD) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === '"') {
        inStrD = false;
        continue;
      }
    } else if (inStrS) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === "'") {
        inStrS = false;
        continue;
      }
    }
  }

  if (inTemplate || inStrD || inStrS) {
    issues.push({
      line: openLine,
      type: "SyntaxError",
      message: "Unclosed string quotes",
      explanation: "Check that every opening quote or backtick has a matching closer.",
    });
  }

  return issues;
}

function validateJava(code: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!code.includes("class ") && !code.includes("void main")) {
    issues.push({
      line: null,
      type: "StructureHint",
      message: "Java needs a class with main method",
      explanation:
        "Wrap your code in a class, or we will auto-wrap it when you run. Example: public class Main { public static void main(String[] args) { ... } }",
    });
  }
  return issues;
}

function validateCStyle(code: string, lang: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!code.includes("main") && lang === "c") {
    issues.push({
      line: null,
      type: "StructureHint",
      message: "C programs need a main function",
      explanation: "Add int main() { ... return 0; } to run your C code.",
    });
  }
  return issues;
}

function extractLineNumber(raw: string): number | null {
  const py = raw.match(/line\s+(\d+)/i);
  if (py) return Number(py[1]);
  const js = raw.match(/:(\d+):/);
  if (js) return Number(js[1]);
  return null;
}

function extractErrorType(raw: string): string {
  const m = raw.match(/(\w+Error|\w+Exception|SyntaxError)/);
  return m ? m[1] : "Error";
}

/** Turn compiler/runtime output into beginner-friendly guidance. */
export function explainExecutionError(
  rawError: string,
  code: string,
  language: string
): EducationalError {
  const lang = normalizeLanguage(language);
  const line = extractLineNumber(rawError);
  const errorType = extractErrorType(rawError);
  const hints: string[] = [];
  let explanation = "Something went wrong while running your code. Read the suggestion below.";
  let suggestedFix: string | undefined;
  let correctedCode: string | undefined;

  const lines = code.split(/\r?\n/);
  const lineIdx = line ? line - 1 : -1;
  const problemLine = lineIdx >= 0 ? lines[lineIdx] : "";

  if (/expected\s*['"]?:['"]?/i.test(rawError) || /invalid syntax/i.test(rawError)) {
    explanation =
      lang === "python"
        ? "You forgot the colon (:) at the end of an if/for/while/def statement."
        : "There is a syntax error — often a missing colon, bracket, or semicolon.";
    hints.push("In Python, block statements must end with a colon (:).");
    if (problemLine && BLOCK_STARTERS.test(problemLine) && !problemLine.trimEnd().endsWith(":")) {
      suggestedFix = `${problemLine.trimEnd()}:`;
      const fixed = [...lines];
      fixed[lineIdx] = suggestedFix;
      correctedCode = fixed.join("\n");
    }
  } else if (/IndentationError/i.test(rawError)) {
    explanation =
      "Python uses indentation to define blocks. The line after if/for/while/def must be indented (usually 4 spaces).";
    hints.push("Select the lines inside your block and press Tab to indent them.");
    if (lineIdx > 0) {
      const prevIndent = (lines[lineIdx - 1].match(/^(\s*)/)?.[1].length ?? 0) + 4;
      suggestedFix = `${" ".repeat(prevIndent)}${problemLine.trim()}`;
      const fixed = [...lines];
      fixed[lineIdx] = suggestedFix;
      correctedCode = fixed.join("\n");
    }
  } else if (/NameError/i.test(rawError)) {
    const nameMatch = rawError.match(/name '([^']+)'/);
    const varName = nameMatch?.[1];
    explanation = varName
      ? `The variable or function '${varName}' is not defined. Check spelling and that you assigned it first.`
      : "A variable or function name was used before it was defined.";
    hints.push("Define variables before using them, and watch for typos.");
  } else if (/ZeroDivisionError/i.test(rawError)) {
    explanation = "You cannot divide by zero. Check the denominator in your division or modulo.";
  } else if (/timeout|SIGTERM|timed out/i.test(rawError)) {
    explanation = "Your program ran too long (possible infinite loop). Add a stop condition or break.";
    hints.push("Check while loops and make sure they eventually end.");
  } else if (/cannot find symbol|error:.*undeclared/i.test(rawError)) {
    explanation = "A variable or method was used without being declared. Check imports and spelling.";
  } else if (/Exception in thread|Compilation failed|error:/i.test(rawError)) {
    explanation = "The compiler found an error. Check brackets, semicolons, and class structure.";
  }

  return {
    errorType,
    rawError: rawError.trim(),
    line,
    explanation,
    suggestedFix,
    correctedCode,
    hints,
  };
}

export function compareOutput(actual: string, expected: string): boolean {
  const norm = (s: string) =>
    s
      .replace(/\r\n/g, "\n")
      .trim()
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n");
  return norm(actual) === norm(expected);
}

/** Block execution on critical pre-check issues (syntax/indent), allow warnings through. */
export function blockingValidationIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter(
    (i) =>
      i.type === "SyntaxError" ||
      i.type === "IndentationError" ||
      i.type === "ZeroDivisionError"
  );
}
