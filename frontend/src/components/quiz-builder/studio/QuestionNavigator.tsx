import { useMemo, useState, useRef, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Copy,
  Trash2,
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import type { QuizQuestion, QuizSection } from "@/lib/quizBuilder/types";
import { TYPE_LABELS } from "@/lib/quizBuilder/types";
import { getQuestionMeta } from "@/lib/quizBuilder/quizStudioMetrics";
import { questionContentPreview } from "@/components/media/contentPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const CARD_H = 108;
const VIRTUAL_THRESHOLD = 60;

interface QuestionNavigatorProps {
  questions: QuizQuestion[];
  sections: QuizSection[];
  selectedId: string | null;
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onOpenAddModal: () => void;
  onScrollToQuestion: (id: string) => void;
}

export function QuestionNavigator({
  questions,
  sections,
  selectedId,
  selectedIds,
  onSelect,
  onToggleSelect,
  onDuplicate,
  onDelete,
  onReorder,
  onOpenAddModal,
  onScrollToQuestion,
}: QuestionNavigatorProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(500);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const enriched = useMemo(
    () => questions.map((q, index) => ({ q, index, ...getQuestionMeta(q) })),
    [questions]
  );

  const filtered = useMemo(() => {
    let list = enriched;
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.q.text.toLowerCase().includes(s) ||
          e.q.tags.some((t) => t.toLowerCase().includes(s))
      );
    }
    if (typeFilter) list = list.filter((e) => e.q.type === typeFilter);
    if (statusFilter) list = list.filter((e) => e.status === statusFilter);
    return list;
  }, [enriched, search, typeFilter, statusFilter]);

  const useVirtual = filtered.length > VIRTUAL_THRESHOLD;
  const totalH = filtered.length * CARD_H;
  const startIdx = useVirtual ? Math.max(0, Math.floor(scrollTop / CARD_H) - 3) : 0;
  const endIdx = useVirtual ? Math.min(filtered.length, Math.ceil((scrollTop + viewportH) / CARD_H) + 3) : filtered.length;
  const visible = filtered.slice(startIdx, endIdx);
  const offsetY = startIdx * CARD_H;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  };

  const handleCardClick = (id: string) => {
    onSelect(id);
    onScrollToQuestion(id);
  };

  const groupedBySection = useMemo(() => {
    if (!sections.length) return [{ section: null as QuizSection | null, items: filtered }];
    const groups: Array<{ section: QuizSection | null; items: typeof filtered }> = [];
    for (const sec of sections) {
      groups.push({
        section: sec,
        items: filtered.filter((e) => e.q.sectionId === sec.id),
      });
    }
    const unsectioned = filtered.filter((e) => !e.q.sectionId || !sections.find((s) => s.id === e.q.sectionId));
    if (unsectioned.length) groups.push({ section: null, items: unsectioned });
    return groups;
  }, [filtered, sections]);

  const renderList = (items: typeof filtered) => {
    if (useVirtual) {
      return (
        <div style={{ height: totalH, position: "relative" }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {visible.filter((e) => items.some((i) => i.q.id === e.q.id)).map((e) => (
              <div key={e.q.id} style={{ height: CARD_H }} className="pb-2">
                <NavCard {...e} selected={selectedId === e.q.id} checked={selectedIds.has(e.q.id)} onSelect={() => handleCardClick(e.q.id)} onToggleSelect={() => onToggleSelect(e.q.id)} onDuplicate={() => onDuplicate(e.q.id)} onDelete={() => onDelete(e.q.id)} />
              </div>
            ))}
          </div>
        </div>
      );
    }
    return items.map((e) => (
      <NavCard key={e.q.id} {...e} selected={selectedId === e.q.id} checked={selectedIds.has(e.q.id)} onSelect={() => handleCardClick(e.q.id)} onToggleSelect={() => onToggleSelect(e.q.id)} onDuplicate={() => onDuplicate(e.q.id)} onDelete={() => onDelete(e.q.id)} />
    ));
  };

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-card/30">
      <div className="shrink-0 space-y-2 border-b border-border/40 p-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Questions</h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 pl-8 text-xs" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          <select className="h-7 flex-1 rounded-md border bg-background px-2 text-[10px]" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {Object.entries(TYPE_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <select className="h-7 flex-1 rounded-md border bg-background px-2 text-[10px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All status</option>
            <option value="draft">Draft</option>
            <option value="complete">Complete</option>
            <option value="needs_review">Needs review</option>
            <option value="imported">Imported</option>
          </select>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={filtered.map((e) => e.q.id)} strategy={verticalListSortingStrategy}>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2" onScroll={() => scrollRef.current && setScrollTop(scrollRef.current.scrollTop)}>
            {sections.length === 0 ? (
              <div className="space-y-2">{renderList(filtered)}</div>
            ) : (
              groupedBySection.map(({ section, items }) => {
                if (!items.length) return null;
                const collapsed = section && collapsedSections.has(section.id);
                return (
                  <div key={section?.id || "none"} className="mb-3">
                    {section && (
                      <button type="button" className="mb-2 flex w-full items-center gap-1 rounded-lg bg-muted/40 px-2 py-1.5 text-left text-xs font-semibold" onClick={() => setCollapsedSections((prev) => {
                        const next = new Set(prev);
                        if (next.has(section.id)) next.delete(section.id); else next.add(section.id);
                        return next;
                      })}>
                        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {section.title}
                        <Badge variant="secondary" className="ml-auto text-[9px]">{items.length}</Badge>
                      </button>
                    )}
                    {!collapsed && <div className="space-y-2">{renderList(items)}</div>}
                  </div>
                );
              })
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* Sticky Add Question — always visible */}
      <div className="shrink-0 border-t border-border/40 bg-card/95 p-3 backdrop-blur-sm">
        <Button className="h-12 w-full text-base font-semibold shadow-lg" size="lg" onClick={onOpenAddModal}>
          <Plus className="mr-2 h-5 w-5" />
          Add Question
        </Button>
      </div>
    </div>
  );
}

function NavCard({
  q,
  index,
  status,
  completion,
  hasErrors,
  meta,
  selected,
  checked,
  onSelect,
  onToggleSelect,
  onDuplicate,
  onDelete,
}: {
  q: QuizQuestion;
  index: number;
  status: string;
  completion: number;
  hasErrors: boolean;
  meta: Record<string, unknown>;
  selected: boolean;
  checked: boolean;
  onSelect: () => void;
  onToggleSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative rounded-xl border p-3 transition-all",
        selected ? "border-primary bg-primary/8 shadow-md ring-1 ring-primary/25" : "border-border/50 bg-card hover:border-primary/30 hover:shadow-sm",
        isDragging && "opacity-60"
      )}
    >
      <div className="flex gap-2">
        <Checkbox checked={checked} onCheckedChange={onToggleSelect} className="mt-0.5" onClick={(e) => e.stopPropagation()} />
        <button type="button" className="cursor-grab text-muted-foreground" {...attributes} {...listeners} onClick={(e) => e.stopPropagation()}>
          <GripVertical className="h-4 w-4" />
        </button>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-bold text-primary">Q{index + 1}</span>
            <span className="text-[10px] font-medium text-muted-foreground">{completion}%</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug">
            {questionContentPreview(q.text)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge variant="secondary" className="max-w-full truncate text-[9px] px-1 py-0">{shortTypeLabel(q.type)}</Badge>
            <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize">{status.replace("_", " ")}</Badge>
            <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize">{q.difficulty || "med"}</Badge>
            {hasErrors && <Badge variant="destructive" className="text-[9px] px-1 py-0">!</Badge>}
            {Boolean(meta.importSource) && <Badge className="text-[9px] px-1 py-0 bg-blue-500/15 text-blue-700">Import</Badge>}
            {Boolean(meta.aiGenerated) && <Sparkles className="h-3 w-3 text-violet-500" />}
          </div>
          <div className="mt-1 flex gap-2 text-[9px] text-muted-foreground">
            <span>{q.estimatedSeconds || 45}s</span>
            {q.tags[0] && <span>#{q.tags[0]}</span>}
          </div>
        </button>
      </div>
      <div className="absolute right-2 top-2 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onDuplicate(); }}><Copy className="h-3 w-3" /></Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}><Trash2 className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}

function shortTypeLabel(type: string): string {
  const map: Record<string, string> = {
    multiple_choice: "MCQ",
    multiple_select: "MSQ",
    true_false: "T/F",
    fill_blank: "Fill",
    short_answer: "Short",
    essay: "Essay",
    numerical: "Num",
    matching: "Match",
    ordering: "Order",
    sequence: "Seq",
    poll: "Poll",
    coding: "Code",
    debugging: "Debug",
    predict_output: "Output",
    sql: "SQL",
  };
  return map[type] || type.slice(0, 8);
}
