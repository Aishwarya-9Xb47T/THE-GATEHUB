import { describe, expect, it } from "@jest/globals";
import { parseGoogleSlidesProbeHtml, validateAndExtractGoogleSlidesId } from "../googleSlidesPublicService.js";
import { parseReliableGoogleSlideCount } from "../googleSlidesProbe.js";

const THIRTEEN_SLIDE_VIEWER = String.raw`var viewerData = {urlPrefix: '/presentation/d/abc123', docId: 'abc123', title: 'Q&A', docData: [[365760,205740],[["p",0,"Google Slides Q&A"],["g116b17de67_0_49",1,"Slides Q&A?"],["g116b17de67_0_62",2,"Q&A in Action"],["g116b17de67_0_54",3,"Why use Q&A?"],["g116b17de67_0_58",4,"Go Ahead"],["g116bbbec8b_0_4",5,"Your Turn"],["g116bbbec8b_0_9",6,"Step 1"],["g1599cf492e_0_2",7,"Step 2"],["g1599cf492e_0_8",8,"Step 3"],["g1599cf492e_0_15",9,"Step 4"],["g5ee4e4182d_17_3",10,"Step 5"],["g1599cf492e_0_22",11,"Step 6"],["g1599cf492e_0_29",12,"Last"]]}`;

describe("public Google Slides probe", () => {
  it("normalizes supported Google Slides URLs to a presentation id", () => {
    expect(validateAndExtractGoogleSlidesId("https://docs.google.com/presentation/d/abc123XYZ/edit?usp=sharing").presentationId).toBe("abc123XYZ");
    expect(validateAndExtractGoogleSlidesId("https://docs.google.com/presentation/d/abc123XYZ/present").presentationId).toBe("abc123XYZ");
    expect(validateAndExtractGoogleSlidesId("https://docs.google.com/presentation/d/abc123XYZ/preview").presentationId).toBe("abc123XYZ");
    expect(validateAndExtractGoogleSlidesId("https://docs.google.com/presentation/d/abc123XYZ/pub").presentationId).toBe("abc123XYZ");
    expect(validateAndExtractGoogleSlidesId("not-a-url").valid).toBe(false);
    expect(validateAndExtractGoogleSlidesId("not-a-url").error).toMatch(/INVALID_URL/i);
    expect(validateAndExtractGoogleSlidesId("https://docs.google.com/document/d/abc/edit").error).toMatch(/Google Doc/i);
  });

  it("detects a private login wall from the final URL", () => {
    const parsed = parseGoogleSlidesProbeHtml("<html>Sign in to continue</html>", "https://accounts.google.com/ServiceLogin");
    expect(parsed.accessible).toBe(false);
    expect(parsed.requiresAuthentication).toBe(true);
    expect(parsed.error).toBe("GOOGLE_SLIDES_PERMISSION_REQUIRED");
  });

  it("does not treat a public embed that mentions accounts.google.com as private", () => {
    const parsed = parseGoogleSlidesProbeHtml(
      `<html>accounts.google.com punch-viewer ${THIRTEEN_SLIDE_VIEWER}</html>`,
      "https://docs.google.com/presentation/d/abc123/embed?slide=1",
      "abc123",
    );
    expect(parsed.accessible).toBe(true);
    expect(parsed.requiresAuthentication).toBe(false);
    expect(parsed.slideCount).toBe(13);
  });

  it("reads a public embed slide count from JSON when present", () => {
    const parsed = parseGoogleSlidesProbeHtml(
      '<html>var viewerData = {docId: "abc", docData: [[1,1],[]]} "slideCount":11</html>',
      "https://docs.google.com/presentation/d/abc/embed?slide=1",
      "abc",
    );
    expect(parsed.accessible).toBe(true);
    expect(parsed.slideCount).toBe(11);
  });

  it("does not invent a slide count when public metadata is missing", () => {
    const parsed = parseGoogleSlidesProbeHtml(
      '<html>var viewerData = {docId: "abc", docData: [[100,100],[]]}</html>',
      "https://docs.google.com/presentation/d/abc/embed?slide=1",
      "abc",
    );
    expect(parsed.accessible).toBe(true);
    expect(parsed.requiresAuthentication).toBe(false);
    expect(parsed.slideCount).toBeUndefined();
  });

  it("counts PPTX-imported Google slides whose ids are p1, p2, p10 rather than g...", () => {
    const html = String.raw`var viewerData = {docId: 'unit2', title: 'Unit-2 Discussion.pptx', docData: [[487680,274320],[["p1",0,"Numerical example of 3D convolution"],["p2",1,"Case 2"],["g33dc27e2992_0_8",2,"Three"],["g33dc27e2992_0_18",3,"Four"],["p4",4,"Five"],["p5",5,"Six"],["p7",6,"Seven"],["p6",7,"Eight"],["p8",8,"Nine"],["p9",9,"Ten"],["p10",10,"Eleven"]]}`;
    const parsed = parseGoogleSlidesProbeHtml(`<html>${html}</html>`, "https://docs.google.com/presentation/d/unit2/embed", "unit2");
    expect(parsed.accessible).toBe(true);
    expect(parsed.slideCount).toBe(11);
    expect(parseReliableGoogleSlideCount(html)?.slideCount).toBe(11);
  });

  it("counts the first Google slide even when its id is p instead of g...", () => {
    const parsed = parseGoogleSlidesProbeHtml(
      `<html>${THIRTEEN_SLIDE_VIEWER} ["geometric",16,"] ["gameday",22,"]</html>`,
      "https://docs.google.com/presentation/d/abc123/embed",
      "abc123",
    );
    expect(parsed.accessible).toBe(true);
    expect(parsed.slideCount).toBe(13);
    expect(parseReliableGoogleSlideCount(THIRTEEN_SLIDE_VIEWER)?.slideCount).toBe(13);
  });

  it("maps a deleted presentation to GOOGLE_SLIDES_NOT_ACCESSIBLE", () => {
    const parsed = parseGoogleSlidesProbeHtml(
      "<html><title>Page not found</title></html>",
      "https://docs.google.com/presentation/d/missing/embed",
      "missing",
    );
    expect(parsed.accessible).toBe(false);
    expect(parsed.requiresAuthentication).toBe(false);
    expect(parsed.error).toBe("GOOGLE_SLIDES_NOT_ACCESSIBLE");
  });
});
