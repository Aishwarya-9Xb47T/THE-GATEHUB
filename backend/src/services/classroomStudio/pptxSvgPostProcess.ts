/**
 * pptx-svg draws placeholder #999999 1px grid lines for tables whose style
 * defines no visible borders (common in Google Slides / minimal table styles).
 * Strip those lines so the rendered SVG matches PowerPoint/Slides appearance.
 */
export function stripPptxSvgDefaultTableGridLines(svg: string): string {
  if (!svg.includes('stroke="#999999"')) return svg;
  return svg.replace(/<line\b[^>]*\bstroke="#999999"[^>]*\bstroke-width="1"[^>]*\/>/gi, '');
}
