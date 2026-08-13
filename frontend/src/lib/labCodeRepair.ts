/**
 * Client-side repair for coding lab cells (matches backend labCodeRepair logic).
 * Fixes persisted autosave + legacy AI content without requiring republish.
 */

function computeHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
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
};

export function isBrokenLabCode(code: string): boolean {
  if (!code?.trim()) return true;
  if (/NotImplementedError/i.test(code)) return true;
  if (/your solution here|your implementation here/i.test(code)) return true;
  return false;
}

function repairPythonStarter(code: string): string {
  let repaired = code.replace(/\r\n/g, "\n");

  if (/NotImplementedError/i.test(repaired)) {
    if (/def analyze\s*\(/.test(repaired)) {
      return RUNNABLE_ANALYZE_LAB;
    }
    repaired = repaired.replace(/\s*raise NotImplementedError[^\n]*/gi, "\n    pass");
  }

  repaired = repaired.replace(/""""/g, '"""');
  return repaired;
}

export function repairStarterCode(code: string, language = "python"): string {
  console.log("[LAB CODE REPAIR] INPUT CODE:", code);
  console.log("[LAB CODE REPAIR] INPUT CODE HASH:", computeHash(code || ""));
  console.log("[LAB CODE REPAIR] LANGUAGE:", language);

  const lang = (language || "python").toLowerCase();
  const normalized = (code || "").replace(/\r\n/g, "\n").trimEnd();

  console.log("[LAB CODE REPAIR] NORMALIZED CODE:", normalized);
  console.log("[LAB CODE REPAIR] NORMALIZED CODE HASH:", computeHash(normalized));
  console.log("[LAB CODE REPAIR] NORMALIZED LENGTH:", normalized.length);

  if (!normalized) {
    const fallback = DEFAULT_STARTERS[lang] ?? DEFAULT_STARTERS.python;
    console.log("[LAB CODE REPAIR] EMPTY CODE - USING FALLBACK:", fallback);
    console.log("[LAB CODE REPAIR] FALLBACK CODE HASH:", computeHash(fallback));
    return fallback;
  }

  let repaired =
    lang === "python" || lang === "py" ? repairPythonStarter(normalized) : normalized;

  console.log("[LAB CODE REPAIR] REPAIRED CODE:", repaired);
  console.log("[LAB CODE REPAIR] REPAIRED CODE HASH:", computeHash(repaired));
  console.log("[LAB CODE REPAIR] IS BROKEN:", isBrokenLabCode(repaired));

  if (isBrokenLabCode(repaired)) {
    repaired = DEFAULT_STARTERS[lang] ?? DEFAULT_STARTERS.python;
    console.log("[LAB CODE REPAIR] BROKEN CODE - USING DEFAULT:", repaired);
    console.log("[LAB CODE REPAIR] DEFAULT CODE HASH:", computeHash(repaired));
  }

  const final = repaired.endsWith("\n") ? repaired : `${repaired}\n`;
  console.log("[LAB CODE REPAIR] FINAL CODE:", final);
  console.log("[LAB CODE REPAIR] FINAL CODE HASH:", computeHash(final));
  console.log("[LAB CODE REPAIR] FINAL LENGTH:", final.length);
  return final;
}

/** Pick the best runnable source: canonical starter from step, or repaired cell/saved code. */
export function resolveNotebookCodeSource(
  canonicalStarter: string,
  cellSource: string,
  language: string
): string {
  const canonical = repairStarterCode(canonicalStarter, language);
  if (!cellSource?.trim() || isBrokenLabCode(cellSource)) {
    return canonical;
  }
  const repairedCell = repairStarterCode(cellSource, language);
  return isBrokenLabCode(repairedCell) ? canonical : repairedCell;
}
