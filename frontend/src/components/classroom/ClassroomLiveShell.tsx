import type { ReactNode } from "react";
import { classroomGridTemplate, classroomPanelVisible } from "@/lib/classroom/classroomLiveLayout";

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
      className="fixed inset-0 z-40 flex min-h-0 w-full flex-col bg-slate-950 text-slate-100"
      data-classroom-focus={focusMode ? "true" : "false"}
      data-testid="classroom-live-shell"
    >
      <div className="shrink-0 border-b border-white/10 bg-slate-950/95">{header}</div>
      <div
        className="grid min-h-0 flex-1 overflow-hidden"
        data-testid="classroom-live-grid"
        style={{ gridTemplateColumns: classroomGridTemplate(focusMode, showLeft, showRight) }}
      >
        {showLeft ? (
          <aside
            data-testid="classroom-panel-left"
            data-classroom-panel="left"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-white/10 bg-slate-900/50"
          >
            {left}
          </aside>
        ) : null}

        <section
          data-testid="classroom-stage"
          className="relative z-0 flex min-h-0 min-w-0 flex-col overflow-hidden"
        >
          <div className="relative min-h-0 flex-1">
            <div
              className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,_#27365d,_#080d1b_65%)] p-3 md:p-4"
              data-testid="classroom-slide-frame"
            >
              {stage}
            </div>
          </div>
          {compactBar}
          {bottomNav}
        </section>

        {showRight ? (
          <aside
            data-testid="classroom-panel-right"
            data-classroom-panel="right"
            className="relative z-10 flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-white/10 bg-slate-900"
          >
            {right}
          </aside>
        ) : null}
      </div>
      {extras}
    </div>
  );
}
