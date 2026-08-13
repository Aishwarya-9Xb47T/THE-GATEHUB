/** Normalize LU project paths for reliable file ↔ component matching. */
export function normalizeLuPath(inputPath: string | undefined | null): string {
  if (!inputPath) return "";
  let path = inputPath.replace(/\\/g, "/").trim();
  if (!path.startsWith("/")) path = `/${path}`;
  return path.replace(/\/+/g, "/");
}
