import { useEffect, useRef, useState } from "react";

export interface MermaidRendererProps {
  chart: string;
  className?: string;
}

export function MermaidRenderer({ chart, className }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const cleanChart = chart.replace(/^```mermaid\s*/i, "").replace(/```\s*$/, "").trim();

    if (!cleanChart) return;

    async function renderMermaid() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "loose",
          fontFamily: "Inter, sans-serif",
        });

        const id = `mermaid-svg-${Math.random().toString(36).slice(2, 9)}`;
        const { svg } = await mermaid.render(id, cleanChart);

        if (isMounted) {
          setSvgHtml(svg);
          setRenderError(false);
        }
      } catch (err: any) {
        console.warn("[MermaidRenderer] Render failed, falling back to visual step card:", err);
        if (isMounted) {
          setRenderError(true);
        }
      }
    }

    renderMermaid();

    return () => {
      isMounted = false;
    };
  }, [chart]);

  const cleanChart = chart.replace(/^```mermaid\s*/i, "").replace(/```\s*$/, "").trim();

  // If Mermaid rendered successfully, show SVG
  if (svgHtml && !renderError) {
    return (
      <div className={`mermaid-svg-container my-6 flex w-full justify-center overflow-x-auto rounded-2xl border border-border/60 bg-slate-950/80 p-6 shadow-md ${className || ""}`}>
        <div
          ref={containerRef}
          className="svg-wrapper w-full flex justify-center [&>svg]:max-w-full [&>svg]:h-auto"
          dangerouslySetInnerHTML={{ __html: svgHtml }}
        />
      </div>
    );
  }

  // Fallback visual flowchart step card (guarantees student NEVER sees raw flowchart TD text)
  const steps = parseFlowchartSteps(cleanChart);

  return (
    <div className={`visual-flowchart-card my-6 w-full rounded-2xl border border-primary/20 bg-slate-900/95 p-6 shadow-lg ${className || ""}`}>
      <div className="flex items-center space-x-2 mb-4 pb-2 border-b border-border/40">
        <span className="text-sm font-semibold tracking-wide uppercase text-primary">Process Flowchart</span>
      </div>
      <div className="flex flex-col md:flex-row items-stretch justify-center gap-3 overflow-x-auto py-2">
        {steps.map((step, idx) => (
          <div key={idx} className="flex flex-col md:flex-row items-center flex-1 min-w-[140px]">
            <div className="w-full flex-1 rounded-xl border border-border/80 bg-slate-800/90 p-4 text-center shadow-sm">
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Step {idx + 1}
              </span>
              <p className="text-sm font-medium text-foreground">{step}</p>
            </div>
            {idx < steps.length - 1 && (
              <div className="my-2 md:my-0 md:mx-2 flex items-center justify-center text-primary font-bold">
                <span className="hidden md:inline text-lg">→</span>
                <span className="inline md:hidden text-lg">↓</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function parseFlowchartSteps(chartText: string): string[] {
  const lines = chartText.split("\n").map((l) => l.trim()).filter(Boolean);
  const labels: string[] = [];

  for (const line of lines) {
    const matches = line.match(/\[(.*?)\]/g);
    if (matches) {
      for (const m of matches) {
        const text = m.slice(1, -1).trim();
        if (text && !labels.includes(text)) {
          labels.push(text);
        }
      }
    }
  }

  if (labels.length > 0) return labels;
  return ["Start Process", "Execute Core Steps", "Verify Results", "Completion"];
}
