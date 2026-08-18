import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClassroomLiveShell } from "./ClassroomLiveShell";

function renderShell(focusMode: boolean, leftOpen = true, rightOpen = true) {
  return render(
    <ClassroomLiveShell
      focusMode={focusMode}
      leftOpen={leftOpen}
      rightOpen={rightOpen}
      header={<div>header</div>}
      left={<div>Class flow</div>}
      stage={<div>PPT SLIDE</div>}
      compactBar={focusMode ? <div>Poll active</div> : null}
      bottomNav={<div>2 / 20</div>}
      right={<div>Live pulse</div>}
    />,
  );
}

describe("ClassroomLiveShell", () => {
  it("removes both side panels and uses a one-column grid in focus mode", () => {
    renderShell(true, true, true);
    expect(screen.getByTestId("classroom-live-shell").getAttribute("data-classroom-focus")).toBe("true");
    expect(screen.queryByTestId("classroom-panel-left")).toBeNull();
    expect(screen.queryByTestId("classroom-panel-right")).toBeNull();
    expect(screen.getByTestId("classroom-live-grid").style.gridTemplateColumns).toBe("minmax(0, 1fr)");
    expect(screen.getByTestId("classroom-live-grid").children).toHaveLength(1);
    expect(screen.getByTestId("classroom-slide-frame").className).toContain("absolute");
    expect(screen.getByTestId("classroom-slide-frame").className).toContain("inset-0");
  });

  it("shows both panels in normal mode", () => {
    renderShell(false, true, true);
    expect(screen.getByTestId("classroom-panel-left")).toBeTruthy();
    expect(screen.getByTestId("classroom-panel-right")).toBeTruthy();
    expect(screen.getByTestId("classroom-live-grid").style.gridTemplateColumns).toBe(
      "18rem minmax(0, 1fr) 20rem",
    );
    expect(screen.getByTestId("classroom-live-grid").children).toHaveLength(3);
  });

  it("expands the stage when only the left panel is collapsed", () => {
    renderShell(false, false, true);
    expect(screen.queryByTestId("classroom-panel-left")).toBeNull();
    expect(screen.getByTestId("classroom-panel-right")).toBeTruthy();
    expect(screen.getByTestId("classroom-live-grid").style.gridTemplateColumns).toBe("minmax(0, 1fr) 20rem");
    expect(screen.getByTestId("classroom-live-grid").children).toHaveLength(2);
  });
});
