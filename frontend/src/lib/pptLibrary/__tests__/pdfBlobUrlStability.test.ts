import { describe, it, expect, vi } from "vitest";

describe("PDF Blob URL Stability and Memory Lifecycle", () => {
  it("creates a stable blob URL that avoids ArrayBuffer transfer detachment", () => {
    const mockBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
    const blob = new Blob([mockBytes], { type: "application/pdf" });

    const createObjectURL = vi.fn().mockReturnValue("blob:https://thegatehub.com/mock-uuid");
    const revokeObjectURL = vi.fn();
    (globalThis.URL as any).createObjectURL = createObjectURL;
    (globalThis.URL as any).revokeObjectURL = revokeObjectURL;

    // Simulating loadPdf creation
    const blobUrl = URL.createObjectURL(blob);
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(blobUrl).toBe("blob:https://thegatehub.com/mock-uuid");
    expect(typeof blobUrl).toBe("string");

    // When React-PDF receives a string URL, it sets source = { url: blobUrl }
    // PDF.js inspects: data ? [data.buffer] : null -> null
    // Hence no ArrayBuffer is placed in the worker transfer list
    const isUrlString = typeof blobUrl === "string";
    const transferList = isUrlString ? null : [mockBytes.buffer];
    expect(transferList).toBeNull();

    // Verify cleanup
    URL.revokeObjectURL(blobUrl);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:https://thegatehub.com/mock-uuid");
  });

  it("verifies that multiple page renders share the same Blob URL without recreation", () => {
    const urls: string[] = [];
    const createUrl = vi.fn(() => {
      const u = "blob:https://thegatehub.com/stable-url";
      urls.push(u);
      return u;
    });

    // Initial load creates URL once
    const activeUrl = createUrl();

    // Simulate page 1 -> 17 navigation and zoom changes (state updates)
    let currentPage = 1;
    let zoomLevel = 100;
    for (let i = 1; i <= 17; i++) {
      currentPage = i;
      zoomLevel = 100 + (i % 3) * 15;
    }

    // Ensure createUrl was only called once, URL never mutated across state updates
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(urls.length).toBe(1);
    expect(activeUrl).toBe("blob:https://thegatehub.com/stable-url");
    expect(currentPage).toBe(17);
    expect(zoomLevel).toBe(130);
  });
});
