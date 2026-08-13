/** LU educational .tex paths (track/module/lesson/component files). */
export function isLuGeneratedTexPath(path: string): boolean {
  const p = path.replace(/\\/g, "/");
  if (p === "/main.tex" || p.endsWith("/main.tex")) return true;
  if (p.endsWith("/track.tex") || p.endsWith("/module.tex")) return true;
  if (/\/lesson-\d+\.tex$/i.test(p)) return true;
  if (/\/lesson-\d+\/[^/]+\.tex$/i.test(p)) return true;
  return false;
}
