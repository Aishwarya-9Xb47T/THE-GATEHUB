import { describe, expect, it } from "@jest/globals";
import { parseGoogleSlidesProbeHtml, validateAndExtractGoogleSlidesId } from "../googleSlidesPublicService.js";

describe("public Google Slides probe", () => {
  it("normalizes supported Google Slides URLs to a presentation id", () => {
    expect(validateAndExtractGoogleSlidesId("https://docs.google.com/presentation/d/abc123XYZ/edit?usp=sharing").presentationId).toBe("abc123XYZ");
    expect(validateAndExtractGoogleSlidesId("https://docs.google.com/presentation/d/abc123XYZ/present").presentationId).toBe("abc123XYZ");
    expect(validateAndExtractGoogleSlidesId("https://docs.google.com/presentation/d/abc123XYZ/preview").presentationId).toBe("abc123XYZ");
    expect(validateAndExtractGoogleSlidesId("not-a-url").valid).toBe(false);
    expect(validateAndExtractGoogleSlidesId("https://docs.google.com/document/d/abc/edit").error).toMatch(/Google Doc/i);
  });

  it("detects a private login wall", () => {
    const parsed = parseGoogleSlidesProbeHtml("<html>Sign in to continue</html>", "https://accounts.google.com/ServiceLogin");
    expect(parsed.accessible).toBe(false);
    expect(parsed.requiresAuthentication).toBe(true);
    expect(parsed.error).toBe("GOOGLE_SLIDES_PERMISSION_REQUIRED");
  });

  it("does not treat a public embed that mentions accounts.google.com as private", () => {
    const parsed = parseGoogleSlidesProbeHtml(
      '<html>punch-viewer accounts.google.com "slideCount":4</html>',
      "https://docs.google.com/presentation/d/abc/embed?slide=1",
    );
    expect(parsed.accessible).toBe(true);
    expect(parsed.requiresAuthentication).toBe(false);
    expect(parsed.slideCount).toBe(4);
  });

  it("reads a public embed slide count", () => {
    const parsed = parseGoogleSlidesProbeHtml('<html>"slideCount":11</html>', "https://docs.google.com/presentation/d/abc/embed?slide=1");
    expect(parsed.accessible).toBe(true);
    expect(parsed.slideCount).toBe(11);
  });

  it("reads slide indexes from Google viewerData", () => {
    const parsed = parseGoogleSlidesProbeHtml(
      String.raw`var viewerData = {docData: [[1,1],[["p",0,"Title"],["gabc_1",1,"One"],["gabc_2",2,"Two"],["gabc_3",3,"Three"]]}`,
      "https://docs.google.com/presentation/d/abc/embed",
    );
    expect(parsed.accessible).toBe(true);
    expect(parsed.slideCount).toBeGreaterThanOrEqual(3);
  });
});
