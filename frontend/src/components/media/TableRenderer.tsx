import { cn } from "@/lib/utils";
import type { TableData } from "./tableMarkdown";

interface TableRendererProps {
  data: TableData;
  className?: string;
  /** Show a hint when columns may extend past the viewport (editor surfaces). */
  showScrollHint?: boolean;
}

/** Shared responsive table renderer for all assessment surfaces. */
export function TableRenderer({ data, className, showScrollHint }: TableRendererProps) {
  const cols = Math.max(data.headers.length, ...data.rows.map((r) => r.length), 1);

  return (
    <div className={cn("table-renderer w-full max-w-full", className)}>
      <div
        className={cn(
          "w-full max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-border/60 bg-background",
          "[scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
        )}
      >
        <table className="w-max min-w-full border-collapse text-sm">
          {data.headers.length > 0 && (
            <thead>
              <tr>
                {Array.from({ length: cols }).map((_, i) => (
                  <th
                    key={i}
                    className="min-w-[5.5rem] whitespace-nowrap border border-border/60 bg-muted/40 px-3 py-2 text-left font-semibold"
                  >
                    {data.headers[i] || ""}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {data.rows.map((row, ri) => (
              <tr key={ri} className="even:bg-muted/20">
                {Array.from({ length: cols }).map((_, ci) => (
                  <td
                    key={ci}
                    className="min-w-[5.5rem] break-words border border-border/60 px-3 py-2 align-top"
                  >
                    {row[ci] || ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showScrollHint && cols > 2 && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">Scroll horizontally to see all columns →</p>
      )}
    </div>
  );
}
