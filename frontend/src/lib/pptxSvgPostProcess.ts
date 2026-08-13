/** @see backend/src/services/classroomStudio/pptxSvgPostProcess.ts */
export function stripPptxSvgDefaultTableGridLines(svg: string): string {
  if (!svg.includes('stroke="#999999"')) return svg;
  return svg.replace(/<line\b[^>]*\bstroke="#999999"[^>]*\bstroke-width="1"[^>]*\/>/gi, '');
}
