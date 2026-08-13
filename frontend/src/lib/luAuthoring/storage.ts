const devModeKey = (projectId: string) => `lu-dev-mode:${projectId}`;
const expandedKey = (projectId: string) => `lu-explorer-expanded:${projectId}`;
const activeFileKey = (projectId: string) => `lu-active-file:${projectId}`;

export function loadLuDeveloperMode(projectId: string): boolean {
  try {
    return sessionStorage.getItem(devModeKey(projectId)) === "1";
  } catch {
    return false;
  }
}

export function saveLuDeveloperMode(projectId: string, enabled: boolean) {
  try {
    sessionStorage.setItem(devModeKey(projectId), enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function loadLuExplorerExpanded(projectId: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(expandedKey(projectId));
    if (!raw) return new Set(["universe"]);
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set(["universe"]);
  }
}

export function saveLuExplorerExpanded(projectId: string, expanded: Set<string>) {
  try {
    sessionStorage.setItem(expandedKey(projectId), JSON.stringify([...expanded]));
  } catch {
    /* ignore */
  }
}

export function loadLuActiveFilePath(projectId: string): string | null {
  try {
    return sessionStorage.getItem(activeFileKey(projectId));
  } catch {
    return null;
  }
}

export function saveLuActiveFilePath(projectId: string, path: string | null) {
  try {
    if (path) sessionStorage.setItem(activeFileKey(projectId), path);
    else sessionStorage.removeItem(activeFileKey(projectId));
  } catch {
    /* ignore */
  }
}

const selectedNodeKey = (projectId: string) => `lu-selected-node:${projectId}`;

export function loadLuSelectedNodeId(projectId: string): string | null {
  try {
    return sessionStorage.getItem(selectedNodeKey(projectId));
  } catch {
    return null;
  }
}

export function saveLuSelectedNodeId(projectId: string, nodeId: string | null) {
  try {
    if (nodeId) sessionStorage.setItem(selectedNodeKey(projectId), nodeId);
    else sessionStorage.removeItem(selectedNodeKey(projectId));
  } catch {
    /* ignore */
  }
}
