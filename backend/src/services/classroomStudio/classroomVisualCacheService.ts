import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PNG_MIME, SVG_MIME, canonicalVisualRelative } from "./classroomAssetPath.js";
import {
  persistClassroomAssetBuffer,
  getPresentationOriginalSource,
  downloadPresentationPptx,
  resolvePresentationSource,
} from "./classroomSourceResolver.js";
import {
  chromeExecutablePath,
  renderPresentationSlides,
} from "./presentationRenderService.js";

const generating = new Set<string>();

export async function startClassroomVisualCache(presentationId: string): Promise<void> {
  if (generating.has(presentationId)) return;
  generating.add(presentationId);
  try {
    await generateClassroomVisualCache(presentationId);
  } catch (error) {
    console.warn("[CLASSROOM_VISUAL_CACHE] failed", {
      presentationId,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    generating.delete(presentationId);
  }
}

async function generateClassroomVisualCache(presentationId: string): Promise<void> {
  if (!chromeExecutablePath()) {
    console.info("[CLASSROOM_VISUAL_CACHE] skipped_no_chrome", { presentationId });
    return;
  }

  const source = await getPresentationOriginalSource(presentationId);
  if (!source.exists) {
    console.info("[CLASSROOM_VISUAL_CACHE] skipped_no_source", {
      presentationId,
      reason: source.reason,
    });
    return;
  }

  const resolved = await resolvePresentationSource(presentationId);
  if (!resolved.ok) return;
  const pptx = await downloadPresentationPptx(resolved);
  const workDir = await mkdtemp(path.join(os.tmpdir(), "classroom-visuals-"));

  const persistVisual = async (slideNumber: number, svgText: string) => {
    if (!svgText || !svgText.includes("<svg")) return;
    await persistClassroomAssetBuffer({
      relative: canonicalVisualRelative(presentationId, slideNumber, "svg"),
      body: Buffer.from(svgText, "utf8"),
      contentType: SVG_MIME,
    });
    console.info("[CLASSROOM_VISUAL_CACHE] stored", {
      presentationId,
      slide: slideNumber,
      bytes: Buffer.byteLength(svgText),
    });
  };

  const result = await renderPresentationSlides(pptx, workDir, {
    presentationId,
    engine: "pptx-svg",
    onSlideRendered: async (render) => {
      const slideNumber = render.index + 1;
      if (render.svgText) {
        await persistVisual(slideNumber, render.svgText);
        return;
      }
      if (render.path) {
        try {
          const svg = await readFile(render.path, "utf8");
          await persistVisual(slideNumber, svg);
        } catch {
          /* ignore a single slide persist failure */
        }
      }
    },
  });

  if (!result.success) {
    console.warn("[CLASSROOM_VISUAL_CACHE] renderer_incomplete", {
      presentationId,
      method: result.method,
      errors: result.errors.slice(0, 3),
    });
  }
}

export async function persistPngVisualIfPresent(
  presentationId: string,
  slideNumber: number,
  png: Buffer,
): Promise<void> {
  if (!png.length || png[0] !== 0x89) return;
  await persistClassroomAssetBuffer({
    relative: canonicalVisualRelative(presentationId, slideNumber, "png"),
    body: png,
    contentType: PNG_MIME,
  });
}
