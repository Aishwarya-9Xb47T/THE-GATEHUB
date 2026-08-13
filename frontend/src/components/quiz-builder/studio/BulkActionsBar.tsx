import { Trash2, Copy, Download, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface BulkActionsBarProps {
  count: number;
  onDelete: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onAiImprove: () => void;
  onChangeDifficulty: (d: string) => void;
  onChangeBloom: (b: string) => void;
  onClear: () => void;
}

export function BulkActionsBar({
  count,
  onDelete,
  onDuplicate,
  onExport,
  onAiImprove,
  onChangeDifficulty,
  onChangeBloom,
  onClear,
}: BulkActionsBarProps) {
  if (count === 0) return null;

  return (
    <div className="sticky bottom-4 z-20 mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-card/95 px-4 py-3 shadow-xl backdrop-blur-md">
      <Badge className="bg-primary">{count} selected</Badge>
      <Button size="sm" variant="outline" onClick={onDuplicate}><Copy className="mr-1 h-3.5 w-3.5" />Duplicate</Button>
      <Button size="sm" variant="outline" onClick={onExport}><Download className="mr-1 h-3.5 w-3.5" />Export</Button>
      <Button size="sm" variant="outline" onClick={onAiImprove}><Sparkles className="mr-1 h-3.5 w-3.5" />AI Improve</Button>
      <select className="h-8 rounded-md border bg-background px-2 text-xs" onChange={(e) => e.target.value && onChangeDifficulty(e.target.value)}>
        <option value="">Difficulty…</option>
        <option value="easy">Easy</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
      </select>
      <select className="h-8 rounded-md border bg-background px-2 text-xs" onChange={(e) => e.target.value && onChangeBloom(e.target.value)}>
        <option value="">Bloom…</option>
        {["L1", "L2", "L3", "L4", "L5", "L6"].map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
      <Button size="sm" variant="destructive" onClick={onDelete}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>
      <Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>
    </div>
  );
}
