import { useState, useEffect } from "react";
import { List, ListOrdered, Plus, Trash2, GripVertical } from "lucide-react";
import { QuizSection } from "@/components/quiz-builder/studio/QuizSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ListData {
  id?: string;
  style: "ordered" | "unordered";
  items: string[];
}

interface EditableListComponentProps {
  question?: Record<string, any>;
  meta: Record<string, any>;
  updateMeta: (patch: Record<string, any>) => void;
}

export function EditableListComponent({ question, meta, updateMeta }: EditableListComponentProps) {
  const safeQ = question || {};
  const rawList =
    meta.lists ||
    meta.list ||
    safeQ.lists ||
    safeQ.list ||
    safeQ.metadata?.lists;

  const getInitialList = (): ListData => {
    if (Array.isArray(rawList) && rawList.length > 0) {
      const first = rawList[0];
      if (typeof first === "object" && first !== null) {
        return {
          style: first.style === "ordered" ? "ordered" : "unordered",
          items: Array.isArray(first.items) ? first.items : ["Item 1"],
        };
      }
      return {
        style: "unordered",
        items: rawList.map((item: any) => (typeof item === "string" ? item : String(item.text || item))),
      };
    }
    if (typeof rawList === "string" && rawList.trim()) {
      const lines = rawList.split("\n").map((l) => l.replace(/^[-\*\d\.\)\s]+/, "").trim()).filter(Boolean);
      return { style: "unordered", items: lines.length ? lines : ["Item 1"] };
    }
    return { style: "unordered", items: ["List item 1", "List item 2"] };
  };

  const [listData, setListData] = useState<ListData>(getInitialList);

  useEffect(() => {
    setListData(getInitialList());
  }, [JSON.stringify(rawList)]);

  const saveList = (next: ListData) => {
    setListData(next);
    updateMeta({
      lists: [next],
      list: next,
    });
  };

  const updateItem = (index: number, value: string) => {
    const nextItems = [...listData.items];
    nextItems[index] = value;
    saveList({ ...listData, items: nextItems });
  };

  const addItem = (atIndex?: number) => {
    const nextItems = [...listData.items];
    if (atIndex !== undefined) {
      nextItems.splice(atIndex + 1, 0, "");
    } else {
      nextItems.push("");
    }
    saveList({ ...listData, items: nextItems });
  };

  const deleteItem = (index: number) => {
    if (listData.items.length <= 1) {
      updateMeta({ lists: null, list: null });
      return;
    }
    const nextItems = listData.items.filter((_, i) => i !== index);
    saveList({ ...listData, items: nextItems });
  };

  const toggleStyle = () => {
    const nextStyle = listData.style === "ordered" ? "unordered" : "ordered";
    saveList({ ...listData, style: nextStyle });
  };

  return (
    <QuizSection
      title="Native Editable List Component"
      description="Preserves ordered & bulleted lists as independent items. Not flattened paragraphs."
      action={
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleStyle}
            className="h-8 gap-1 rounded-full text-xs"
            title="Toggle Bulleted / Numbered Style"
          >
            {listData.style === "ordered" ? (
              <>
                <ListOrdered className="h-3.5 w-3.5 text-primary" /> Numbered List
              </>
            ) : (
              <>
                <List className="h-3.5 w-3.5 text-primary" /> Bulleted List
              </>
            )}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addItem()} className="h-8 gap-1 rounded-full text-xs">
            <Plus className="h-3.5 w-3.5" />
            Add Item
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        {listData.items.map((itemStr, idx) => (
          <div key={idx} className="flex items-center gap-2 rounded-xl border border-border/60 bg-card p-2">
            <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
            <span className="w-6 text-center text-xs font-bold font-mono text-primary shrink-0">
              {listData.style === "ordered" ? `${idx + 1}.` : "•"}
            </span>
            <Input
              value={itemStr}
              onChange={(e) => updateItem(idx, e.target.value)}
              placeholder={`List item ${idx + 1}`}
              className="h-8 text-xs font-medium bg-transparent border-0 focus-visible:ring-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => addItem(idx)}
              title="Insert Below"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            {listData.items.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                onClick={() => deleteItem(idx)}
                title="Delete Item"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </QuizSection>
  );
}
