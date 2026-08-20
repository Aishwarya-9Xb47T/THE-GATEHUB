import React, { useEffect, useMemo, useRef, useState } from "react";
import { fetchAuthenticatedUpload } from "@/lib/courseMediaUrls";
import {
  classroomOriginalPptxUrl,
  googleSlidesEmbedUrl,
  googleSlidesPresentationId,
} from "@/lib/classroom/originalPresentationUrls";

type PptxRendererHandle = {
  init: (wasmUrl?: string | ArrayBuffer) => Promise<void>;
  loadPptx: (buffer: ArrayBuffer) => Promise<{ slideCount: number }>;
  renderSlideSvg: (index: number) => string;
};

type CachedDeck = {
  renderer: PptxRendererHandle;
  slideCount: number;
  bytes: number;
};

const pptxDecks = new Map<string, Promise<CachedDeck>>();

export function clearClassroomPptxBufferCache(presentationId?: string) {
  if (presentationId) pptxDecks.delete(presentationId);
  else pptxDecks.clear();
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

async function fetchOriginalPptxBuffer(presentationId: string): Promise<ArrayBuffer> {
  const assetPath = classroomOriginalPptxUrl(presentationId);
  const response = await fetchAuthenticatedUpload(assetPath);
  viewLog({
    event: "pptx_fetch",
    presentationId,
    http: response.status,
    ok: response.ok,
  });
  if (!response.ok) {
    throw new Error(`ORIGINAL_PPTX_UNAVAILABLE HTTP ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
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

async function loadOriginalPptxDeck(presentationId: string): Promise<CachedDeck> {
  const existing = pptxDecks.get(presentationId);
  if (existing) return existing;
  const pending = (async () => {
    const { PptxRenderer } = await import("pptx-svg");
    const renderer = new PptxRenderer({ logLevel: "warn" }) as PptxRendererHandle;
    const wasmMode = await initPptxRenderer(renderer);
    const buffer = await fetchOriginalPptxBuffer(presentationId);
    const loaded = await renderer.loadPptx(buffer);
    viewLog({
      event: "viewer_initialized",
      sourceType: "pptx",
      presentationId,
      sourceAvailable: true,
      binaryLoaded: true,
      viewerInitialized: true,
      wasmMode,
      slideCount: loaded.slideCount,
    });
    return { renderer, slideCount: loaded.slideCount, bytes: buffer.byteLength };
  })();
  pptxDecks.set(presentationId, pending);
  try {
    return await pending;
  } catch (error) {
    pptxDecks.delete(presentationId);
    throw error;
  }
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!useGoogle && !svgMarkup);
  const requestId = useRef(0);

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
    if (useGoogle || !presentationId) {
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    const alreadyShowing = Boolean(svgMarkup);
    if (!alreadyShowing) setLoading(true);
    setError(null);
    void loadOriginalPptxDeck(presentationId)
      .then((deck) => {
        if (id !== requestId.current) return;
        const svg = deck.renderer.renderSlideSvg(slideIndex);
        if (!svg || svg.startsWith("ERROR:")) {
          throw new Error(svg || "ORIGINAL_PPTX_SLIDE_RENDER_FAILED");
        }
        setSvgMarkup(svg);
        setLoading(false);
        viewLog({
          event: "slide_displayed",
          sourceType: "pptx",
          presentationId,
          slide: slideNumber,
          slideCount: deck.slideCount,
          svgChars: svg.length,
        });
      })
      .catch((err) => {
        if (id !== requestId.current) return;
        const message = err instanceof Error ? err.message : String(err);
        viewLog({
          event: "viewer_failed",
          sourceType: "pptx",
          presentationId,
          slide: slideNumber,
          error: message.slice(0, 180),
        });
        setError(message);
        setLoading(false);
      });
  }, [presentationId, slideIndex, slideNumber, useGoogle]);

  const svgHtml = useMemo(() => svgMarkup, [svgMarkup]);

  if (embedSrc) {
    return (
      <iframe
        key={embedSrc}
        data-testid="classroom-google-embed"
        title={`Google Slides ${slideNumber}`}
        src={embedSrc}
        className={className}
        style={{ width: "100%", height: "100%", border: 0, background: "#000" }}
        allow="fullscreen"
        allowFullScreen
        onLoad={() => viewLog({ event: "google_iframe_load", presentationId, slide: slideNumber })}
        onError={() => viewLog({ event: "google_iframe_error", presentationId, slide: slideNumber })}
      />
    );
  }

  if (loading && !svgHtml) {
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
        Loading original presentation…
      </div>
    );
  }

  if (error && !svgHtml) {
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
        [data-testid="classroom-original-pptx"] svg {
          width: 100%;
          height: 100%;
          max-width: 100%;
          max-height: 100%;
          display: block;
        }
      `}</style>
      {svgHtml ? <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: svgHtml }} /> : null}
    </div>
  );
}
