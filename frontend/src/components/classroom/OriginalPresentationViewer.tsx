import React, { useEffect, useMemo, useRef, useState } from "react";
import { fetchAuthenticatedUpload } from "@/lib/courseMediaUrls";
import {
  classroomOriginalPptxUrl,
  classroomSlideVisualUrls,
  buildGoogleSlidesEmbedUrl,
  googleSlidesPresentationId,
  shouldUseGoogleSlidesEmbed,
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

export type PreparedSlide = {
  markup: string;
  width: number;
  height: number;
  aspectRatio: number;
};

function parsePositiveNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function fitSlideToStage(
  stageWidth: number,
  stageHeight: number,
  slideAspect: number,
): { width: number; height: number; offsetX: number; offsetY: number } {
  const aspect = slideAspect > 0 ? slideAspect : 16 / 9;
  const availW = Math.max(1, stageWidth);
  const availH = Math.max(1, stageHeight);
  const stageAspect = availW / availH;
  let width: number;
  let height: number;
  if (stageAspect > aspect) {
    height = availH;
    width = height * aspect;
  } else {
    width = availW;
    height = width / aspect;
  }
  const floorW = Math.max(1, Math.floor(width));
  const floorH = Math.max(1, Math.floor(height));
  return {
    width: floorW,
    height: floorH,
    offsetX: Math.floor((availW - floorW) / 2),
    offsetY: Math.floor((availH - floorH) / 2),
  };
}

export function prepareSlideSvg(svgStr: string): PreparedSlide {
  if (!svgStr) return { markup: "", width: 960, height: 540, aspectRatio: 16 / 9 };

  const viewBoxMatch = svgStr.match(/<svg[^>]*\bviewBox=["']?([0-9.\s,-]+)["']/i);
  const widthMatch = svgStr.match(/<svg[^>]*\bwidth=["']?([0-9.]+)/i);
  const heightMatch = svgStr.match(/<svg[^>]*\bheight=["']?([0-9.]+)/i);
  const scaleMatch = svgStr.match(/data-ooxml-scale=["']?([0-9.]+)/i);
  const cxMatch = svgStr.match(/data-ooxml-slide-cx=["']?([0-9.]+)/i);
  const cyMatch = svgStr.match(/data-ooxml-slide-cy=["']?([0-9.]+)/i);

  let w = 960;
  let h = 540;

  // pptx-svg draws in CSS-pixel user units. Those units are the SVG width/height
  // attributes (typically 960×540), NOT EMU and not EMU/9525 when a different scale was used.
  const attrW = parsePositiveNumber(widthMatch?.[1]);
  const attrH = parsePositiveNumber(heightMatch?.[1]);
  if (attrW && attrH) {
    w = attrW;
    h = attrH;
  }

  if (viewBoxMatch?.[1]) {
    const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      w = parts[2];
      h = parts[3];
    }
  } else if (!attrW || !attrH) {
    const cx = parsePositiveNumber(cxMatch?.[1]);
    const cy = parsePositiveNumber(cyMatch?.[1]);
    const scale = parsePositiveNumber(scaleMatch?.[1]) || 9525;
    if (cx && cy) {
      w = cx / scale;
      h = cy / scale;
    }
  }

  const modifiedSvg = svgStr.replace(/<svg\b([^>]*)>/i, (_full, attrs: string) => {
    let cleanAttrs = attrs
      .replace(/\s+\bwidth=["'][^"']*["']/gi, "")
      .replace(/\s+\bheight=["'][^"']*["']/gi, "");
    if (!viewBoxMatch) {
      cleanAttrs = ` viewBox="0 0 ${w} ${h}"${cleanAttrs}`;
    }
    if (!/preserveAspectRatio=/i.test(cleanAttrs)) {
      cleanAttrs = ` preserveAspectRatio="xMidYMid meet"${cleanAttrs}`;
    }
    const fillStyle = "position:absolute;inset:0;width:100%;height:100%;display:block;max-width:none;max-height:none";
    if (/style=["']/i.test(cleanAttrs)) {
      cleanAttrs = cleanAttrs.replace(/style=["']([^"']*)["']/i, (_m, existing) => {
        const withoutSizing = String(existing)
          .replace(/(?:^|;)\s*(?:width|height|max-width|max-height)\s*:[^;]*/gi, "")
          .replace(/^;+|;+$/g, "");
        return `style="${withoutSizing ? `${withoutSizing};` : ""}${fillStyle}"`;
      });
    } else {
      cleanAttrs = ` style="${fillStyle}"${cleanAttrs}`;
    }
    return `<svg${cleanAttrs}>`;
  });

  return {
    markup: modifiedSvg,
    width: w,
    height: h,
    aspectRatio: w / h,
  };
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
  const useGoogle = shouldUseGoogleSlidesEmbed({
    sourceType,
    visualSource,
    googleSlidesId: googleId,
    sourceUrl,
  });
  const embedSrc = useGoogle && googleId ? buildGoogleSlidesEmbedUrl(googleId, slideNumber) : null;
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [rasterUrl, setRasterUrl] = useState<string | null>(null);
  const [rasterDimensions, setRasterDimensions] = useState<{ width: number; height: number } | null>(null);
  const [stageDimensions, setStageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!useGoogle && !svgMarkup);
  const requestId = useRef(0);
  const rasterRef = useRef<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSvgMarkup(null);
    setRasterUrl(null);
    setRasterDimensions(null);
    setError(null);
    if (rasterRef.current) {
      URL.revokeObjectURL(rasterRef.current);
      rasterRef.current = null;
    }
  }, [presentationId]);

  useEffect(() => {
    if (embedSrc) {
      viewLog({
        event: "google_embed",
        sourceType: "google_slides",
        sourceAvailable: true,
        presentationId,
        slide: slideNumber,
        viewerInitialized: true,
      });
    }
  }, [embedSrc, presentationId, slideNumber]);

  useEffect(() => {
    return () => {
      if (rasterRef.current) URL.revokeObjectURL(rasterRef.current);
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updateStage = () => {
      if (!stageRef.current) return;
      const { clientWidth, clientHeight } = stageRef.current;
      if (clientWidth > 0 && clientHeight > 0) {
        setStageDimensions((prev) => {
          if (prev && prev.width === clientWidth && prev.height === clientHeight) return prev;
          return { width: clientWidth, height: clientHeight };
        });
      }
    };

    updateStage();
    const ro = new ResizeObserver(updateStage);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [svgMarkup, rasterUrl, embedSrc, loading, error]);

  useEffect(() => {
    const skipPptx = Boolean(embedSrc);
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
        setRasterDimensions(null);
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
  }, [presentationId, slideIndex, slideNumber, embedSrc, sourceUrl, sourceType, useGoogle]);

  const preparedSvg = useMemo(() => (svgMarkup ? prepareSlideSvg(svgMarkup) : null), [svgMarkup]);
  const slideDebug =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("slideDebug") === "1";

  const slideDimensions = useMemo(() => {
    if (preparedSvg) {
      return { width: preparedSvg.width, height: preparedSvg.height, aspectRatio: preparedSvg.aspectRatio };
    }
    if (rasterDimensions) {
      return {
        width: rasterDimensions.width,
        height: rasterDimensions.height,
        aspectRatio: rasterDimensions.width / rasterDimensions.height,
      };
    }
    return { width: 960, height: 540, aspectRatio: 16 / 9 };
  }, [preparedSvg, rasterDimensions]);

  const fitted = useMemo(() => {
    const slideAspect = slideDimensions.aspectRatio || slideDimensions.width / slideDimensions.height;
    if (!stageDimensions || stageDimensions.width <= 0 || stageDimensions.height <= 0) {
      return { width: 0, height: 0, offsetX: 0, offsetY: 0, scale: 1, ready: false, slideAspect };
    }
    const box = fitSlideToStage(stageDimensions.width, stageDimensions.height, slideAspect);
    const scale = slideDimensions.width > 0 ? box.width / slideDimensions.width : 1;
    return { ...box, scale, ready: true, slideAspect };
  }, [stageDimensions, slideDimensions]);

  useEffect(() => {
    if (!fitted.ready || !stageDimensions) return;
    viewLog({
      event: "stage_fit",
      presentationId,
      slide: slideNumber,
      stageWidth: stageDimensions.width,
      stageHeight: stageDimensions.height,
      slideWidth: slideDimensions.width,
      slideHeight: slideDimensions.height,
      renderedWidth: fitted.width,
      renderedHeight: fitted.height,
      scale: Number(fitted.scale.toFixed(4)),
      aspectRatio: Number(fitted.slideAspect.toFixed(4)),
    });
  }, [fitted, stageDimensions, slideDimensions, presentationId, slideNumber]);

  const stageStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    minWidth: 0,
    minHeight: 0,
    background: slideDebug ? "#94a3b8" : "#334155",
    overflow: "hidden",
    position: "relative",
  };

  const viewportStyle: React.CSSProperties = fitted.ready
    ? {
        position: "absolute",
        left: fitted.offsetX,
        top: fitted.offsetY,
        width: fitted.width,
        height: fitted.height,
        overflow: "hidden",
        background: "transparent",
        outline: slideDebug ? "3px solid #ef4444" : "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 10px 30px -5px rgba(0, 0, 0, 0.45)",
      }
    : {
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: "transparent",
      };

  const mediaFillStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    display: "block",
    maxWidth: "none",
    maxHeight: "none",
  };

  if (embedSrc) {
    return (
      <div ref={stageRef} className={className} style={stageStyle}>
        <div
          data-testid="classroom-google-viewport"
          data-visual-source="google_embed"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            overflow: "hidden",
            background: "transparent",
          }}
        >
          <iframe
            key={embedSrc}
            data-testid="classroom-google-embed"
            data-visual-source="google_embed"
            title={`Google Slides ${slideNumber}`}
            src={embedSrc}
            style={{ ...mediaFillStyle, border: 0, background: "#0f172a" }}
            allow="fullscreen"
            allowFullScreen
            onLoad={() => viewLog({ event: "google_iframe_load", presentationId, slide: slideNumber })}
            onError={() => {
              viewLog({ event: "google_iframe_error", presentationId, slide: slideNumber });
            }}
          />
        </div>
      </div>
    );
  }

  if (loading && !preparedSvg && !rasterUrl) {
    return (
      <div
        data-testid="classroom-original-loading"
        style={{
          width: "100%",
          height: "100%",
          display: "grid",
          placeItems: "center",
          background: "#334155",
          color: "#e2e8f0",
        }}
      >
        Loading presentation...
      </div>
    );
  }

  if (error && !preparedSvg && !rasterUrl) {
    return (
      <div
        data-testid="classroom-visual-error"
        style={{
          width: "100%",
          height: "100%",
          display: "grid",
          placeItems: "center",
          padding: 32,
          background: "#334155",
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
      ref={stageRef}
      data-testid="classroom-original-pptx"
      className={`presentation-stage ${className}`}
      style={stageStyle}
    >
      <style>{`
        [data-testid="classroom-slide-viewport"] > .classroom-slide-frame svg,
        [data-testid="classroom-slide-viewport"] > img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          max-width: none;
          max-height: none;
          display: block;
        }
      `}</style>
      <div
        data-testid="classroom-slide-viewport"
        className="slide-viewport"
        style={viewportStyle}
      >
        {rasterUrl ? (
          <img
            src={rasterUrl}
            alt=""
            style={{ ...mediaFillStyle, objectFit: "fill" }}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                setRasterDimensions({ width: img.naturalWidth, height: img.naturalHeight });
              }
            }}
          />
        ) : preparedSvg ? (
          <div
            className="classroom-slide-frame"
            data-testid="classroom-slide-frame"
            style={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              outline: slideDebug ? "2px solid #22c55e" : undefined,
            }}
            dangerouslySetInnerHTML={{ __html: preparedSvg.markup }}
          />
        ) : null}
      </div>
    </div>
  );
}
