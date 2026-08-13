import type { ParsedLatexError } from "../latexLogParser.js";
import { mapMergedLineToSource, type SourceLineMapping } from "./luIncludeResolver.js";

export interface MappedLatexError extends ParsedLatexError {
  sourceFile?: string;
  sourceLine?: number;
}

function isMergedMainPath(file: string | null | undefined): boolean {
  if (!file) return true;
  const norm = file.replace(/\\/g, "/").toLowerCase();
  return norm === "/main.tex" || norm === "main.tex" || norm.endsWith("/main.tex");
}

function normalizeProjectFilePath(file: string): string {
  let p = file.replace(/\\/g, "/");
  if (!p.startsWith("/")) p = `/${p}`;
  return p;
}

export function mapErrorsToSourceFiles(
  errors: ParsedLatexError[],
  lineMap: SourceLineMapping[]
): MappedLatexError[] {
  return errors.map((err) => {
    if (err.file && !isMergedMainPath(err.file)) {
      const sourceFile = normalizeProjectFilePath(err.file);
      return {
        ...err,
        sourceFile,
        sourceLine: err.line ?? undefined,
        file: sourceFile,
        line: err.line,
      };
    }

    if (!lineMap.length) return err;

    const mapped = mapMergedLineToSource(lineMap, err.line);
    if (!mapped) return err;
    return {
      ...err,
      sourceFile: mapped.sourcePath,
      sourceLine: mapped.sourceLine,
      file: mapped.sourcePath,
      line: mapped.sourceLine,
      message: err.message,
    };
  });
}
