/** Live classroom layout is derived from focus + independent panel flags. */

export function classroomGridTemplate(focusMode: boolean, leftOpen: boolean, rightOpen: boolean): string {
  if (focusMode) return "minmax(0, 1fr)";
  const cols: string[] = [];
  if (leftOpen) cols.push("18rem");
  cols.push("minmax(0, 1fr)");
  if (rightOpen) cols.push("20rem");
  return cols.join(" ");
}

export function classroomPanelVisible(focusMode: boolean, panelOpen: boolean): boolean {
  return !focusMode && panelOpen;
}

export function classroomStageFrameClass(focusMode: boolean): string {
  return focusMode
    ? "relative mx-auto flex h-[92%] w-[95%] max-h-full max-w-none items-center justify-center overflow-hidden"
    : "relative mx-auto flex h-full w-full max-w-6xl items-center justify-center overflow-hidden";
}
