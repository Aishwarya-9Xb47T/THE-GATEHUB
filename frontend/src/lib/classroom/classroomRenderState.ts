import { isOriginalPresentationVisual, usesOriginalPresentationSource } from "./originalPresentationUrls";

export type ClassroomSlideVisual = {
  type?: string;
  visualSource?: string;
  availability?: string;
  renderStatus?: string;
  errorCode?: string;
  sourceHash?: string;
  jobId?: string;
  attempt?: number;
  rendererVersion?: string;
};

export type ClassroomSlideUiState = "rendering" | "image_loading" | "ready" | "failed";

const PIPELINE_ACTIVE = new Set(["rendering", "uploading", "extracting", "source_stored", "rendering_partial"]);
const PIPELINE_RUNNING = new Set(["rendering", "uploading", "extracting", "source_stored"]);

export function isSlideVisualReady(visual?: ClassroomSlideVisual | null): boolean {
  if (!visual) return false;
  if (isOriginalPresentationVisual(visual) && visual.availability !== "failed") return true;
  return visual.availability === "available" || visual.renderStatus === "ready";
}

export function isSlideVisualPending(visual?: ClassroomSlideVisual | null): boolean {
  if (!visual || isSlideVisualReady(visual)) return false;
  if (visual.renderStatus === "failed" || visual.availability === "failed") return false;
  return visual.renderStatus === "pending"
    || visual.renderStatus === "rendering"
    || visual.availability === "missing"
    || !visual.renderStatus;
}

export function isPipelineActive(status?: string): boolean {
  return PIPELINE_ACTIVE.has(status || "");
}

export function classroomImageCacheKey(visual?: ClassroomSlideVisual | null): string {
  return String(visual?.sourceHash || visual?.jobId || visual?.attempt || visual?.rendererVersion || "1");
}

export function classroomSlideUiState(args: {
  visual?: ClassroomSlideVisual | null;
  pipelineStatus?: string;
  imageReady?: boolean;
  sourceType?: string;
}): ClassroomSlideUiState {
  const { visual, pipelineStatus, imageReady, sourceType } = args;
  const visualReady = isSlideVisualReady(visual);
  const pending = isSlideVisualPending(visual);
  const markedFailed = visual?.renderStatus === "failed" || visual?.availability === "failed";
  const pipelineRunning = PIPELINE_RUNNING.has(pipelineStatus || "");

  if (usesOriginalPresentationSource(sourceType, visual)) {
    return "ready";
  }

  if (visualReady && imageReady) return "ready";
  if (visualReady) return "image_loading";
  if (pending || (pipelineRunning && !markedFailed)) return "rendering";
  if (markedFailed) return "failed";
  if (pipelineStatus === "render_failed" && !pending) return "failed";
  return "image_loading";
}

export function shouldPollClassroomRender(presentation: {
  status?: string;
  sourceType?: string;
  renderJob?: { status?: string } | null;
  slides?: Array<{ content?: { visual?: ClassroomSlideVisual } }>;
}): boolean {
  if (usesOriginalPresentationSource(presentation.sourceType, presentation.slides?.[0]?.content?.visual)) {
    return false;
  }
  const slides = presentation.slides ?? [];
  const visuals = slides.map((slide) => slide.content?.visual).filter(Boolean) as ClassroomSlideVisual[];
  if (!visuals.length) return false;
  if (visuals.every((visual) => isSlideVisualReady(visual))) return false;
  const jobActive = presentation.renderJob?.status === "PENDING" || presentation.renderJob?.status === "RENDERING";
  if (jobActive || visuals.some((visual) => isSlideVisualPending(visual))) return true;
  return isPipelineActive(presentation.status);
}
