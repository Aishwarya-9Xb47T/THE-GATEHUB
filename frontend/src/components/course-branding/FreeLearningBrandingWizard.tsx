import { useState, useEffect, useRef } from "react";
import { Loader2, ArrowRight, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BannerStudio } from "./BannerStudio";
import { categoryFallbackBanner } from "@/lib/courseBranding/bannerApi";
import { matchTemplateToCategory } from "@/lib/courseBranding/templates";
import type { BannerType } from "@/lib/courseBranding/types";

export interface FreeLearningBrandingData {
  title: string;
  description: string;
  bannerUrl: string;
  thumbnailUrl: string;
  bannerType: BannerType;
  bannerId?: string;
}

interface FreeLearningBrandingWizardProps {
  contentType?: "free-learning-course" | "free-learning-resource";
  initial?: Partial<FreeLearningBrandingData> & {
    selectedTemplateId?: string;
    selectedSourceId?: string;
  };
  submitLabel?: string;
  onSubmit: (data: FreeLearningBrandingData) => Promise<void>;
  onCancel?: () => void;
}

const DEFAULT_CATEGORY = "Technology";

export function FreeLearningBrandingWizard({
  contentType = "free-learning-course",
  initial,
  submitLabel = "Continue to Editor",
  onSubmit,
  onCancel,
}: FreeLearningBrandingWizardProps) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [bannerUrl, setBannerUrl] = useState(initial?.bannerUrl || "");
  const [thumbnailUrl, setThumbnailUrl] = useState(initial?.thumbnailUrl || initial?.bannerUrl || "");
  const [bannerType, setBannerType] = useState<BannerType>(initial?.bannerType || "upload");
  const [bannerId, setBannerId] = useState(initial?.bannerId);
  const [selectedTemplateId, setSelectedTemplateId] = useState(initial?.selectedTemplateId);
  const [selectedSourceId, setSelectedSourceId] = useState(initial?.selectedSourceId);
  const [loading, setLoading] = useState(false);
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bannerManuallySet = useRef(!!initial?.bannerUrl);
  const fallbackRequest = useRef(0);

  const isResource = contentType === "free-learning-resource";
  const detailsTitle = isResource ? "Resource Details" : "Course Details";
  const detailsDescription = isResource
    ? "Define how your free learning resource appears across THE GATE HUB"
    : "Define how your free learning course appears across THE GATE HUB";

  useEffect(() => {
    if (bannerManuallySet.current || bannerUrl) return;

    const reqId = ++fallbackRequest.current;
    const timer = setTimeout(async () => {
      setFallbackLoading(true);
      const res = await categoryFallbackBanner(DEFAULT_CATEGORY);
      if (reqId !== fallbackRequest.current) return;
      setFallbackLoading(false);
      if (res.data?.data?.bannerUrl) {
        setBannerUrl(res.data.data.bannerUrl);
        setThumbnailUrl(res.data.data.thumbnailUrl || res.data.data.bannerUrl);
        setBannerType("template");
        setBannerId(res.data.data.bannerId);
        const matched = matchTemplateToCategory(DEFAULT_CATEGORY);
        if (matched) setSelectedTemplateId(matched.id);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [bannerUrl]);

  const handleBannerChange = (selection: {
    bannerUrl: string;
    thumbnailUrl: string;
    bannerType: BannerType;
    bannerId?: string;
    selectedTemplateId?: string;
    selectedSourceId?: string;
  }) => {
    if (selection.bannerUrl) bannerManuallySet.current = true;
    setBannerUrl(selection.bannerUrl);
    setThumbnailUrl(selection.thumbnailUrl);
    setBannerType(selection.bannerType);
    setBannerId(selection.bannerId);
    setSelectedTemplateId(selection.selectedTemplateId);
    setSelectedSourceId(selection.selectedSourceId);
  };

  const canSubmit = title.trim().length > 0 && bannerUrl;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    let finalBanner = bannerUrl;
    let finalThumb = thumbnailUrl || bannerUrl;
    let finalType = bannerType;
    let finalBannerId = bannerId;

    if (!finalBanner) {
      const res = await categoryFallbackBanner(DEFAULT_CATEGORY);
      if (res.data?.data?.bannerUrl) {
        finalBanner = res.data.data.bannerUrl;
        finalThumb = res.data.data.thumbnailUrl || finalBanner;
        finalType = "template";
        finalBannerId = res.data.data.bannerId;
      }
    }

    if (!finalBanner) {
      setError("Please select a banner before continuing");
      setLoading(false);
      return;
    }

    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        bannerUrl: finalBanner,
        thumbnailUrl: finalThumb,
        bannerType: finalType,
        bannerId: finalBannerId,
      });
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to save branding");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{detailsTitle}</CardTitle>
          <CardDescription>{detailsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fl-title">{isResource ? "Resource Title *" : "Course Title *"}</Label>
            <Input
              id="fl-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isResource ? "Interactive Python Tutorial" : "Master React in 10 Days"}
              className="transition-shadow focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fl-description">Short Description</Label>
            <Textarea
              id="fl-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What learners will achieve..."
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-primary" />
            Banner Studio *
          </CardTitle>
          <CardDescription>
            Select a banner before continuing — required for publishing
            {fallbackLoading && (
              <span className="ml-2 inline-flex items-center gap-1 text-primary">
                <Loader2 className="w-3 h-3 animate-spin" /> Suggesting category banner…
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BannerStudio
            bannerUrl={bannerUrl}
            thumbnailUrl={thumbnailUrl}
            bannerType={bannerType}
            bannerId={bannerId}
            selectedTemplateId={selectedTemplateId}
            selectedSourceId={selectedSourceId}
            onChange={handleBannerChange}
            title={title}
            subtitle={description}
            categoryName={DEFAULT_CATEGORY}
            defaultTab={!bannerUrl ? "template" : undefined}
          />
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3 justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Back
          </Button>
        )}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          className="min-w-[200px] shadow-md"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowRight className="w-4 h-4 mr-2" />}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
