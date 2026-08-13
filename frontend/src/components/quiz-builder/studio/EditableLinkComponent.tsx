import { useState, useEffect } from "react";
import { Link as LinkIcon, Plus, Trash2, Globe } from "lucide-react";
import { QuizSection } from "@/components/quiz-builder/studio/QuizSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface HyperlinkData {
  id?: string;
  text: string;
  url: string;
}

interface EditableLinkComponentProps {
  question?: Record<string, any>;
  meta: Record<string, any>;
  updateMeta: (patch: Record<string, any>) => void;
}

export function EditableLinkComponent({ question, meta, updateMeta }: EditableLinkComponentProps) {
  const safeQ = question || {};
  const rawLinks =
    meta.hyperlinks ||
    meta.hyperlink ||
    safeQ.hyperlinks ||
    safeQ.hyperlink ||
    safeQ.metadata?.hyperlinks;

  const getInitialLinks = (): HyperlinkData[] => {
    if (Array.isArray(rawLinks) && rawLinks.length > 0) {
      return rawLinks.map((l: any, i: number) => {
        if (typeof l === "string") return { id: `link-${i}`, text: l, url: l };
        return {
          id: l.id || `link-${i}`,
          text: l.text || l.label || l.url || "Link",
          url: l.url || l.href || "",
        };
      });
    }
    if (typeof rawLinks === "string" && rawLinks.trim()) {
      return [{ id: "link-0", text: rawLinks.trim(), url: rawLinks.trim() }];
    }
    return [{ id: "link-0", text: "Reference Link", url: "https://example.com" }];
  };

  const [links, setLinks] = useState<HyperlinkData[]>(getInitialLinks);

  useEffect(() => {
    setLinks(getInitialLinks());
  }, [JSON.stringify(rawLinks)]);

  const saveLinks = (next: HyperlinkData[]) => {
    setLinks(next);
    updateMeta({
      hyperlinks: next,
      hyperlink: next[0] || null,
    });
  };

  const updateLink = (index: number, patch: Partial<HyperlinkData>) => {
    const next = [...links];
    next[index] = { ...next[index]!, ...patch };
    saveLinks(next);
  };

  const addLink = () => {
    const next = [...links, { id: `link-${Date.now()}`, text: "", url: "" }];
    saveLinks(next);
  };

  const deleteLink = (index: number) => {
    if (links.length <= 1) {
      updateMeta({ hyperlinks: null, hyperlink: null });
      return;
    }
    const next = links.filter((_, i) => i !== index);
    saveLinks(next);
  };

  return (
    <QuizSection
      title="Native Editable Link Component"
      description="Preserves hyperlinked references with editable visible text and destination URL."
      action={
        <Button type="button" variant="outline" size="sm" onClick={addLink} className="h-8 gap-1 rounded-full text-xs">
          <Plus className="h-3.5 w-3.5" />
          Add Link
        </Button>
      }
    >
      <div className="space-y-3">
        {links.map((link, idx) => (
          <div key={link.id || idx} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto] items-center rounded-xl border border-border/60 bg-card p-2.5">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary shrink-0" />
              <Input
                value={link.text}
                onChange={(e) => updateLink(idx, { text: e.target.value })}
                placeholder="Visible Text (e.g. Official Documentation)"
                className="h-8 text-xs font-semibold"
              />
            </div>
            <Input
              value={link.url}
              onChange={(e) => updateLink(idx, { url: e.target.value })}
              placeholder="https://..."
              className="h-8 text-xs font-mono text-muted-foreground"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
              onClick={() => deleteLink(idx)}
              title="Delete Link"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </QuizSection>
  );
}
