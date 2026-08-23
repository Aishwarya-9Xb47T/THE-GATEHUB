import { useState, useEffect } from "react";
import { Upload, Search, Sparkles, LayoutGrid } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BannerUploadTab } from "./BannerUploadTab";
import { BannerSearchTab } from "./BannerSearchTab";
import { BannerAiTab } from "./BannerAiTab";
import { BannerTemplateGallery } from "./BannerTemplateGallery";
import { BannerLivePreviews } from "./BannerLivePreviews";
import { preloadBannerImage } from "@/lib/courseBranding/bannerApi";
import type { BannerType } from "@/lib/courseBranding/types";
import { cn } from "@/lib/utils";

export interface BannerSelection {
  bannerUrl: string;
  thumbnailUrl: string;
  bannerType: BannerType;
  bannerId?: string;
  selectedTemplateId?: string;
  selectedSourceId?: string;
  sourceUrl?: string;
  provider?: string;
}

interface BannerStudioProps {
  bannerUrl: string;
  thumbnailUrl: string;
  bannerType: BannerType;
  bannerId?: string;
  selectedTemplateId?: string;
  selectedSourceId?: string;
  sourceUrl?: string;
  provider?: string;
  onChange: (selection: BannerSelection) => void;
  title?: string;
  subtitle?: string;
  categoryName?: string;
  difficulty?: string;
  showPreviews?: boolean;
  defaultTab?: BannerType;
}

export function BannerStudio({
  bannerUrl,
  thumbnailUrl,
  bannerType,
  bannerId,
  selectedTemplateId,
  selectedSourceId,
  sourceUrl,
  provider,
  onChange,
  title,
  subtitle,
  categoryName,
  difficulty,
  showPreviews = true,
  defaultTab,
}: BannerStudioProps) {
  const [activeTab, setActiveTab] = useState<BannerType>(defaultTab || bannerType);

  useEffect(() => {
    if (defaultTab) setActiveTab(defaultTab);
    else setActiveTab(bannerType);
  }, [bannerType, defaultTab]);

  useEffect(() => {
    if (bannerUrl) preloadBannerImage(bannerUrl);
    if (thumbnailUrl) preloadBannerImage(thumbnailUrl);
  }, [bannerUrl, thumbnailUrl]);

  const handleSelect = (
    url: string,
    thumb: string,
    type: BannerType,
    meta?: { bannerId?: string; templateId?: string; sourceId?: string; sourceUrl?: string; provider?: string }
  ) => {
    onChange({
      bannerUrl: url,
      thumbnailUrl: thumb || url,
      bannerType: type,
      bannerId: meta?.bannerId,
      selectedTemplateId: meta?.templateId,
      selectedSourceId: meta?.sourceId,
      sourceUrl: meta?.sourceUrl,
      provider: meta?.provider,
    });
  };

  const switchTab = (tab: BannerType) => {
    setActiveTab(tab);
    onChange({
      bannerUrl,
      thumbnailUrl,
      bannerType: tab,
      bannerId,
      selectedTemplateId,
      selectedSourceId,
      sourceUrl,
      provider,
    });
  };

  return (
    <div className={showPreviews ? "grid lg:grid-cols-5 gap-6" : ""}>
      <div className={showPreviews ? "lg:col-span-3" : ""}>
        {bannerUrl && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm animate-in fade-in-50">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">✓</span>
            <span className="font-medium text-primary">Banner selected</span>
            <span className="text-muted-foreground text-xs ml-auto capitalize">{bannerType} source</span>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => switchTab(v as BannerType)} className="w-full">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full mb-4 h-auto p-1 bg-muted/50">
            {(
              [
                { value: "upload", icon: Upload, label: "Upload" },
                { value: "search", icon: Search, label: "Search" },
                { value: "ai", icon: Sparkles, label: "AI Generate" },
                { value: "template", icon: LayoutGrid, label: "Templates" },
              ] as const
            ).map(({ value, icon: Icon, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className={cn(
                  "gap-1.5 py-2.5 data-[state=active]:shadow-sm data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all"
                )}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="upload" className="mt-0 animate-in fade-in-50 duration-200">
            <BannerUploadTab
              value={bannerUrl}
              onSelect={(url, thumb, meta) => handleSelect(url, thumb, "upload", meta)}
            />
          </TabsContent>
          <TabsContent value="search" className="mt-0 animate-in fade-in-50 duration-200">
            <BannerSearchTab
              defaultQuery={title || subtitle}
              categoryName={categoryName}
              selectedUrl={bannerUrl}
              selectedSourceId={selectedSourceId}
              onSelect={(url, thumb, meta) => handleSelect(url, thumb, "search", meta)}
            />
          </TabsContent>
          <TabsContent value="ai" className="mt-0 animate-in fade-in-50 duration-200">
            <BannerAiTab
              defaultTopic={title || subtitle}
              categoryName={categoryName}
              selectedUrl={bannerUrl}
              selectedBannerId={bannerId}
              onSelect={(url, thumb, meta) => handleSelect(url, thumb, "ai", meta)}
            />
          </TabsContent>
          <TabsContent value="template" className="mt-0 animate-in fade-in-50 duration-200">
            <BannerTemplateGallery
              selectedTemplateId={selectedTemplateId}
              categoryHint={categoryName}
              onSelect={(url, thumb, meta) => handleSelect(url, thumb, "template", meta)}
            />
          </TabsContent>
        </Tabs>
      </div>

      {showPreviews && (
        <div className="lg:col-span-2">
          <BannerLivePreviews
            bannerUrl={bannerUrl}
            thumbnailUrl={thumbnailUrl}
            title={title || ""}
            subtitle={subtitle}
            categoryName={categoryName}
            difficulty={difficulty}
          />
        </div>
      )}
    </div>
  );
}
