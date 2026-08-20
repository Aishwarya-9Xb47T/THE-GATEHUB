import { describe, expect, it } from "vitest";
import {
  classroomSlideUiState,
  shouldPollClassroomRender,
} from "./classroomRenderState";

describe("classroomRenderState", () => {
  it("treats a stale presentation render_failed as rendering while the slide is still in flight", () => {
    expect(
      classroomSlideUiState({
        visual: { renderStatus: "rendering", availability: "missing" },
        pipelineStatus: "render_failed",
        imageReady: false,
      }),
    ).toBe("rendering");
  });

  it("shows image loading for READY visuals instead of a render failure", () => {
    expect(
      classroomSlideUiState({
        visual: { renderStatus: "ready", availability: "available" },
        pipelineStatus: "render_failed",
        imageReady: false,
      }),
    ).toBe("image_loading");
    expect(
      classroomSlideUiState({
        visual: { renderStatus: "ready", availability: "available" },
        pipelineStatus: "render_failed",
        imageReady: true,
      }),
    ).toBe("ready");
  });

  it("only treats FAILED as terminal when the slide itself failed", () => {
    expect(
      classroomSlideUiState({
        visual: { renderStatus: "failed", availability: "failed", errorCode: "CLASSROOM_RENDER_SLIDE_FAILED" },
        pipelineStatus: "rendering_partial",
        imageReady: false,
      }),
    ).toBe("failed");
  });

  it("keeps polling while any slide is pending even if the header says render_failed", () => {
    expect(
      shouldPollClassroomRender({
        status: "render_failed",
        renderJob: { status: "RENDERING" },
        slides: [
          { content: { visual: { renderStatus: "ready", availability: "available" } } },
          { content: { visual: { renderStatus: "rendering", availability: "missing" } } },
        ],
      }),
    ).toBe(true);
    expect(
      shouldPollClassroomRender({
        status: "ready",
        slides: [
          { content: { visual: { renderStatus: "ready", availability: "available" } } },
          { content: { visual: { renderStatus: "ready", availability: "available" } } },
        ],
      }),
    ).toBe(false);
  });
});
