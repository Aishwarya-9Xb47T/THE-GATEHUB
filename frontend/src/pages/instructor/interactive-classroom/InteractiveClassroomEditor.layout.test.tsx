import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { InteractiveClassroomEditor } from "./InteractiveClassroomEditor";

vi.mock("@/components/classroom/SlideRenderer", () => ({
  SlideRenderer: () => <div data-testid="mock-slide-renderer" className="h-full w-full" />,
}));

vi.mock("@/store/toastStore", () => ({
  useToastStore: (selector: (s: { add: () => void }) => unknown) =>
    selector({ add: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  apiUrl: (path: string) => path,
  getToken: () => "test-token",
}));

const slides = Array.from({ length: 11 }, (_, index) => ({
  id: `slide-${index + 1}`,
  order: index + 1,
  title: `Slide ${index + 1}`,
  content: { visual: { type: "original_pptx" } },
  isLocked: false,
  isHidden: false,
  isImportant: false,
  interactions: [],
}));

describe("InteractiveClassroomEditor layout containment", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/sessions")) {
          return {
            ok: true,
            json: async () => [],
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "pres-1",
            title: "Layout test deck",
            description: "",
            sourceType: "powerpoint",
            status: "ready",
            slides,
          }),
        } as Response;
      }),
    );
  });

  it("constrains the editor to a non-scrolling viewport shell with an independently scrollable slide list", async () => {
    render(
      <MemoryRouter initialEntries={["/instructor/interactive-classroom/presentations/pres-1/editor"]}>
        <Routes>
          <Route
            path="/instructor/interactive-classroom/presentations/:presentationId/editor"
            element={<InteractiveClassroomEditor />}
          />
        </Routes>
      </MemoryRouter>,
    );

    const editor = await screen.findByTestId("interactive-classroom-editor");
    await waitFor(() => {
      expect(screen.getByTestId("mock-slide-renderer")).toBeTruthy();
    });

    expect(editor.className).toMatch(/overflow-hidden/);
    expect(editor.className).toMatch(/min-h-0/);
    expect(editor.className).toMatch(/flex-col/);

    const workspace = screen.getByTestId("interactive-classroom-workspace");
    expect(workspace.className).toMatch(/overflow-hidden/);
    expect(workspace.className).toMatch(/min-h-0/);

    const slideList = screen.getByTestId("interactive-classroom-slide-list");
    expect(slideList.className).toMatch(/min-h-0/);
    expect(slideList.className).toMatch(/overflow-hidden/);

    const scrollRegion = slideList.querySelector(".overflow-y-auto");
    expect(scrollRegion).toBeTruthy();
    expect(scrollRegion?.className).toMatch(/min-h-0/);

    const mainStage = screen.getByTestId("interactive-classroom-main-stage");
    expect(mainStage.className).toMatch(/overflow-hidden/);
    expect(mainStage.className).toMatch(/min-h-0/);
    expect(mainStage.className).toMatch(/flex-1/);

    const presentationStage = screen.getByTestId("interactive-classroom-presentation-stage");
    expect(presentationStage.className).toMatch(/overflow-hidden/);
    expect(presentationStage.className).toMatch(/min-h-0/);
    expect(presentationStage.className).toMatch(/flex-1/);
    expect(presentationStage.className).not.toMatch(/overflow-y-auto/);
  });
});
