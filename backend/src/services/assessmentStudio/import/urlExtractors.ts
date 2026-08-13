import { ImportError } from "./importErrors.js";
import { extractYouTubeId } from "../../../utils/videoSourceUtils.js";
import { getGoogleAccessToken, isGoogleOAuthConfigured } from "../../integrations/googleOAuthService.js";

const GOOGLE_FORMS_API = "https://forms.googleapis.com/v1/forms";

export function extractGoogleFormId(url: string): string | null {
  const patterns = [
    /\/forms\/d\/e\/([a-zA-Z0-9_-]+)/,
    /\/forms\/d\/([a-zA-Z0-9_-]+)/,
    /\/forms\/u\/\d+\/d\/([a-zA-Z0-9_-]+)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

async function fetchGoogleFormViaApi(formId: string, accessToken: string): Promise<string> {
  const res = await fetch(`${GOOGLE_FORMS_API}/${formId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new ImportError(
        res.status,
        "GOOGLE_FORM_AUTH_REQUIRED",
        "This Google Form requires authentication.",
        "Connect your Google account, or publish the form to anyone with the link.",
        true
      );
    }
    if (res.status === 404) {
      throw new ImportError(404, "GOOGLE_FORM_INVALID_URL", "Google Form not found.", "Check the URL and that the form still exists.", true);
    }
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new ImportError(422, "GOOGLE_FORM_BLOCKED", err.error?.message || "Could not access this Google Form via API.", "Try connecting Google or use a public view link.", true);
  }
  const data = (await res.json()) as {
    info?: { title?: string; description?: string };
    items?: Array<{
      title?: string;
      description?: string;
      questionItem?: {
        question?: {
          required?: boolean;
          grading?: { pointValue?: number; correctAnswers?: { answers?: Array<{ value?: string }> } };
          choiceQuestion?: {
            type?: string;
            options?: Array<{ value?: string }>;
          };
          textQuestion?: { paragraph?: boolean };
        };
      };
      questionGroupItem?: { questions?: unknown[] };
      pageBreakItem?: { title?: string };
    }>;
  };

  const lines: string[] = [];
  if (data.info?.title) lines.push(`Form: ${data.info.title}`);
  if (data.info?.description) lines.push(data.info.description);

  for (const item of data.items || []) {
    if (item.pageBreakItem?.title) {
      lines.push(`\n## Section: ${item.pageBreakItem.title}`);
      continue;
    }
    const q = item.questionItem?.question;
    if (!q) continue;
    const title = item.title || "Untitled question";
    lines.push(`\nQuestion: ${title}`);
    if (item.description) lines.push(`Description: ${item.description}`);
    if (q.required) lines.push("Required: yes");

    const choices = q.choiceQuestion?.options?.map((o) => o.value).filter(Boolean) || [];
    if (choices.length) {
      lines.push(`Options: ${choices.join(" | ")}`);
      const correct = q.grading?.correctAnswers?.answers?.map((a) => a.value).filter(Boolean) || [];
      if (correct.length) lines.push(`Correct: ${correct.join(", ")}`);
    } else if (q.textQuestion) {
      lines.push(`Type: ${q.textQuestion.paragraph ? "paragraph" : "short answer"}`);
    }
  }

  const text = lines.join("\n").trim();
  if (!text) throw new ImportError(422, "GOOGLE_FORM_EMPTY", "Google Form has no extractable questions.", "Add questions to the form or check permissions.", true);
  return text;
}

async function fetchGoogleFormPublicHtml(formId: string): Promise<string> {
  const urls = [
    `https://docs.google.com/forms/d/e/${formId}/viewform`,
    `https://docs.google.com/forms/d/${formId}/viewform`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; GateHubImport/1.0)" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const html = await res.text();

      const fbMatch = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[.*?\]);/s);
      if (fbMatch?.[1]) {
        return parseFbPublicLoadData(fbMatch[1]);
      }

      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      const textBlocks = [...html.matchAll(/<div[^>]*class="[^"]*freebirdFormviewerViewItemsItemItemTitle[^"]*"[^>]*>([^<]+)</gi)]
        .map((m) => m[1]?.trim())
        .filter(Boolean);

      if (textBlocks.length) {
        return [`Form: ${titleMatch?.[1] || "Google Form"}`, ...textBlocks.map((t, i) => `Question ${i + 1}: ${t}`)].join("\n");
      }
    } catch {
      /* try next url */
    }
  }

  throw new ImportError(
    422,
    "GOOGLE_FORM_PRIVATE",
    "Could not read this Google Form anonymously.",
    isGoogleOAuthConfigured()
      ? "Connect your Google account using the button below, then retry."
      : "Publish the form to anyone with the link, or ask your admin to enable Google OAuth.",
    true
  );
}

function parseFbPublicLoadData(raw: string): string {
  try {
    const data = JSON.parse(raw) as unknown[];
    const formInfo = data[1] as [unknown, string, string] | undefined;
    const items = data[1]?.[1] as unknown;
    const lines: string[] = [];
    if (Array.isArray(formInfo) && typeof formInfo[8] === "string") {
      lines.push(`Form: ${formInfo[8]}`);
    }

    const walk = (node: unknown, depth = 0): void => {
      if (!Array.isArray(node)) return;
      if (depth > 12) return;
      for (const entry of node) {
        if (typeof entry === "string" && entry.length > 3 && entry.length < 500) {
          if (/^[A-Z]/.test(entry) || entry.includes("?")) {
            lines.push(`Question: ${entry}`);
          }
        }
        if (Array.isArray(entry)) walk(entry, depth + 1);
      }
    };
    walk(items);

    const text = [...new Set(lines)].join("\n").trim();
    if (text.length > 20) return text;
  } catch {
    /* fall through */
  }
  throw new ImportError(422, "GOOGLE_FORM_BLOCKED", "Could not parse Google Form structure.", "Google may have changed their format ΓÇö connect Google account for API access.", true);
}

export async function extractGoogleFormContent(url: string, userId?: string): Promise<string> {
  const formId = extractGoogleFormId(url);
  if (!formId) {
    throw new ImportError(
      400,
      "GOOGLE_FORM_INVALID_URL",
      "Invalid Google Forms URL.",
      "Use a link like https://docs.google.com/forms/d/e/ΓÇª/viewform or /d/ΓÇª/edit",
      false
    );
  }

  let apiFailedAuth = false;

  if (userId) {
    const token = await getGoogleAccessToken(userId);
    if (token) {
      try {
        return await fetchGoogleFormViaApi(formId, token);
      } catch (err) {
        if (err instanceof ImportError && (err.code === "GOOGLE_FORM_AUTH_REQUIRED" || err.statusCode === 401 || err.statusCode === 403)) {
          apiFailedAuth = true;
        } else if (err instanceof ImportError) {
          throw err;
        } else {
          throw err;
        }
      }
    }
  }

  try {
    return await fetchGoogleFormPublicHtml(formId);
  } catch (err) {
    if (err instanceof ImportError && err.code === "GOOGLE_FORM_PRIVATE") {
      if (apiFailedAuth || !userId) {
        throw new ImportError(
          403,
          "GOOGLE_FORM_PRIVATE",
          "This Google Form is private.",
          isGoogleOAuthConfigured()
            ? "Connect your Google account and ensure you own or can edit this form."
            : "Publish the form to the web or enable Google OAuth on this server.",
          true
        );
      }
    }
    throw err;
  }
}

export async function extractYouTubeTranscript(url: string): Promise<string> {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new ImportError(400, "URL_INVALID", "Invalid YouTube URL.", "Paste a youtube.com or youtu.be link.", false);

  const oembedRes = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    { signal: AbortSignal.timeout(10000) }
  );
  let title = "YouTube Video";
  if (oembedRes.ok) {
    const meta = (await oembedRes.json()) as { title?: string };
    title = meta.title || title;
  }

  const transcriptUrls = [
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en-US`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en-GB`,
  ];

  for (const tUrl of transcriptUrls) {
    try {
      const res = await fetch(tUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const xml = await res.text();
      const segments = [...xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
        .map((m) =>
          m[1]
            ?.replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .trim()
        )
        .filter(Boolean);
      if (segments.length) {
        return `Video: ${title}\nURL: ${url}\n\nTranscript:\n${segments.join(" ")}`;
      }
    } catch {
      /* next */
    }
  }

  return `Video: ${title}\nURL: ${url}\n\n(No captions available ΓÇö AI will use title and metadata only. For better results, use a video with captions enabled.)`;
}

export async function extractWebsiteContent(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ImportError(400, "URL_INVALID", "Invalid website URL.", "Use a full https:// link.", false);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ImportError(400, "URL_INVALID", "Only HTTP/HTTPS URLs are supported.", "Use https://ΓÇª", false);
  }

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; GateHubImport/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new ImportError(res.status, "URL_FETCH_FAILED", `Could not fetch website (${res.status}).`, "Check the URL is public and try again.", true);
  }

  const html = await res.text();
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || parsed.hostname;

  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const content = stripped.slice(0, 12000);
  if (content.length < 100) {
    throw new ImportError(422, "WEBSITE_NO_CONTENT", "Could not extract readable content from this webpage.", "The page may require login or JavaScript ΓÇö try exporting as PDF or paste text.", true);
  }

  return `Page: ${title}\nURL: ${url}\n\nContent:\n${content}`;
}
