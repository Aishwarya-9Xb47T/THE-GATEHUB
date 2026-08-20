import React, { useEffect, useMemo, useRef, useState } from "react";
import { fetchAuthenticatedUpload } from "@/lib/courseMediaUrls";
import {
  classroomOriginalPptxUrl,
  classroomSlideVisualUrls,
  googleSlidesEmbedUrl,
  googleSlidesPresentationId,
} from "@/lib/classroom/originalPresentationUrls";
import { isSvgMarkup } from "@/lib/classroom/classroomAssetUrls";

type PptxRendererHandle = {
  init: (wasmUrl?: string | ArrayBuffer) => Promise<void>;
  loadPptx: (buffer: ArrayBuffer) => Promise<{ slideCount: number }>;
  renderSlideSvg: (index: number) => string;
};

type CachedDeck = {
  cacheKey: string;
  renderer: PptxRendererHandle;
  slideCount: number;
  bytes: number;
};

const pptxDecks = new Map<string, Promise<CachedDeck>>();

export function clearClassroomPptxBufferCache(presentationId?: string) {
  if (!presentationId) {
    pptxDecks.clear();
    return;
  }
  for (const key of [...pptxDecks.keys()]) {
    if (key === presentationId || key.startsWith(`${presentationId}::`)) pptxDecks.delete(key);
  }
}

function deckCacheKey(presentationId: string, sourceUrl?: string | null): string {
  return `${presentationId}::${sourceUrl || "original"}`;
}

function viewLog(fields: Record<string, string | number | boolean | undefined>) {
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`);
  console.info(`[PRESENTATION_VIEW] ${parts.join(" ")}`);
}

function isPptxZip(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const header = new Uint8Array(buffer, 0, 2);
  return header[0] === 0x50 && header[1] === 0x4b;
}

function looksLikeHtmlOrJson(contentType: string | null, buffer?: ArrayBuffer): boolean {
  const type = (contentType || "").toLowerCase();
  if (type.includes("html") || type.includes("json") || type.includes("text/plain")) {
    if (!type.includes("presentationml") && !type.includes("pptx") && !type.includes("octet-stream") && !type.includes("zip") && !type.includes("svg") && !type.includes("png")) {
      return true;
    }
  }
  if (!buffer || buffer.byteLength < 8) return false;
  const prefix = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(16, buffer.byteLength))).trimStart().toLowerCase();
  return prefix.startsWith("<!doctype") || prefix.startsWith("<html") || prefix.startsWith("{") || prefix.startsWith("[");
}

async function initPptxRenderer(renderer: PptxRendererHandle): Promise<string> {
  const wasmMod = await import("pptx-svg/wasm?url");
  const wasmUrl = (wasmMod as { default: string }).default;
  try {
    const wasmResponse = await fetch(wasmUrl);
    if (wasmResponse.ok) {
      await renderer.init(await wasmResponse.arrayBuffer());
      return "vite_wasm";
    }
  } catch {
    // Tests and some hosts cannot fetch the Wasm URL; the renderer can still init from the URL.
  }
  await renderer.init(wasmUrl);
  return "url_wasm";
}

async function fetchOriginalPptxBuffer(presentationId: string, sourceType?: string, sourceUrl?: string | null): Promise<ArrayBuffer> {
  const assetPath = classroomOriginalPptxUrl(presentationId);
  const response = await fetchAuthenticatedUpload(assetPath);
  const contentType = response.headers?.get?.("content-type") || "";
  const contentLength = response.headers?.get?.("content-length") || "";
  viewLog({
    event: "pptx_fetch",
    presentationId,
    sourceType,
    sourceUrl: sourceUrl ? String(sourceUrl).split("?")[0] : undefined,
    assetUrl: assetPath,
    http: response.status,
    contentType,
    contentLength,
    ok: response.ok,
  });
  if (!response.ok) {
    throw new Error(`ORIGINAL_PPTX_UNAVAILABLE HTTP ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) {
    throw new Error("ORIGINAL_PPTX_INVALID_RESPONSE empty body");
  }
  if (looksLikeHtmlOrJson(contentType, buffer) && !isPptxZip(buffer)) {
    throw new Error("ORIGINAL_PPTX_INVALID_RESPONSE");
  }
  if (!isPptxZip(buffer)) {
    throw new Error("ORIGINAL_PPTX_INVALID not a PowerPoint ZIP");
  }
  viewLog({
    event: "pptx_binary_loaded",
    presentationId,
    bytes: buffer.byteLength,
  });
  return buffer;
}

async function loadOriginalPptxDeck(presentationId: string, sourceUrl?: string | null, sourceType?: string): Promise<CachedDeck> {
  const cacheKey = deckCacheKey(presentationId, sourceUrl);
  const existing = pptxDecks.get(cacheKey);
  if (existing) return existing;
  const pending = (async () => {
    const { PptxRenderer } = await import("pptx-svg");
    const renderer = new PptxRenderer({ logLevel: "warn" }) as PptxRendererHandle;
    const wasmMode = await initPptxRenderer(renderer);
    const buffer = await fetchOriginalPptxBuffer(presentationId, sourceType, sourceUrl);
    const loaded = await renderer.loadPptx(buffer);
    viewLog({
      event: "viewer_initialized",
      sourceType: sourceType || "pptx",
      presentationId,
      sourceAvailable: true,
      binaryLoaded: true,
      viewerInitialized: true,
      wasmMode,
      slideCount: loaded.slideCount,
    });
    return { cacheKey, renderer, slideCount: loaded.slideCount, bytes: buffer.byteLength };
  })();
  pptxDecks.set(cacheKey, pending);
  try {
    return await pending;
  } catch (error) {
    pptxDecks.delete(cacheKey);
    throw error;
  }
}

async function fetchSlideVisualMarkup(presentationId: string, slideNumber: number): Promise<string> {
  const urls = classroomSlideVisualUrls(presentationId, slideNumber);
  let lastError = "ORIGINAL_PPTX_UNAVAILABLE";
  for (const url of urls) {
    try {
      const response = await fetchAuthenticatedUpload(url);
      const contentType = response.headers?.get?.("content-type") || "";
      viewLog({
        event: "visual_cache_fetch",
        presentationId,
        slide: slideNumber,
        assetUrl: url,
        http: response.status,
        contentType,
      });
      if (!response.ok) {
        lastError = `ORIGINAL_PPTX_UNAVAILABLE HTTP ${response.status}`;
        continue;
      }
      const buffer = await response.arrayBuffer();
      if (!buffer.byteLength || looksLikeHtmlOrJson(contentType, buffer)) {
        lastError = "ORIGINAL_PPTX_INVALID_RESPONSE";
        continue;
      }
      if (contentType.includes("png") || (buffer.byteLength > 8 && new Uint8Array(buffer)[0] === 0x89)) {
        const blob = new Blob([buffer], { type: "image/png" });
        return URL.createObjectURL(blob);
      }
      const text = new TextDecoder().decode(buffer);
      if (isSvgMarkup(text)) return text;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(lastError);
}

export function OriginalPresentationViewer({
  presentationId,
  slideNumber,
  sourceType,
  sourceUrl,
  googleSlidesId,
  visualSource,
  className = "",
}: {
  presentationId?: string;
  slideNumber: number;
  sourceType?: string;
  sourceUrl?: string;
  googleSlidesId?: string;
  visualSource?: string;
  className?: string;
}) {
  const slideIndex = Math.max(0, slideNumber - 1);
  const googleId = googleSlidesId || googleSlidesPresentationId(sourceUrl);
  const useGoogle = Boolean(googleId)
    && visualSource !== "original_pptx"
    && (visualSource === "google_embed" || sourceType === "google_slides");
  const embedSrc = useGoogle && googleId ? googleSlidesEmbedUrl(googleId, slideNumber) : null;
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [rasterUrl, setRasterUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!useGoogle && !svgMarkup);
  const [googleFailed, setGoogleFailed] = useState(false);
  const requestId = useRef(0);
  const rasterRef = useRef<string | null>(null);

  useEffect(() => {
    setSvgMarkup(null);
    setRasterUrl(null);
    setError(null);
    setGoogleFailed(false);
    if (rasterRef.current) {
      URL.revokeObjectURL(rasterRef.current);
      rasterRef.current = null;
    }
  }, [presentationId]);

  useEffect(() => {
    if (embedSrc && !googleFailed) {
      viewLog({
        event: "google_embed",
        sourceType: "google_slides",
        sourceAvailable: true,
        presentationId,
        slide: slideNumber,
        viewerInitialized: true,
      });
    }
  }, [embedSrc, presentationId, slideNumber, googleFailed]);

  useEffect(() => {
    return () => {
      if (rasterRef.current) URL.revokeObjectURL(rasterRef.current);
    };
  }, []);

  useEffect(() => {
    const skipPptx = Boolean(embedSrc) && !googleFailed;
    if (skipPptx || !presentationId) {
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    const alreadyShowing = Boolean(svgMarkup || rasterUrl);
    if (!alreadyShowing) setLoading(true);
    setError(null);
    void (async () => {
      try {
        const deck = await loadOriginalPptxDeck(presentationId, sourceUrl, sourceType);
        if (id !== requestId.current) return;
        const svg = deck.renderer.renderSlideSvg(slideIndex);
        if (!svg || svg.startsWith("ERROR:")) {
          throw new Error(svg || "ORIGINAL_PPTX_SLIDE_RENDER_FAILED");
        }
        setSvgMarkup(svg);
        setRasterUrl(null);
        setLoading(false);
        viewLog({
          event: "slide_displayed",
          sourceType: sourceType || "pptx",
          presentationId,
          slide: slideNumber,
          slideCount: deck.slideCount,
          svgChars: svg.length,
        });
      } catch (pptxError) {
        const pptxMessage = pptxError instanceof Error ? pptxError.message : String(pptxError);
        viewLog({
          event: "pptx_failed_trying_visual",
          presentationId,
          slide: slideNumber,
          error: pptxMessage.slice(0, 180),
        });
        try {
          const visual = await fetchSlideVisualMarkup(presentationId, slideNumber);
          if (id !== requestId.current) return;
          if (visual.startsWith("blob:")) {
            if (rasterRef.current) URL.revokeObjectURL(rasterRef.current);
            rasterRef.current = visual;
            setRasterUrl(visual);
            setSvgMarkup(null);
          } else {
            setSvgMarkup(visual);
            setRasterUrl(null);
          }
          setLoading(false);
          setError(null);
          viewLog({
            event: "slide_displayed",
            sourceType: "visual_cache",
            presentationId,
            slide: slideNumber,
          });
        } catch (visualError) {
          if (id !== requestId.current) return;
          const message = visualError instanceof Error ? visualError.message : pptxMessage;
          viewLog({
            event: "viewer_failed",
            sourceType: sourceType || "pptx",
            presentationId,
            slide: slideNumber,
            error: message.slice(0, 180),
          });
          setError(useGoogle ? "GOOGLE_SLIDES_NOT_ACCESSIBLE" : message);
          setLoading(false);
        }
      }
    })();
  }, [presentationId, slideIndex, slideNumber, embedSrc, googleFailed, sourceUrl, sourceType]);

  const svgHtml = useMemo(() => svgMarkup, [svgMarkup]);

  if (embedSrc && !googleFailed) {
    return (
      <div
        className={className}
        style={{ width: "100%", height: "100%", background: "#000", overflow: "hidden" }}
      >
        <iframe
          key={embedSrc}
          data-testid="classroom-google-embed"
          title={`Google Slides ${slideNumber}`}
          src={embedSrc}
          style={{ width: "100%", height: "100%", border: 0, background: "#000" }}
          allow="fullscreen"
          allowFullScreen
          onLoad={() => viewLog({ event: "google_iframe_load", presentationId, slide: slideNumber })}
          onError={() => {
            viewLog({ event: "google_iframe_error", presentationId, slide: slideNumber });
            setGoogleFailed(true);
          }}
        />
      </div>
    );
  }

  if (loading && !svgHtml && !rasterUrl) {
    return (
      <div
        data-testid="classroom-original-loading"
        style={{
          width: "100%",
          height: "100%",
          display: "grid",
          placeItems: "center",
          background: "#0f172a",
          color: "#e2e8f0",
        }}
      >
        Loading presentation...
      </div>
    );
  }

  if (error && !svgHtml && !rasterUrl) {
    return (
      <div
        data-testid="classroom-visual-error"
        style={{
          width: "100%",
          height: "100%",
          display: "grid",
          placeItems: "center",
          padding: 32,
          background: "#0f172a",
          color: "#e2e8f0",
          textAlign: "center",
        }}
      >
        <div>
          <p style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>Unable to load original presentation</p>
          <p style={{ fontSize: 14, color: "#94a3b8" }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="classroom-original-pptx"
      className={className}
      style={{
        width: "100%",
        height: "100%",
        background: "#000",
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
      }}
    >
      <style>{`
        [data-testid="classroom-original-pptx"] svg,
        [data-testid="classroom-original-pptx"] img {
          width: 100%;
          height: 100%;
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          display: block;
        }
      `}</style>
      {rasterUrl ? (
        <img src={rasterUrl} alt="" style={{ objectFit: "contain" }} />
      ) : svgHtml ? (
        <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: svgHtml }} />
      ) : null}
    </div>
  );
}
