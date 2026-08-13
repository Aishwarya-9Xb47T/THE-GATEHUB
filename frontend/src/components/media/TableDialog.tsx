import { useEffect, useState } from "react";
import { Table as TableIcon, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { TableRenderer } from "./TableRenderer";
import { emptyTable, type TableData } from "./tableMarkdown";

interface TableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: TableData;
  onInsert: (data: TableData) => void;
}

export function TableDialog({ open, onOpenChange, initialData, onInsert }: TableDialogProps) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [headerRow, setHeaderRow] = useState(true);
  const [data, setData] = useState<TableData>(emptyTable(3, 3, true));

  useEffect(() => {
    if (!open) return;
    if (initialData) {
      setData(initialData);
      setRows(Math.max(1, initialData.rows.length));
      setCols(Math.max(1, initialData.headers.length || initialData.rows[0]?.length || 3));
      setHeaderRow(initialData.headers.length > 0);
      return;
    }
    const next = emptyTable(rows, cols, headerRow);
    setData(next);
  }, [open, initialData]);

  const rebuild = (nextRows: number, nextCols: number, withHeader: boolean) => {
    const current = data;
    const headers = withHeader
      ? Array.from({ length: nextCols }, (_, i) => current.headers[i] || `Column ${i + 1}`)
      : [];
    const body = Array.from({ length: nextRows }, (_, ri) =>
      Array.from({ length: nextCols }, (_, ci) => current.rows[ri]?.[ci] || "")
    );
    setData({ headers, rows: body });
  };

  const updateCell = (rowIndex: number, colIndex: number, value: string, isHeader = false) => {
    setData((prev) => {
      if (isHeader) {
        const headers = [...prev.headers];
        headers[colIndex] = value;
        return { ...prev, headers };
      }
      const rowsCopy = prev.rows.map((r) => [...r]);
      if (!rowsCopy[rowIndex]) rowsCopy[rowIndex] = [];
      rowsCopy[rowIndex]![colIndex] = value;
      return { ...prev, rows: rowsCopy };
    });
  };

  const addRow = () => {
    const nextRows = data.rows.length + 1;
    setRows(nextRows);
    rebuild(nextRows, cols, headerRow);
  };

  const removeRow = (index: number) => {
    setData((prev) => ({ ...prev, rows: prev.rows.filter((_, i) => i !== index) }));
    setRows((r) => Math.max(1, r - 1));
  };

  const addColumn = () => {
    const nextCols = cols + 1;
    setCols(nextCols);
    rebuild(rows, nextCols, headerRow);
  };

  const removeColumn = (index: number) => {
    setData((prev) => ({
      headers: prev.headers.filter((_, i) => i !== index),
      rows: prev.rows.map((r) => r.filter((_, i) => i !== index)),
    }));
    setCols((c) => Math.max(1, c - 1));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <TableIcon className="h-5 w-5 text-primary" />
            {initialData ? "Edit table" : "Insert table"}
          </DialogTitle>
          <DialogDescription>
            {initialData
              ? "Update cells, add or remove rows/columns, then save."
              : "Configure rows, columns, and header row. Tab between cells while editing."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Rows</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={rows}
                  onChange={(e) => {
                    const n = Math.max(1, Number(e.target.value) || 1);
                    setRows(n);
                    rebuild(n, cols, headerRow);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Columns</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={cols}
                  onChange={(e) => {
                    const n = Math.max(1, Number(e.target.value) || 1);
                    setCols(n);
                    rebuild(rows, n, headerRow);
                  }}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={headerRow}
                onCheckedChange={(checked) => {
                  const on = Boolean(checked);
                  setHeaderRow(on);
                  rebuild(rows, cols, on);
                }}
              />
              Header row
            </label>

            <div className="space-y-2 overflow-x-auto rounded-lg border p-3">
              {headerRow && (
                <div className="mb-2 flex gap-2">
                  {data.headers.map((cell, ci) => (
                    <div key={`h-wrap-${ci}`} className="flex min-w-[7rem] items-center gap-1">
                      <Input
                        value={cell}
                        onChange={(e) => updateCell(0, ci, e.target.value, true)}
                        placeholder={`Header ${ci + 1}`}
                      />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeColumn(ci)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="ghost" size="icon" onClick={addColumn}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {data.rows.map((row, ri) => (
                <div key={ri} className="mb-2 flex items-center gap-2">
                  {row.map((cell, ci) => (
                    <Input
                      key={`${ri}-${ci}`}
                      value={cell}
                      onChange={(e) => updateCell(ri, ci, e.target.value)}
                      className="min-w-[7rem]"
                      placeholder={`R${ri + 1}C${ci + 1}`}
                    />
                  ))}
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(ri)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus className="mr-2 h-4 w-4" />
                Add row
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Preview</Label>
            <TableRenderer data={data} />
          </div>
        </div>

        <DialogFooter className="border-t px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onInsert(data);
              onOpenChange(false);
            }}
          >
            {initialData ? "Save table" : "Insert table"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
