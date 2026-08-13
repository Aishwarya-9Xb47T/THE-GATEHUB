import { useState, useMemo } from "react";
import Editor from "@monaco-editor/react";
import "katex/dist/katex.min.css";
import katex from "katex";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

function renderLatex(text: string): string {
  const blockRegex = /\\\[([\s\S]*?)\\\]|\\begin\{equation\}([\s\S]*?)\\end\{equation\}/g;
  const inlineRegex = /\\\(([\s\S]*?)\\\)|\$([^$]+)\$/g;
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  html = html.replace(blockRegex, (_, a, b) => {
    const content = a || b || "";
    try {
      return katex.renderToString(content.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return `<span class="text-red-600">${content}</span>`;
    }
  });
  html = html.replace(inlineRegex, (_, a, b) => {
    const content = (a || b || "").trim();
    try {
      return katex.renderToString(content, { displayMode: false, throwOnError: false });
    } catch {
      return `<span class="text-red-600">$${content}$</span>`;
    }
  });
  html = html.replace(/\n/g, "<br/>");
  return html;
}

const defaultContent = `% LaTeX notes - use $...$ for inline math and \\[...\\] for display math
% Example: $E = mc^2$ or \\[ \\int_0^1 x^2 \\, dx = \\frac{1}{3} \\]
`;

export function LatexEditor() {
  const [value, setValue] = useState(defaultContent);
  const preview = useMemo(() => renderLatex(value), [value]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[600px]">
      <Card className="overflow-hidden">
        <CardHeader className="py-3">
          <CardTitle className="text-base">Editor</CardTitle>
        </CardHeader>
        <CardContent className="p-0 h-[calc(100%-3rem)]">
          <Editor
            height="100%"
            defaultLanguage="latex"
            value={value}
            onChange={(v) => setValue(v ?? "")}
            options={{ minimap: { enabled: false }, fontSize: 14 }}
          />
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader className="py-3">
          <CardTitle className="text-base">Preview</CardTitle>
        </CardHeader>
        <CardContent className="p-4 h-[calc(100%-3rem)] overflow-auto">
          <div className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(preview) }} />
        </CardContent>
      </Card>
    </div>
  );
}
