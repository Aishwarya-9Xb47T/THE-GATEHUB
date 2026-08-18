import type { ReactNode } from "react";
import {
  classroomGridTemplate,
  classroomPanelVisible,
  classroomStageFrameClass,
} from "@/lib/classroom/classroomLiveLayout";

interface ClassroomLiveShellProps {
  focusMode: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  header: ReactNode;
  left: ReactNode;
  stage: ReactNode;
  compactBar?: ReactNode;
  bottomNav: ReactNode;
  right: ReactNode;
  extras?: ReactNode;
}

export function ClassroomLiveShell({
  focusMode,
  leftOpen,
  rightOpen,
  header,
  left,
  stage,
  compactBar,
  bottomNav,
  right,
  extras,
}: ClassroomLiveShellProps) {
  const showLeft = classroomPanelVisible(focusMode, leftOpen);
  const showRight = classroomPanelVisible(focusMode, rightOpen);

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col bg-slate-950 text-slate-100"
      data-classroom-focus={focusMode ? "true" : "false"}
      data-testid="classroom-live-shell"
    >
      <div className="shrink-0 border-b border-white/10 bg-slate-950/95">{header}</div>
      <div
        className="grid min-h-0 flex-1 overflow-hidden"
        data-testid="classroom-live-grid"
        style={{ gridTemplateColumns: classroomGridTemplate(focusMode, showLeft, showRight) }}
      >
        <aside
          data-testid="classroom-panel-left"
          data-classroom-panel="left"
          className="min-h-0 flex-col overflow-hidden border-r border-white/10 bg-slate-900/50"
          style={{ display: showLeft ? "flex" : "none" }}
          aria-hidden={!showLeft}
        >
          {left}
        </aside>

        <section
          data-testid="classroom-stage"
          className="relative z-0 flex min-h-0 min-w-0 flex-col overflow-hidden"
        >
          <div
            className={`flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,_#27365d,_#080d1b_65%)] ${
              focusMode ? "p-[1.5vh]" : "p-3 md:p-5"
            }`}
          >
            <div className={classroomStageFrameClass(focusMode)} data-testid="classroom-slide-frame">
              {stage}
            </div>
          </div>
          {compactBar}
          {bottomNav}
        </section>

        <aside
          data-testid="classroom-panel-right"
          data-classroom-panel="right"
          className="relative z-10 min-h-0 flex-col overflow-hidden border-l border-white/10 bg-slate-900"
          style={{ display: showRight ? "flex" : "none" }}
          aria-hidden={!showRight}
        >
          {right}
        </aside>
      </div>
      {extras}
    </div>
  );
}
