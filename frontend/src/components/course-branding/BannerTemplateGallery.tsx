import { useEffect, useMemo, useState } from "react";
import { Loader2, Check } from "lucide-react";
import { BANNER_TEMPLATES, TEMPLATE_CATEGORIES, type BannerTemplate, matchTemplateToCategory } from "@/lib/courseBranding/types";
import { importBanner, preloadBannerImage } from "@/lib/courseBranding/bannerApi";
import { BannerImage } from "./BannerImage";
import { cn } from "@/lib/utils";

interface BannerTemplateGalleryProps {
  selectedTemplateId?: string;
  categoryHint?: string;
  onSelect: (bannerUrl: string, thumbnailUrl: string, meta?: { bannerId?: string; templateId?: string }) => void;
}

export function BannerTemplateGallery({
  selectedTemplateId,
  categoryHint,
  onSelect,
}: BannerTemplateGalleryProps) {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [importing, setImporting] = useState<string | null>(null);
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(selectedTemplateId || null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (activeCategory === "All") return BANNER_TEMPLATES;
    return BANNER_TEMPLATES.filter((t) => t.templateCategory === activeCategory);
  }, [activeCategory]);

  const sorted = useMemo(() => {
    if (!categoryHint) return filtered;
    const hint = categoryHint.toLowerCase();
    return [...filtered].sort((a, b) => {
      const score = (t: BannerTemplate) => {
        let s = 0;
        if (t.category.toLowerCase().includes(hint) || hint.includes(t.category.toLowerCase())) s += 3;
        if (t.label.toLowerCase().includes(hint) || hint.includes(t.label.toLowerCase())) s += 2;
        if (t.templateCategory.toLowerCase().includes(hint)) s += 1;
        return s;
      };
      return score(b) - score(a);
    });
  }, [filtered, categoryHint]);

  const recommendedCategory = useMemo(() => {
    if (!categoryHint) return null;
    const matched = matchTemplateToCategory(categoryHint);
    return matched?.templateCategory ?? null;
  }, [categoryHint]);

  useEffect(() => {
    if (recommendedCategory) setActiveCategory(recommendedCategory);
  }, [recommendedCategory]);

  const applyTemplate = async (tpl: BannerTemplate) => {
    setImporting(tpl.id);
    setError(null);
    setAppliedTemplateId(tpl.id);
    preloadBannerImage(tpl.previewUrl);
    onSelect(tpl.previewUrl, tpl.thumbnailUrl, { templateId: tpl.id });

    const res = await importBanner(tpl.previewUrl, "template", tpl.category);
    setImporting(null);
    if (res.error) {
      setError(`${res.error} — preview is still selected; save may use the template image URL.`);
      return;
    }
    const data = res.data?.data;
    if (data?.bannerUrl) {
      preloadBannerImage(data.bannerUrl);
      onSelect(data.bannerUrl, data.thumbnailUrl || data.bannerUrl, {
        bannerId: data.bannerId,
        templateId: tpl.id,
      });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {BANNER_TEMPLATES.length} premium templates curated for THE GATE HUB learning domains
        {categoryHint && (
          <span className="block text-primary mt-1">
            Recommended for <strong>{categoryHint}</strong> — matching topics shown first
          </span>
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        {["All", ...TEMPLATE_CATEGORIES].map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full border transition-all duration-200",
              activeCategory === cat
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border hover:border-primary/50 hover:bg-primary/5"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1 scroll-smooth">
        {sorted.map((tpl) => {
          const selected = appliedTemplateId === tpl.id || selectedTemplateId === tpl.id;
          return (
            <button
              key={tpl.id}
              type="button"
              disabled={!!importing}
              onClick={() => applyTemplate(tpl)}
              className={cn(
                "relative rounded-xl overflow-hidden border-2 text-left transition-all duration-200",
                selected
                  ? "border-primary ring-2 ring-primary/40 shadow-[0_0_24px_hsl(var(--primary)/0.2)]"
                  : "border-transparent hover:border-primary/40 hover:scale-[1.01]"
              )}
            >
              <div className="aspect-[16/9] relative">
                <BannerImage
                  src={tpl.thumbnailUrl}
                  alt={tpl.label}
                  className="w-full h-full object-cover"
                />
                <div className={cn("absolute inset-0 bg-gradient-to-t opacity-75", tpl.gradient)} />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-white font-semibold text-sm drop-shadow-md">{tpl.label}</p>
                  <p className="text-white/80 text-xs">{tpl.templateCategory}</p>
                </div>
                {importing === tpl.id && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-white" />
                  </div>
                )}
                {selected && !importing && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">
                    <Check className="w-3 h-3" /> Selected
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  );
}
