export type ClassroomSlideVisual = {
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
}): ClassroomSlideUiState {
  const { visual, pipelineStatus, imageReady } = args;
  const visualReady = isSlideVisualReady(visual);
  const pending = isSlideVisualPending(visual);
  const markedFailed = visual?.renderStatus === "failed" || visual?.availability === "failed";
  const pipelineRunning = PIPELINE_RUNNING.has(pipelineStatus || "");

  if (visualReady && imageReady) return "ready";
  if (visualReady) return "image_loading";
  if (pending || (pipelineRunning && !markedFailed)) return "rendering";
  if (markedFailed) return "failed";
  if (pipelineStatus === "render_failed" && !pending) return "failed";
  return "image_loading";
}

export function shouldPollClassroomRender(presentation: {
  status?: string;
  renderJob?: { status?: string } | null;
  slides?: Array<{ content?: { visual?: ClassroomSlideVisual } }>;
}): boolean {
  const slides = presentation.slides ?? [];
  const visuals = slides.map((slide) => slide.content?.visual).filter(Boolean) as ClassroomSlideVisual[];
  if (!visuals.length) return false;
  if (visuals.every((visual) => isSlideVisualReady(visual))) return false;
  const jobActive = presentation.renderJob?.status === "PENDING" || presentation.renderJob?.status === "RENDERING";
  if (jobActive || visuals.some((visual) => isSlideVisualPending(visual))) return true;
  return isPipelineActive(presentation.status);
}
