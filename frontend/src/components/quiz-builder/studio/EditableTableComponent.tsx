import { useState, useEffect } from "react";
import { Plus, Trash2, AlignLeft, AlignCenter, AlignRight, Rows, Columns } from "lucide-react";
import { QuizSection } from "@/components/quiz-builder/studio/QuizSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseGfmTable } from "@/components/media/tableMarkdown";
import { cn } from "@/lib/utils";

export interface TableData {
  id?: string;
  headers: string[];
  rows: string[][];
  alignments?: ("left" | "center" | "right")[];
  caption?: string;
}

interface EditableTableComponentProps {
  question?: Record<string, any>;
  meta: Record<string, any>;
  updateMeta: (patch: Record<string, any>) => void;
}

export function EditableTableComponent({ question, meta, updateMeta }: EditableTableComponentProps) {
  const safeQ = question || {};
  const contextData = (meta.context || {}) as any;
  const rawTable =
    meta.table ||
    (Array.isArray(meta.tables) ? meta.tables[0] : null) ||
    safeQ.table ||
    safeQ.metadata?.table ||
    (Array.isArray(safeQ.tables) ? safeQ.tables[0] : null) ||
    contextData?.table ||
    contextData?.tables?.[0];

  const getInitialTable = (): TableData | null => {
    if (typeof rawTable === "object" && rawTable !== null) {
      const headers = Array.isArray(rawTable.headers) ? rawTable.headers : [];
      const cells = Array.isArray(rawTable.rows) ? rawTable.rows : Array.isArray(rawTable.cells) ? rawTable.cells : [];
      const alignments = Array.isArray(rawTable.alignments) ? rawTable.alignments : headers.map(() => "left");
      if (headers.length > 0 || cells.length > 0) {
        return {
          headers,
          rows: cells,
          alignments,
          caption: rawTable.caption || "",
        };
      }
    }
    if (typeof rawTable === "string" && rawTable.trim()) {
      const parsed = parseGfmTable(rawTable);
      if (parsed && (parsed.headers.length > 0 || parsed.rows.length > 0)) {
        return {
          headers: parsed.headers,
          rows: parsed.rows,
          alignments: parsed.headers.map(() => "left"),
        };
      }
    }
    return null;
  };

  const [table, setTable] = useState<TableData | null>(getInitialTable);

  useEffect(() => {
    setTable(getInitialTable());
  }, [JSON.stringify(rawTable)]);

  if (!table || (table.headers.length === 0 && table.rows.length === 0)) {
    return null;
  }

  const saveTable = (next: TableData) => {
    setTable(next);
    updateMeta({
      table: {
        headers: next.headers,
        rows: next.rows,
        alignments: next.alignments,
        caption: next.caption,
      },
      tables: [
        {
          headers: next.headers,
          rows: next.rows,
          alignments: next.alignments,
          caption: next.caption,
        },
      ],
    });
  };

  const numCols = Math.max(table.headers.length, ...table.rows.map((r) => r.length), 1);

  // Ensure row & col dimensions match numCols
  const currentHeaders = Array.from({ length: numCols }, (_, i) => table.headers[i] ?? `Header ${i + 1}`);
  const currentAlignments = Array.from({ length: numCols }, (_, i) => table.alignments?.[i] ?? "left");

  const updateCell = (rowIndex: number, colIndex: number, value: string) => {
    const newRows = table.rows.map((row, rIdx) => {
      if (rIdx !== rowIndex) return row;
      const newRow = [...row];
      while (newRow.length < numCols) newRow.push("");
      newRow[colIndex] = value;
      return newRow;
    });
    saveTable({ ...table, headers: currentHeaders, rows: newRows, alignments: currentAlignments });
  };

  const updateHeader = (colIndex: number, value: string) => {
    const newHeaders = [...currentHeaders];
    newHeaders[colIndex] = value;
    saveTable({ ...table, headers: newHeaders });
  };

  const addRow = (atIndex?: number) => {
    const emptyRow = Array(numCols).fill("");
    const newRows = [...table.rows];
    if (atIndex !== undefined) {
      newRows.splice(atIndex + 1, 0, emptyRow);
    } else {
      newRows.push(emptyRow);
    }
    saveTable({ ...table, headers: currentHeaders, rows: newRows, alignments: currentAlignments });
  };

  const deleteRow = (rowIndex: number) => {
    if (table.rows.length <= 1) return;
    const newRows = table.rows.filter((_, i) => i !== rowIndex);
    saveTable({ ...table, rows: newRows });
  };

  const addColumn = () => {
    const newHeaders = [...currentHeaders, `Header ${numCols + 1}`];
    const newAlignments = [...currentAlignments, "left" as const];
    const newRows = table.rows.map((r) => [...r, ""]);
    saveTable({ headers: newHeaders, rows: newRows, alignments: newAlignments, caption: table.caption });
  };

  const deleteColumn = (colIndex: number) => {
    if (numCols <= 1) return;
    const newHeaders = currentHeaders.filter((_, i) => i !== colIndex);
    const newAlignments = currentAlignments.filter((_, i) => i !== colIndex);
    const newRows = table.rows.map((r) => r.filter((_, i) => i !== colIndex));
    saveTable({ headers: newHeaders, rows: newRows, alignments: newAlignments, caption: table.caption });
  };

  const toggleAlignment = (colIndex: number) => {
    const current = currentAlignments[colIndex] || "left";
    const nextAlign = current === "left" ? "center" : current === "center" ? "right" : "left";
    const newAlignments = [...currentAlignments];
    newAlignments[colIndex] = nextAlign;
    saveTable({ ...table, alignments: newAlignments });
  };

  const removeTable = () => {
    updateMeta({ table: null, tables: null });
  };

  return (
    <QuizSection
      title="Native Editable Table Component"
      description="Each cell is independently editable. Add or remove rows and columns with precision."
      action={
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={() => addRow()} className="h-8 gap-1 rounded-full text-xs">
            <Rows className="h-3.5 w-3.5" />
            Add Row
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addColumn()} className="h-8 gap-1 rounded-full text-xs">
            <Columns className="h-3.5 w-3.5" />
            Add Column
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={removeTable} className="h-8 text-xs text-destructive hover:bg-destructive/10">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Table Caption */}
        <div className="flex items-center gap-2">
          <Input
            value={table.caption || ""}
            onChange={(e) => saveTable({ ...table, caption: e.target.value })}
            placeholder="Table Caption (optional, e.g. Table 1: Programming Languages)"
            className="h-8 text-xs font-medium text-muted-foreground border-dashed"
          />
        </div>

        {/* Matrix Editor Grid */}
        <div className="overflow-x-auto rounded-xl border border-border/80 bg-card p-3 shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40">
                <th className="w-8 p-1.5 text-center text-[10px] font-mono text-muted-foreground">#</th>
                {currentHeaders.map((header, cIdx) => (
                  <th key={cIdx} className="p-1.5">
                    <div className="flex items-center gap-1">
                      <Input
                        value={header}
                        onChange={(e) => updateHeader(cIdx, e.target.value)}
                        placeholder={`Col ${cIdx + 1}`}
                        className={cn(
                          "h-8 font-bold text-xs bg-background/80 border-border/60 focus-visible:ring-1",
                          currentAlignments[cIdx] === "center" && "text-center",
                          currentAlignments[cIdx] === "right" && "text-right"
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary"
                        onClick={() => toggleAlignment(cIdx)}
                        title={`Align: ${currentAlignments[cIdx]}`}
                      >
                        {currentAlignments[cIdx] === "center" ? (
                          <AlignCenter className="h-3.5 w-3.5" />
                        ) : currentAlignments[cIdx] === "right" ? (
                          <AlignRight className="h-3.5 w-3.5" />
                        ) : (
                          <AlignLeft className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      {numCols > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deleteColumn(cIdx)}
                          title="Delete Column"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rIdx) => (
                <tr key={rIdx} className="border-b border-border/40 hover:bg-muted/20">
                  <td className="w-8 p-1.5 text-center text-[10px] font-mono text-muted-foreground">{rIdx + 1}</td>
                  {currentHeaders.map((_, cIdx) => (
                    <td key={cIdx} className="p-1.5">
                      <Input
                        value={row[cIdx] ?? ""}
                        onChange={(e) => updateCell(rIdx, cIdx, e.target.value)}
                        placeholder={`Cell (${rIdx + 1}, ${cIdx + 1})`}
                        className={cn(
                          "h-8 text-xs bg-background/50 border-border/50 focus-visible:ring-1",
                          currentAlignments[cIdx] === "center" && "text-center",
                          currentAlignments[cIdx] === "right" && "text-right"
                        )}
                      />
                    </td>
                  ))}
                  <td className="w-10 p-1 text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => addRow(rIdx)}
                        title="Insert Row Below"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                      {table.rows.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deleteRow(rIdx)}
                          title="Delete Row"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </QuizSection>
  );
}
