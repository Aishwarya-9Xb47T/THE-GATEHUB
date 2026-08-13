/**
 * Google Colab URL validation for Learning Universe projects.
 * Accepts only Drive notebook links and GitHub .ipynb Colab links.
 */

export const COLAB_PLACEHOLDER_TOKENS = new Set([
  "1example",
  "example",
  "test",
  "dummy",
  "abc",
  "your-notebook-id",
  "your_notebook_id",
  "placeholder",
  "sample",
  "fake",
  "todo",
  "xxx",
  "123",
  "12345",
]);

const DRIVE_URL =
  /^https:\/\/colab\.research\.google\.com\/drive\/([a-zA-Z0-9_-]+)\/?(?:[?#].*)?$/i;
const GITHUB_URL =
  /^https:\/\/colab\.research\.google\.com\/github\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+\.ipynb)\/?(?:[?#].*)?$/i;

export type ColabUrlKind = "drive" | "github";

export interface ColabUrlValidation {
  valid: boolean;
  error?: string;
  kind?: ColabUrlKind;
  notebookId?: string;
  normalizedUrl?: string;
}

function isPlaceholderToken(value: string): boolean {
  const lower = value.toLowerCase().trim();
  if (!lower) return true;
  if (COLAB_PLACEHOLDER_TOKENS.has(lower)) return true;
  if (/^(example|test|dummy|placeholder|sample|fake|todo)/i.test(lower)) return true;
  if (/example|dummy|placeholder|sample|fake/i.test(lower)) return true;
  return false;
}

/** Google Drive notebook IDs are typically 25+ characters. */
function isValidDriveNotebookId(id: string): boolean {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return false;
  if (isPlaceholderToken(id)) return false;
  if (id.length < 20) return false;
  return true;
}

export function validateColabUrl(rawUrl: string | null | undefined): ColabUrlValidation {
  const url = (rawUrl || "").trim();
  if (!url) {
    return { valid: false, error: "URL is required" };
  }

  if (!url.startsWith("https://colab.research.google.com/")) {
    return { valid: false, error: "Invalid Google Colab notebook URL" };
  }

  const driveMatch = url.match(DRIVE_URL);
  if (driveMatch) {
    const notebookId = driveMatch[1];
    if (!isValidDriveNotebookId(notebookId)) {
      return { valid: false, error: "Invalid Google Colab notebook URL" };
    }
    return {
      valid: true,
      kind: "drive",
      notebookId,
      normalizedUrl: `https://colab.research.google.com/drive/${notebookId}`,
    };
  }

  const githubMatch = url.match(GITHUB_URL);
  if (githubMatch) {
    const [, owner, repo, branch, notebookPath] = githubMatch;
    if (isPlaceholderToken(owner) || isPlaceholderToken(repo)) {
      return { valid: false, error: "Invalid Google Colab notebook URL" };
    }
    const notebookBase = notebookPath.split("/").pop()?.replace(/\.ipynb$/i, "") || "";
    if (isPlaceholderToken(notebookBase)) {
      return { valid: false, error: "Invalid Google Colab notebook URL" };
    }
    const normalizedUrl = `https://colab.research.google.com/github/${owner}/${repo}/blob/${branch}/${notebookPath}`;
    return {
      valid: true,
      kind: "github",
      notebookId: `${owner}/${repo}/${notebookPath}`,
      normalizedUrl,
    };
  }

  return { valid: false, error: "Invalid Google Colab notebook URL" };
}

/** Extract Colab URLs from DSL source for publish-time validation. */
export function extractColabUrlsFromDsl(latex: string): Array<{ url: string; line: number }> {
  const results: Array<{ url: string; line: number }> = [];
  const patterns = [
    /colab\s*=\s*\{([^{}]+)\}/gi,
    /colaburl\s*=\s*\{([^{}]+)\}/gi,
    /\\colab\s*\{[^}]*url\s*=\s*\{([^{}]+)\}/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    const re = new RegExp(pattern.source, pattern.flags);
    while ((match = re.exec(latex)) !== null) {
      const url = match[1].trim();
      const line = latex.slice(0, match.index).split(/\r?\n/).length;
      if (url && !results.some((r) => r.url === url)) {
        results.push({ url, line });
      }
    }
  }

  return results;
}

export function validateColabUrlsInDsl(latex: string): ColabUrlValidation & { line?: number } {
  const urls = extractColabUrlsFromDsl(latex);
  for (const { url, line } of urls) {
    const result = validateColabUrl(url);
    if (!result.valid) {
      return { ...result, line };
    }
  }
  return { valid: true };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip invalid Colab URLs from LaTeX so publish is not blocked by AI placeholders. */
export function sanitizeColabUrlsInDsl(latex: string): { latex: string; strippedCount: number } {
  const urls = extractColabUrlsFromDsl(latex);
  let result = latex;
  let strippedCount = 0;

  for (const { url } of urls) {
    const check = validateColabUrl(url);
    if (check.valid) continue;
    strippedCount++;
    const escaped = escapeRegExp(url);
    result = result
      .replace(new RegExp(`colaburl\\s*=\\s*\\{${escaped}\\}\\s*,?`, "gi"), "")
      .replace(new RegExp(`,?\\s*colaburl\\s*=\\s*\\{${escaped}\\}`, "gi"), "")
      .replace(new RegExp(`colab\\s*=\\s*\\{${escaped}\\}\\s*,?`, "gi"), "")
      .replace(new RegExp(`,?\\s*colab\\s*=\\s*\\{${escaped}\\}`, "gi"), "")
      .replace(
        new RegExp(`\\\\colab\\s*\\{[^}]*url\\s*=\\s*\\{${escaped}\\}[^}]*\\}`, "gi"),
        ""
      );
  }

  return { latex: result, strippedCount };
}
