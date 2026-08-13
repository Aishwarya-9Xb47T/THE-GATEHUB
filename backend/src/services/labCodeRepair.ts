/**
 * Repair AI-generated coding lab starter code so it runs in the notebook / playground.
 * Applied at generation, parse, and experience-build time for existing + future courses.
 */
import { createHash } from "crypto";
import { executeCodeSnippet, syntaxLooksValid } from "./aiCourseArchitect/codeExecutor.js";
import { sanitizeCodingLabCode } from "./aiCourseArchitect/pipeline/placeholderGuards.js";

function computeHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

const RUNNABLE_ANALYZE_LAB = `"""Hands-on lab — run this cell to verify your environment."""

def analyze(samples: list[float], threshold: float = 0.75) -> dict:
    """Return mean, count, and whether mean meets threshold."""
    if not samples:
        raise ValueError("samples must be non-empty")
    mean = sum(samples) / len(samples)
    passed = mean >= threshold
    return {"mean": mean, "count": len(samples), "passed": passed}


def _run_tests() -> None:
    result = analyze([0.8, 0.9, 0.7, 0.85])
    assert result["count"] == 4
    assert abs(result["mean"] - 0.8125) < 0.001
    assert result["passed"] is True
    print("All public tests passed.")
    print(f"Result: {result}")


if __name__ == "__main__":
    _run_tests()
`;

const DEFAULT_STARTERS: Record<string, string> = {
  python: 'print("Lab ready — edit this cell and run again.")\n',
  javascript: 'console.log("Lab ready — edit this cell and run again.");\n',
  typescript: 'console.log("Lab ready — edit this cell and run again.");\n',
  java: `public class Main {
  public static void main(String[] args) {
    System.out.println("Lab ready");
  }
}
`,
};

export function isBrokenLabCode(code: string, language = "python"): boolean {
  if (!code?.trim()) return true;
  if (/NotImplementedError/i.test(code)) return true;
  if (/your solution here|your implementation here/i.test(code)) return true;
  if (!syntaxLooksValid(code, language)) return true;
  return false;
}

function repairPythonStarter(code: string): string {
  let repaired = sanitizeCodingLabCode(code);

  if (/NotImplementedError/i.test(repaired)) {
    if (/def analyze\s*\(/.test(repaired)) {
      return RUNNABLE_ANALYZE_LAB;
    }
    repaired = repaired.replace(/\s*raise NotImplementedError[^\n]*/gi, "\n    pass");
  }

  // Collapse accidental quadruple quotes from LaTeX/AI export
  repaired = repaired.replace(/""""/g, '"""');

  return repaired;
}

function repairJavaScriptStarter(code: string): string {
  let repaired = sanitizeCodingLabCode(code);
  if (/throw new Error\(["']Not implemented/i.test(repaired)) {
    repaired = repaired.replace(/throw new Error\([^)]*\);?/gi, 'console.log("Step complete");');
  }
  if (/TODO|NotImplementedError/i.test(repaired)) {
    return DEFAULT_STARTERS.javascript;
  }
  return repaired;
}

export function repairStarterCode(code: string, language = "python"): string {
  console.log("[LAB CODE REPAIR] INPUT CODE HASH:", computeHash(code || ""));

  const lang = (language || "python").toLowerCase();
  const normalized = (code || "").replace(/\r\n/g, "\n").trimEnd();

  console.log("[LAB CODE REPAIR] NORMALIZED CODE HASH:", computeHash(normalized));

  if (!normalized) {
    const fallback = DEFAULT_STARTERS[lang] ?? DEFAULT_STARTERS.python;
    console.log("[LAB CODE REPAIR] FALLBACK CODE HASH:", computeHash(fallback));
    return fallback;
  }

  let repaired: string;
  if (lang === "python" || lang === "py") {
    repaired = repairPythonStarter(normalized);
  } else if (lang === "javascript" || lang === "js" || lang === "typescript" || lang === "ts") {
    repaired = repairJavaScriptStarter(normalized);
  } else {
    repaired = sanitizeCodingLabCode(normalized);
  }

  console.log("[LAB CODE REPAIR] REPAIRED CODE HASH:", computeHash(repaired));

  const final = repaired.endsWith("\n") ? repaired : `${repaired}\n`;
  console.log("[LAB CODE REPAIR] FINAL CODE HASH:", computeHash(final));
  return final;
}

/** Repair and optionally verify by execution; falls back to language default if still broken. */
export async function ensureRunnableLabCode(
  code: string,
  language = "python",
  solutionCode?: string
): Promise<string> {
  let repaired = repairStarterCode(code, language);

  if (solutionCode && isBrokenLabCode(repaired, language)) {
    const fromSolution = repairStarterCode(solutionCode, language);
    if (!isBrokenLabCode(fromSolution, language)) {
      repaired = fromSolution;
    }
  }

  if (!isBrokenLabCode(repaired, language)) {
    const exec = await executeCodeSnippet(repaired, language);
    if (exec.success) return repaired;
  }

  if (language === "python" && /def analyze\s*\(/.test(code)) {
    const exec = await executeCodeSnippet(RUNNABLE_ANALYZE_LAB, "python");
    if (exec.success) return RUNNABLE_ANALYZE_LAB;
  }

  const fallback = DEFAULT_STARTERS[language.toLowerCase()] ?? DEFAULT_STARTERS.python;
  const exec = await executeCodeSnippet(fallback, language);
  return exec.success ? fallback : repaired;
}
