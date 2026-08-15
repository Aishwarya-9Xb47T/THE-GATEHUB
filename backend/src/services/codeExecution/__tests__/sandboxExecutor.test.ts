import { describe, it, expect } from "@jest/globals";
import { executeSandboxed, findExecutable } from "../sandboxExecutor.js";
import { extractYouTubeId, detectVideoSourceType } from "../../../utils/videoSourceUtils.js";
import { isInteractiveOnlyTex } from "../../luProject/luPublishSourceOfTruth.js";

describe("sandbox code execution", () => {
  it("runs JavaScript with node", async () => {
    const result = await executeSandboxed("javascript", "console.log('hello-js')");
    expect(result.success).toBe(true);
    expect(result.stdout).toContain("hello-js");
  });

  it("returns runtime error for throwing JS", async () => {
    const result = await executeSandboxed("javascript", "throw new Error('boom')");
    expect(result.success).toBe(false);
    expect(result.status).toBe("runtime_error");
    expect(result.stderr + result.stdout).toMatch(/boom/);
  });

  it("times out infinite loops", async () => {
    const result = await executeSandboxed("javascript", "while (true) {}");
    expect(result.success).toBe(false);
    expect(result.status).toBe("timeout");
  }, 15000);

  it("rejects oversized source", async () => {
    const result = await executeSandboxed("javascript", "x".repeat(70 * 1024));
    expect(result.status).toBe("limit");
  });

  it("runs Python when python3/python exists", async () => {
    const python = findExecutable(["python3", "python"]);
    if (!python) {
      const result = await executeSandboxed("python", "print(1)");
      expect(result.status).toBe("unsupported");
      return;
    }
    const result = await executeSandboxed("python", "print('hello-py')");
    expect(result.success).toBe(true);
    expect(result.stdout).toContain("hello-py");
  });

  it("reports compile error for invalid C when gcc exists", async () => {
    const gcc = findExecutable(["gcc"]);
    if (!gcc) {
      const result = await executeSandboxed("c", "not c");
      expect(result.status).toBe("unsupported");
      return;
    }
    const result = await executeSandboxed("c", "this is not valid C {");
    expect(result.success).toBe(false);
    expect(result.status).toBe("compile_error");
  });
});

describe("YouTube URL normalization", () => {
  it("parses watch, short, and embed URLs", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9wgXcQ")).toBe("dQw4w9wgXcQ");
    expect(extractYouTubeId("https://youtu.be/dQw4w9wgXcQ")).toBe("dQw4w9wgXcQ");
    expect(extractYouTubeId("https://www.youtube.com/embed/dQw4w9wgXcQ")).toBe("dQw4w9wgXcQ");
    expect(extractYouTubeId("not-a-url")).toBeNull();
  });

  it("classifies youtube vs upload", () => {
    expect(detectVideoSourceType("https://youtu.be/dQw4w9wgXcQ")).toBe("youtube");
    expect(detectVideoSourceType("/uploads/videos/a.mp4", "upload")).toBe("upload");
  });
});

describe("interactive workspace tex is not treated as a document source", () => {
  it("keeps research-paper and project interactive", () => {
    expect(isInteractiveOnlyTex("\\researchpaper{title={Paper}}")).toBe(true);
    expect(isInteractiveOnlyTex("\\project{title={Capstone}}")).toBe(true);
    expect(isInteractiveOnlyTex("\\codinglab{title={Lab}}")).toBe(true);
    expect(isInteractiveOnlyTex("\\theory{title={Doc},body={Hello}}")).toBe(false);
  });
});
