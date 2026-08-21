export type GoogleSlidesProbeResult = {
  accessible: boolean;
  requiresAuthentication: boolean;
  slideCount?: number;
  error?: string;
  countSource?: "viewerData" | "slideCount";
};

const PROBE_TIMEOUT_MS = 12_000;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const GOOGLE_SLIDE_ENTRY =
  /\["(p|g[0-9a-fA-F]+(?:_[0-9]+)+)",(\d+),"/g;

export function parseReliableGoogleSlideCount(html: string): { slideCount: number; source: "viewerData" | "slideCount" } | undefined {
  const text = String(html || "");
  const explicit = text.match(/"slideCount"\s*:\s*(\d+)/);
  if (explicit) {
    const n = Number(explicit[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 500) {
      return { slideCount: n, source: "slideCount" };
    }
  }

  const viewer = text.match(/var viewerData = \{[\s\S]{0,500000}/)?.[0] || text;
  const indexes = [...viewer.matchAll(GOOGLE_SLIDE_ENTRY)]
    .map((match) => Number(match[2]))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 500);
  if (!indexes.length) return undefined;

  const unique = [...new Set(indexes)].sort((a, b) => a - b);
  const min = unique[0];
  const max = unique[unique.length - 1];
  if (min === 0 && unique.length === max + 1) {
    return { slideCount: unique.length, source: "viewerData" };
  }
  if (min === 1 && unique.length === max) {
    return { slideCount: unique.length, source: "viewerData" };
  }
  if (unique.length >= 1 && unique.length <= 500) {
    return { slideCount: unique.length, source: "viewerData" };
  }
  return undefined;
}

function hasLiveViewer(html: string, expectedId?: string): boolean {
  const text = String(html || "");
  if (!/var viewerData\s*=\s*\{/.test(text) || !/docData\s*:/.test(text)) return false;
  if (!expectedId) return /docId\s*:/.test(text);
  return text.includes(expectedId);
}

export function parseGoogleSlidesProbeHtml(
  html: string,
  finalUrl = "",
  expectedId?: string,
): GoogleSlidesProbeResult {
  const text = String(html || "");
  const url = String(finalUrl || "").toLowerCase();

  if (url.includes("accounts.google.com") || url.includes("servicelogin")) {
    return {
      accessible: false,
      requiresAuthentication: true,
      error: "GOOGLE_SLIDES_PERMISSION_REQUIRED",
    };
  }

  const liveViewer = hasLiveViewer(text, expectedId);
  const counted = parseReliableGoogleSlideCount(text);

  if (liveViewer) {
    return {
      accessible: true,
      requiresAuthentication: false,
      slideCount: counted?.slideCount,
      countSource: counted?.source,
    };
  }

  if (
    /<title>\s*(page not found|error\s+404)/i.test(text)
    || /item not found|presentation not found/i.test(text)
  ) {
    return {
      accessible: false,
      requiresAuthentication: false,
      error: "GOOGLE_SLIDES_NOT_ACCESSIBLE",
    };
  }

  if (/you need permission|request access|sign in to continue|this presentation is not available/i.test(text)) {
    return {
      accessible: false,
      requiresAuthentication: true,
      error: "GOOGLE_SLIDES_PERMISSION_REQUIRED",
    };
  }

  return {
    accessible: false,
    requiresAuthentication: false,
    error: "GOOGLE_SLIDES_NOT_ACCESSIBLE",
  };
}

async function fetchProbe(url: string): Promise<{ status: number; finalUrl: string; html: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": BROWSER_UA },
      redirect: "follow",
      signal: controller.signal,
    });
    const html = await response.text();
    return { status: response.status, finalUrl: response.url || url, html };
  } finally {
    clearTimeout(timer);
  }
}

export async function probePublicGoogleSlides(presentationId: string): Promise<GoogleSlidesProbeResult> {
  const id = encodeURIComponent(presentationId);
  const embedUrl = `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false&delayms=3000000`;

  try {
    const fetched = await fetchProbe(embedUrl);
    if (fetched.status === 404) {
      return {
        accessible: false,
        requiresAuthentication: false,
        error: "GOOGLE_SLIDES_NOT_ACCESSIBLE",
      };
    }
    if (fetched.status === 401 || fetched.status === 403) {
      return {
        accessible: false,
        requiresAuthentication: true,
        error: "GOOGLE_SLIDES_PERMISSION_REQUIRED",
      };
    }
    const parsed = parseGoogleSlidesProbeHtml(fetched.html, fetched.finalUrl, presentationId);
    if (parsed.accessible && !parsed.slideCount) {
      try {
        const preview = await fetchProbe(`https://docs.google.com/presentation/d/${id}/preview`);
        const previewParsed = parseGoogleSlidesProbeHtml(preview.html, preview.finalUrl, presentationId);
        if (previewParsed.slideCount) {
          return {
            ...parsed,
            slideCount: previewParsed.slideCount,
            countSource: previewParsed.countSource,
          };
        }
      } catch {
        // Count remains unknown; import may use PPTX ZIP inspect as a last resort.
      }
    }
    return parsed;
  } catch (error) {
    return {
      accessible: false,
      requiresAuthentication: false,
      error: error instanceof Error && /abort/i.test(error.message)
        ? "GOOGLE_SLIDES_NOT_ACCESSIBLE"
        : "GOOGLE_SLIDES_NOT_ACCESSIBLE",
    };
  }
}
