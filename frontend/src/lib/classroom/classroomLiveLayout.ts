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
