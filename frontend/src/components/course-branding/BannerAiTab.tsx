import { useEffect, useState } from "react";
import { Sparkles, Loader2, RefreshCw, Wand2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateBanners, preloadBannerImage, resolveBannerSrc } from "@/lib/courseBranding/bannerApi";
import { suggestBannerKeywords } from "@/lib/courseBranding/suggestKeywords";
import { AI_BANNER_STYLES, type AiBannerStyle } from "@/lib/courseBranding/types";
import { BannerImage, BannerSkeletonGrid } from "./BannerImage";
import { BannerStudioHealth } from "./BannerStudioHealth";
import { cn } from "@/lib/utils";

interface BannerAiTabProps {
  defaultTopic?: string;
  categoryName?: string;
  selectedUrl?: string;
  selectedBannerId?: string;
  onSelect: (bannerUrl: string, thumbnailUrl: string, meta?: { bannerId?: string }) => void;
}

export function BannerAiTab({
  defaultTopic = "",
  categoryName,
  selectedUrl,
  selectedBannerId,
  onSelect,
}: BannerAiTabProps) {
  const [topic, setTopic] = useState(defaultTopic);
  const [style, setStyle] = useState<AiBannerStyle>("professional");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<Array<{ bannerUrl: string; thumbnailUrl: string; bannerId?: string }>>([]);
  const [pickedId, setPickedId] = useState<string | null>(selectedBannerId || null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);

  useEffect(() => {
    if (defaultTopic && !topic) setTopic(defaultTopic);
  }, [defaultTopic]);

  const suggestions = suggestBannerKeywords(defaultTopic, categoryName);

  const runGenerate = async (mode: "fresh" | "variation" | "enhance" = "fresh") => {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setNotice(null);

    let prompt = topic.trim();
    if (mode === "variation") prompt = `${topic.trim()} — creative variation, alternate composition`;
    if (mode === "enhance") prompt = `${topic.trim()} — enhanced premium quality, richer detail, cinematic lighting`;

    const res = await generateBanners(prompt, style, categoryName);
    setLoading(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    const payload = res.data;
    const banners = payload?.images || payload?.data?.banners || [];
    const warnings = payload?.warnings || payload?.data?.warnings || [];
    const usedProvider = payload?.provider || payload?.data?.provider;

    if (!banners.length) {
      setError("No banner images could be generated. Check Banner Studio Health below.");
      return;
    }

    if (warnings.length) {
      setNotice(warnings.join(" "));
    }
    if (usedProvider) {
      setProvider(usedProvider);
    }

    banners.forEach((b) => preloadBannerImage(b.bannerUrl));
    setOptions(banners);
    if (mode === "fresh" && banners[0]) {
      setPickedId(banners[0].bannerId || banners[0].bannerUrl);
      onSelect(banners[0].bannerUrl, banners[0].thumbnailUrl || banners[0].bannerUrl, {
        bannerId: banners[0].bannerId,
      });
    }
  };

  const pickOption = (opt: { bannerUrl: string; thumbnailUrl: string; bannerId?: string }) => {
    setPickedId(opt.bannerId || opt.bannerUrl);
    onSelect(opt.bannerUrl, opt.thumbnailUrl || opt.bannerUrl, { bannerId: opt.bannerId });
  };

  const isActive = (opt: { bannerUrl: string; bannerId?: string }) =>
    pickedId === (opt.bannerId || opt.bannerUrl) ||
    selectedBannerId === opt.bannerId ||
    selectedUrl === opt.bannerUrl;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Describe your banner</Label>
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Futuristic AI learning environment, neural networks, educational technology"
          className="transition-shadow focus:ring-2 focus:ring-primary/20"
        />
        <p className="text-xs text-muted-foreground">
          Landscape 16:9 · high quality · professional educational · no text in image
        </p>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {suggestions.slice(0, 5).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTopic(s)}
                className="text-[11px] px-2 py-0.5 rounded-full border border-primary/25 text-primary hover:bg-primary/10 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Style</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {AI_BANNER_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStyle(s.id)}
              className={cn(
                "rounded-lg border p-2.5 text-left transition-all text-sm",
                style === s.id
                  ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                  : "border-border hover:border-primary/40"
              )}
            >
              <p className="font-medium">{s.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{s.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => runGenerate("fresh")} disabled={loading || !topic.trim()}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
          Generate 4 options
        </Button>
        {options.length > 0 && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => runGenerate("variation")} disabled={loading}>
              <RefreshCw className="w-4 h-4 mr-1.5" /> Generate More
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => runGenerate("enhance")} disabled={loading}>
              <Wand2 className="w-4 h-4 mr-1.5" /> Enhance
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => runGenerate("fresh")} disabled={loading}>
              <RefreshCw className="w-4 h-4 mr-1.5" /> Regenerate
            </Button>
          </>
        )}
      </div>

      {loading && <BannerSkeletonGrid count={4} />}

      {options.length > 0 && !loading && (
        <div className="grid grid-cols-2 gap-3">
          {options.map((opt, i) => {
            const active = isActive(opt);
            return (
              <button
                key={opt.bannerId || `${opt.bannerUrl}-${i}`}
                type="button"
                onClick={() => pickOption(opt)}
                className={cn(
                  "relative rounded-xl overflow-hidden border-2 aspect-video transition-all duration-200 hover:scale-[1.02]",
                  active
                    ? "border-primary ring-2 ring-primary/40 shadow-[0_0_20px_hsl(var(--primary)/0.25)]"
                    : "border-border hover:border-primary/40"
                )}
              >
                <BannerImage
                  src={resolveBannerSrc(opt.bannerUrl)}
                  alt={`AI option ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                {active && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">
                    <Check className="w-3 h-3" /> Selected
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {provider && !loading && (
        <p className="text-xs text-muted-foreground">
          Source: <span className="font-medium capitalize">{provider.replace(/\+/g, " + ")}</span>
        </p>
      )}

      {notice && !error && (
        <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2">{notice}</p>
      )}

      {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}

      <BannerStudioHealth />
    </div>
  );
}
