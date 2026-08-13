import { useState, useEffect, useRef, useMemo } from "react";
import { Loader2, ArrowRight, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { BannerStudio } from "./BannerStudio";
import { categoryFallbackBanner } from "@/lib/courseBranding/bannerApi";
import { suggestBannerKeywords } from "@/lib/courseBranding/suggestKeywords";
import { matchTemplateToCategory } from "@/lib/courseBranding/templates";
import {
  DIFFICULTY_OPTIONS,
  type BannerType,
  type CourseBrandingData,
} from "@/lib/courseBranding/types";
import { formatINR } from "@/lib/paymentUtils";

interface Category {
  id: string;
  name: string;
}

interface CourseBrandingWizardProps {
  initial?: Partial<CourseBrandingData> & { selectedTemplateId?: string; selectedSourceId?: string };
  submitLabel?: string;
  /** Show price field for premium courses (INR). */
  showPrice?: boolean;
  onSubmit: (data: CourseBrandingData) => Promise<void>;
  onCancel?: () => void;
}

export function CourseBrandingWizard({
  initial,
  submitLabel = "Continue to Authoring Studio",
  showPrice = false,
  onSubmit,
  onCancel,
}: CourseBrandingWizardProps) {
  const [title, setTitle] = useState(initial?.title || "");
  const [subtitle, setSubtitle] = useState(initial?.subtitle || "");
  const [description, setDescription] = useState(initial?.description || initial?.subtitle || "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId || "");
  const [difficulty, setDifficulty] = useState(initial?.difficulty || "Beginner");
  const [price, setPrice] = useState(
    typeof initial?.price === "number" && initial.price >= 0 ? String(initial.price) : ""
  );
  const [bannerUrl, setBannerUrl] = useState(initial?.bannerUrl || "");
  const [thumbnailUrl, setThumbnailUrl] = useState(initial?.thumbnailUrl || initial?.bannerUrl || "");
  const [bannerType, setBannerType] = useState<BannerType>(initial?.bannerType || "upload");
  const [bannerId, setBannerId] = useState(initial?.bannerId);
  const [selectedTemplateId, setSelectedTemplateId] = useState(initial?.selectedTemplateId);
  const [selectedSourceId, setSelectedSourceId] = useState(initial?.selectedSourceId);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bannerManuallySet = useRef(!!initial?.bannerUrl);
  const fallbackRequest = useRef(0);

  useEffect(() => {
    api<{ success: boolean; categories: Category[] }>("/categories").then((res) => {
      if (res.data?.categories) setCategories(res.data.categories);
    });
  }, []);

  const categoryName = categories.find((c) => c.id === categoryId)?.name || initial?.categoryName;

  const titleSuggestions = useMemo(
    () => suggestBannerKeywords(title, categoryName),
    [title, categoryName]
  );

  useEffect(() => {
    if (!categoryName || bannerManuallySet.current || bannerUrl) return;

    const reqId = ++fallbackRequest.current;
    const timer = setTimeout(async () => {
      setFallbackLoading(true);
      const res = await categoryFallbackBanner(categoryName);
      if (reqId !== fallbackRequest.current) return;
      setFallbackLoading(false);
      if (res.data?.data?.bannerUrl) {
        setBannerUrl(res.data.data.bannerUrl);
        setThumbnailUrl(res.data.data.thumbnailUrl || res.data.data.bannerUrl);
        setBannerType("template");
        setBannerId(res.data.data.bannerId);
        const matched = matchTemplateToCategory(categoryName);
        if (matched) setSelectedTemplateId(matched.id);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [categoryName, bannerUrl]);

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

  const canSubmit =
    title.trim().length > 0 &&
    categoryId &&
    bannerUrl &&
    (!showPrice || (price.trim() !== "" && Number(price) >= 0 && !Number.isNaN(Number(price))));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    let finalBanner = bannerUrl;
    let finalThumb = thumbnailUrl || bannerUrl;
    let finalType = bannerType;
    let finalBannerId = bannerId;

    if (!finalBanner && categoryName) {
      const res = await categoryFallbackBanner(categoryName);
      if (res.data?.data?.bannerUrl) {
        finalBanner = res.data.data.bannerUrl;
        finalThumb = res.data.data.thumbnailUrl || finalBanner;
        finalType = "template";
        finalBannerId = res.data.data.bannerId;
      }
    }

    if (!finalBanner) {
      setError("Please select a banner before continuing to Academic Studio");
      setLoading(false);
      return;
    }

    try {
      await onSubmit({
        title: title.trim(),
        subtitle: subtitle.trim(),
        description: description.trim() || subtitle.trim(),
        categoryId,
        categoryName,
        difficulty,
        ...(showPrice ? { price: Math.max(0, Number(price) || 0) } : {}),
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
          <CardTitle>Course Details</CardTitle>
          <CardDescription>Define how your learning path appears across THE GATE HUB</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Course Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="AI and Machine Learning Mastery"
              className="transition-shadow focus:ring-2 focus:ring-primary/20"
            />
            {titleSuggestions.length > 0 && title.trim() && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[10px] text-muted-foreground w-full">Banner suggestions:</span>
                {titleSuggestions.slice(0, 6).map((s) => (
                  <span
                    key={s}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-primary/5 text-primary border border-primary/20"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="subtitle">Subtitle</Label>
            <Input id="subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="From foundations to production-ready models" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Short Description</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What learners will achieve..." />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIFFICULTY_OPTIONS.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {showPrice && (
            <div className="space-y-2">
              <Label htmlFor="price">Course Price (INR) *</Label>
              <Input
                id="price"
                type="number"
                min={0}
                step={1}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 499"
              />
              <p className="text-xs text-muted-foreground">
                Students see this at checkout. Use 0 for free enrollment.
                {price.trim() !== "" && Number(price) > 0 && !Number.isNaN(Number(price)) && (
                  <span className="ml-1 font-medium text-foreground">
                    Preview: {formatINR(Number(price))}
                  </span>
                )}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-primary" />
            Banner Studio *
          </CardTitle>
          <CardDescription>
            Select a banner before continuing — required for Academic Studio
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
            subtitle={subtitle}
            categoryName={categoryName}
            difficulty={difficulty}
            defaultTab={categoryName && !bannerUrl ? "template" : undefined}
          />
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3 justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>Back</Button>
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
