import { sanitizeHtml } from "@/lib/sanitizeHtml";
import type { CellOutput, ExecutionState } from "../types";

interface CellOutputViewProps {
  outputs: CellOutput;
  executionState: ExecutionState;
  executionCount: number | null;
}

export function CellOutputView({ outputs, executionState, executionCount }: CellOutputViewProps) {
  const isRunning = executionState === "running" || outputs.status === "running";

  if (isRunning) {
    return (
      <div className="border-t border-[#30363d] bg-black/40 p-3 font-mono text-xs text-[#8b949e]">
        Running…
      </div>
    );
  }

  const hasOutput = outputs.stdout || outputs.stderr || outputs.renderedHtml;
  if (!hasOutput && executionState === "idle") {
    return (
      <div className="border-t border-[#30363d] bg-black/40 p-3 font-mono text-xs text-[#7ee787]/70">
        Press Run to execute
      </div>
    );
  }

  return (
    <div className="border-t border-[#30363d] bg-black/40 p-3 font-mono text-xs whitespace-pre-wrap min-h-[48px]">
      {executionCount != null && (
        <div className="text-[#8b949e] mb-1 text-[10px]">Out [{executionCount}]</div>
      )}
      {outputs.stderr && <pre className="text-red-400 mb-2">{outputs.stderr}</pre>}
      {outputs.stdout && <pre className="text-[#7ee787]">{outputs.stdout}</pre>}
      {outputs.renderedHtml && (
        <div className="prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(outputs.renderedHtml) }} />
      )}
      {outputs.executionTimeMs != null && (
        <div className="text-[#8b949e] mt-2 text-[10px]">{outputs.executionTimeMs}ms</div>
      )}
    </div>
  );
}
