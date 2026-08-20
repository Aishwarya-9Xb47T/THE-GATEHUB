import { describe, expect, it } from "@jest/globals";
import { diagnoseMissingOriginalSource, isEphemeralHost } from "../classroomSourceResolver.js";

describe("getPresentationOriginalSource diagnostics", () => {
  it("reports a missing presentation", () => {
    expect(diagnoseMissingOriginalSource({
      presentationFound: false,
      b2Configured: true,
      ephemeralHost: false,
    })).toBe("PRESENTATION_NOT_FOUND");
  });

  it("reports ephemeral hosts without B2 as a filesystem mismatch", () => {
    expect(diagnoseMissingOriginalSource({
      presentationFound: true,
      sourceUrl: "/uploads/classroom/abc/source/original.pptx",
      b2Configured: false,
      ephemeralHost: true,
    })).toBe("DEPLOYED_FILESYSTEM_MISMATCH");
  });

  it("reports a missing source URL as an unpersisted upload", () => {
    expect(diagnoseMissingOriginalSource({
      presentationFound: true,
      sourceUrl: null,
      b2Configured: true,
      ephemeralHost: false,
    })).toBe("UPLOAD_NOT_PERSISTED");
  });

  it("reports a source URL that does not belong to the presentation", () => {
    expect(diagnoseMissingOriginalSource({
      presentationFound: true,
      sourceUrl: "https://example.com/not-this.pptx",
      b2Configured: true,
      ephemeralHost: false,
      sourceUrlMatchesPresentation: false,
    })).toBe("BAD_SOURCE_URL");
  });

  it("does not treat local development without B2 as an ephemeral host", () => {
    const previous = process.env.NODE_ENV;
    const render = process.env.RENDER;
    delete process.env.RENDER;
    delete process.env.RENDER_SERVICE_ID;
    process.env.NODE_ENV = "test";
    expect(isEphemeralHost()).toBe(false);
    process.env.NODE_ENV = previous;
    if (render != null) process.env.RENDER = render;
  });
});
