export type GoogleSlidesProbeResult = {
  accessible: boolean;
  requiresAuthentication: boolean;
  slideCount?: number;
  error?: string;
};

const PROBE_TIMEOUT_MS = 12_000;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export function parseGoogleSlidesProbeHtml(html: string, finalUrl = ""): GoogleSlidesProbeResult {
  const text = String(html || "");
  const url = String(finalUrl || "").toLowerCase();

  const redirectedToLogin = url.includes("accounts.google.com") || url.includes("servicelogin");
  if (redirectedToLogin) {
    return {
      accessible: false,
      requiresAuthentication: true,
      error: "GOOGLE_SLIDES_PERMISSION_REQUIRED",
    };
  }

  const permissionPage = /you need permission|request access|this presentation is not available|sign in to continue/i.test(text)
    && !/punch-viewer|docs-texteventtarget-iframe|html-slide-content|embed-container/i.test(text);
  if (permissionPage) {
    return {
      accessible: false,
      requiresAuthentication: true,
      error: "GOOGLE_SLIDES_PERMISSION_REQUIRED",
    };
  }

  if (/<title>\s*error\s+404/i.test(text) || /item not found|presentation not found/i.test(text)) {
    return {
      accessible: false,
      requiresAuthentication: false,
      error: "GOOGLE_SLIDES_NOT_ACCESSIBLE",
    };
  }

  const counts: number[] = [];
  const patterns = [
    /"slideCount"\s*:\s*(\d+)/,
    /slideCount["']?\s*[:=]\s*(\d+)/,
    /"nSlides"\s*:\s*(\d+)/,
    /"slidesCount"\s*:\s*(\d+)/,
    /data-slides-count=["'](\d+)["']/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) counts.push(Number(match[1]));
  }

  const embedSlides = [...text.matchAll(/[?&]slide=(\d+)/g)].map((match) => Number(match[1]));
  if (embedSlides.length) counts.push(Math.max(...embedSlides));

  const viewerChunk = text.match(/var viewerData = \{[\s\S]{0,250000}/)?.[0] || "";
  const googleSlideIndexes = [...viewerChunk.matchAll(/\["g[a-zA-Z0-9_]+",(\d+),"/g)].map((match) => Number(match[1]));
  if (googleSlideIndexes.length) {
    const max = Math.max(...googleSlideIndexes);
    const min = Math.min(...googleSlideIndexes);
    counts.push(min === 0 ? max + 1 : max);
  }

  const slideMarkers = text.match(/docs-slide|punch-filmstrip-thumbnail|slide-thumb/gi);
  if (slideMarkers && slideMarkers.length >= 1 && slideMarkers.length <= 400) {
    counts.push(slideMarkers.length);
  }

  const usable = counts.filter((n) => Number.isFinite(n) && n >= 1 && n <= 500);
  const slideCount = usable.length ? Math.max(...usable) : undefined;
  return {
    accessible: true,
    requiresAuthentication: false,
    slideCount,
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
  const urls = [
    `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false&delayms=600000&rm=minimal&slide=1`,
    `https://docs.google.com/presentation/d/${id}/preview`,
  ];

  let last: GoogleSlidesProbeResult = {
    accessible: false,
    requiresAuthentication: false,
    error: "GOOGLE_SLIDES_NOT_ACCESSIBLE",
  };

  for (const url of urls) {
    try {
      const fetched = await fetchProbe(url);
      if (fetched.status === 404) {
        last = {
          accessible: false,
          requiresAuthentication: false,
          error: "GOOGLE_SLIDES_NOT_ACCESSIBLE",
        };
        continue;
      }
      if (fetched.status === 401 || fetched.status === 403) {
        return {
          accessible: false,
          requiresAuthentication: true,
          error: "GOOGLE_SLIDES_PERMISSION_REQUIRED",
        };
      }
      const parsed = parseGoogleSlidesProbeHtml(fetched.html, fetched.finalUrl);
      if (parsed.requiresAuthentication) return parsed;
      if (parsed.accessible) return parsed;
      last = parsed;
    } catch (error) {
      last = {
        accessible: false,
        requiresAuthentication: false,
        error: error instanceof Error && /abort/i.test(error.message)
          ? "GOOGLE_SLIDES_NOT_ACCESSIBLE"
          : "GOOGLE_SLIDES_NOT_ACCESSIBLE",
      };
    }
  }

  return last;
}
