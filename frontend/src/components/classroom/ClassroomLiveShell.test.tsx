import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClassroomLiveShell } from "./ClassroomLiveShell";

function renderShell(focusMode: boolean, leftOpen = true, rightOpen = true) {
  return render(
    <div style={{ height: 800, width: 1400 }}>
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
      />
    </div>,
  );
}

describe("ClassroomLiveShell", () => {
  it("hides left and right panels when focus mode is on even if those panels are marked open", () => {
    renderShell(true, true, true);
    expect(screen.getByTestId("classroom-live-shell").getAttribute("data-classroom-focus")).toBe("true");
    expect(screen.getByTestId("classroom-panel-left").style.display).toBe("none");
    expect(screen.getByTestId("classroom-panel-right").style.display).toBe("none");
    expect(screen.getByTestId("classroom-live-grid").style.gridTemplateColumns).toBe("minmax(0, 1fr)");
    expect(screen.getByTestId("classroom-slide-frame").className).toContain("w-[95%]");
  });

  it("shows both panels in normal mode", () => {
    renderShell(false, true, true);
    expect(screen.getByTestId("classroom-panel-left").style.display).toBe("flex");
    expect(screen.getByTestId("classroom-panel-right").style.display).toBe("flex");
    expect(screen.getByTestId("classroom-live-grid").style.gridTemplateColumns).toBe(
      "18rem minmax(0, 1fr) 20rem",
    );
  });

  it("expands the stage when only the left panel is collapsed", () => {
    renderShell(false, false, true);
    expect(screen.getByTestId("classroom-panel-left").style.display).toBe("none");
    expect(screen.getByTestId("classroom-panel-right").style.display).toBe("flex");
    expect(screen.getByTestId("classroom-live-grid").style.gridTemplateColumns).toBe("minmax(0, 1fr) 20rem");
  });
});
