import { useState, useMemo } from "react";
import { parseFaqItems } from "@/content/docs/docsManifest";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function HelpFaqPage() {
  const items = useMemo(() => parseFaqItems(), []);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [category, setCategory] = useState<string | "all">("all");

  const categories = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);

  const filtered = items.filter((item) => {
    const matchCat = category === "all" || item.category === category;
    const matchQ = !query || item.question.toLowerCase().includes(query.toLowerCase()) || item.answer.toLowerCase().includes(query.toLowerCase());
    return matchCat && matchQ;
  });

  const openItem = items.find((i) => i.id === openId);
  const related = openItem
    ? items.filter((i) => i.category === openItem.category && i.id !== openItem.id).slice(0, 4)
    : [];

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Frequently Asked Questions</h1>
      <p className="text-muted-foreground text-sm mb-6">Auto-generated from THE GATEHUB documentation.</p>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search FAQ..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <button type="button" onClick={() => setCategory("all")} className={cn("text-xs px-3 py-1 rounded-full border", category === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border")}>All</button>
        {categories.map((c) => (
          <button key={c} type="button" onClick={() => setCategory(c)} className={cn("text-xs px-3 py-1 rounded-full border", category === c ? "bg-primary text-primary-foreground border-primary" : "border-border")}>{c}</button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((item) => (
          <div key={item.id} className="border border-border rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50"
              onClick={() => setOpenId(openId === item.id ? null : item.id)}
            >
              <span className="font-medium text-sm pr-4">{item.question}</span>
              {openId === item.id ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
            </button>
            {openId === item.id && (
              <div className="px-4 pb-4 text-sm text-muted-foreground whitespace-pre-wrap border-t border-border pt-3">
                {item.answer}
                <p className="text-xs mt-2 text-primary/70">Category: {item.category}</p>
                {related.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-border/50">
                    <p className="text-xs font-semibold text-foreground mb-2">Related questions</p>
                    <ul className="space-y-1">
                      {related.map((r) => (
                        <li key={r.id}>
                          <button type="button" className="text-xs text-primary hover:underline text-left" onClick={() => setOpenId(r.id)}>
                            {r.question}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
