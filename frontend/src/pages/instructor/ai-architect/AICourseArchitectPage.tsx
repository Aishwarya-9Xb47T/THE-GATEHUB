import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { BannerStudio } from "@/components/course-branding/BannerStudio";
import type { BannerType } from "@/lib/courseBranding/types";
import { api, apiFormData } from "@/lib/api";
import { useToastStore } from "@/store/toastStore";
import { parseProductType, productTypeLabel, PRODUCT_TYPES, getAcademicStudioPath } from "@/lib/productTypes";
import { saveBrandingSession } from "@/lib/courseBranding/types";
import {
  type AICourseArchitectInterview,
  type ArchitectBlueprint,
  type ArchitectQualityReport,
  type ArchitectValidationReport,
  type CurriculumResearchReport,
  type VideoMapping,
  type LessonStructureId,
  type LearningStyleId,
  type TeachingStyleId,
  COURSE_TYPE_OPTIONS,
  COURSE_SCALE_OPTIONS,
  LEARNING_STYLE_OPTIONS,
  TEACHING_STYLE_OPTIONS,
  LESSON_STRUCTURE_OPTIONS,
  PRACTICAL_COMPONENT_OPTIONS,
  ASSESSMENT_STYLE_OPTIONS,
  ASSESSMENT_METHOD_OPTIONS,
  createDefaultInterview,
  GENERATION_STAGES,
  LEARNING_COMPONENT_OPTIONS,
  PROGRESSION_OPTIONS,
  RESEARCH_DEPTH_OPTIONS,
  VIDEO_STRATEGY_OPTIONS,
  VIDEO_PLACEMENT_OPTIONS,
  UPLOAD_VIDEO_ACCEPT,
  WIZARD_STEPS,
  STUDENT_BACKGROUND_OPTIONS,
  LEARNING_GOAL_OPTIONS,
  PREFERRED_LANGUAGE_OPTIONS,
  CONTENT_DEPTH_OPTIONS,
  buildDifficultyPreview,
  isValidYouTubeUrl,
  normalizeYouTubeWatchUrl,
} from "./aiCourseArchitectTypes";
import { fetchYouTubeOEmbed, extractYouTubeId, youTubeThumbnailUrl, type YouTubeOEmbed } from "@/lib/videoSourceUtils";

function mergePendingYouTubeDraft(
  interview: AICourseArchitectInterview,
  youtubeDraft: string,
  youtubePreview: YouTubeOEmbed | null
): { interview: AICourseArchitectInterview; flushed: boolean } {
  const url = normalizeYouTubeWatchUrl(youtubeDraft.trim());
  if (!url || !isValidYouTubeUrl(url)) {
    return { interview, flushed: false };
  }

  const duplicate = interview.videoStrategy.mappings.some(
    (m) => m.type === "youtube" && normalizeYouTubeWatchUrl(m.url || "") === url
  );
  if (duplicate) {
    return { interview, flushed: false };
  }

  const mapping: VideoMapping = {
    type: "youtube",
    url,
    title: youtubePreview?.title || `YouTube Video ${interview.videoStrategy.mappings.length + 1}`,
    order: interview.videoStrategy.mappings.length,
  };

  const method = interview.videoStrategy.method;
  const nextMethod =
    method === "add-later" || method === "local-uploads"
      ? "youtube-urls"
      : method === "youtube-urls"
        ? "youtube-urls"
        : "both";

  return {
    interview: {
      ...interview,
      learningComponents: interview.learningComponents.includes("Video Lessons")
        ? interview.learningComponents
        : [...interview.learningComponents, "Video Lessons"],
      videoStrategy: {
        ...interview.videoStrategy,
        includeVideos: true,
        method: nextMethod,
        mappings: [...interview.videoStrategy.mappings, mapping],
      },
    },
    flushed: true,
  };
}

function DifficultyCurveVisual({ interview }: { interview: AICourseArchitectInterview }) {
  const curve = buildDifficultyPreview(interview, 40);
  const colors = { beginner: "bg-green-500", intermediate: "bg-amber-500", advanced: "bg-red-500" };
  const counts = {
    beginner: curve.filter((c) => c === "beginner").length,
    intermediate: curve.filter((c) => c === "intermediate").length,
    advanced: curve.filter((c) => c === "advanced").length,
  };
  const total = curve.length || 1;
  return (
    <div className="space-y-3">
      <div className="flex h-8 rounded-lg overflow-hidden border">
        {curve.map((tier, i) => (
          <div key={i} className={`flex-1 ${colors[tier]}`} title={tier} />
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500" /> Beginner {Math.round((counts.beginner / total) * 100)}%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500" /> Intermediate {Math.round((counts.intermediate / total) * 100)}%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500" /> Advanced {Math.round((counts.advanced / total) * 100)}%</span>
      </div>
    </div>
  );
}

function ChipToggle({ label, selected, onToggle }: { label: string; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
        selected ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 border-border hover:border-primary/50"
      }`}
    >
      {label}
    </button>
  );
}

function ListInput({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          placeholder={placeholder || "Add and press Enter"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              onChange([...items, draft.trim()]);
              setDraft("");
            }
          }}
        />
        <Button type="button" variant="outline" onClick={() => { if (draft.trim()) { onChange([...items, draft.trim()]); setDraft(""); } }}>
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <Badge key={i} variant="secondary" className="gap-1">
            {item}
            <button type="button" className="ml-1 hover:text-destructive" onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function AICourseArchitectPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const productType = parseProductType(searchParams.get("productType"));
  const toast = useToastStore((s) => s.add);

  const [step, setStep] = useState(0);
  const [interview, setInterview] = useState<AICourseArchitectInterview>(() => ({
    ...createDefaultInterview(productType),
    productType,
  }));

  useEffect(() => {
    setInterview((prev) => (prev.productType === productType ? prev : { ...prev, productType }));
  }, [productType]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; subcategories?: Array<{ id: string; name: string }> }>>([]);
  const [blueprint, setBlueprint] = useState<ArchitectBlueprint | null>(null);
  const [researchReport, setResearchReport] = useState<CurriculumResearchReport | null>(null);
  const [qualityReport, setQualityReport] = useState<ArchitectQualityReport | null>(null);
  const [curriculumValidation, setCurriculumValidation] = useState<ArchitectQualityReport | null>(null);
  const [blueprintApproved, setBlueprintApproved] = useState(false);
  const [validationReport, setValidationReport] = useState<ArchitectValidationReport | null>(null);
  const [loadingBlueprint, setLoadingBlueprint] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState(0);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStageMessage, setJobStageMessage] = useState<string>("");
  const [jobProgress, setJobProgress] = useState<number>(0);
  const [jobError, setJobError] = useState<string | null>(null);
  const [youtubeDraft, setYoutubeDraft] = useState("");
  const [youtubePreview, setYoutubePreview] = useState<YouTubeOEmbed | null>(null);
  const [youtubePreviewLoading, setYoutubePreviewLoading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const [bannerUrl, setBannerUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [bannerType, setBannerType] = useState<BannerType>("upload");
  const [bannerId, setBannerId] = useState<string | undefined>(undefined);
  const [bannerSourceId, setBannerSourceId] = useState<string | undefined>(undefined);
  const [bannerSourceUrl, setBannerSourceUrl] = useState<string | undefined>(undefined);
  const [bannerProvider, setBannerProvider] = useState<string | undefined>(undefined);

  const architectBanner = bannerUrl
    ? {
        bannerUrl,
        thumbnailUrl: thumbnailUrl || bannerUrl,
        bannerType,
        bannerId,
        sourceId: bannerSourceId,
        sourceUrl: bannerSourceUrl,
        provider: bannerProvider || (bannerType === "search" ? "pexels" : bannerType),
      }
    : undefined;

  useEffect(() => {
    api<{ categories: typeof categories }>("/categories").then((res) => {
      if (res.data?.categories) setCategories(res.data.categories);
    });

    api<{ data: any }>("/ai-architect/jobs/active/me").then((res) => {
      const activeJob = res.data?.data;
      if (activeJob && (activeJob.status === "RUNNING" || activeJob.status === "QUEUED" || activeJob.status === "RETRYING")) {
        setActiveJobId(activeJob.id);
        setGenerating(true);
        setJobStageMessage(activeJob.stageMessage || "Generation in progress...");
        setJobProgress(activeJob.progress || 10);
        setStep(11);
      }
    }).catch(() => {});
  }, []);

  const backPath =
    productType === PRODUCT_TYPES.PREMIUM_COURSE ? "/instructor/courses/new"
      : productType === PRODUCT_TYPES.FREE_COURSE ? "/manage-courses/new"
        : "/instructor/learning-universe/new";

  const toggleArray = (arr: string[], item: string) => arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
  const toggleComponent = (c: string) =>
    setInterview((prev) => ({
      ...prev,
      learningComponents: toggleArray(prev.learningComponents, c),
    }));

  const toggleLessonStructure = (id: LessonStructureId) =>
    setInterview((prev) => ({
      ...prev,
      lessonStructure: prev.lessonStructure.includes(id)
        ? prev.lessonStructure.filter((x) => x !== id)
        : [...prev.lessonStructure, id],
    }));

  const toggleLearningStyle = (id: LearningStyleId) =>
    setInterview((prev) => ({
      ...prev,
      learningStyle: prev.learningStyle.includes(id)
        ? prev.learningStyle.filter((x) => x !== id)
        : [...prev.learningStyle, id],
    }));

  const toggleTeachingStyle = (id: TeachingStyleId) =>
    setInterview((prev) => ({
      ...prev,
      teachingStyle: prev.teachingStyle.includes(id)
        ? prev.teachingStyle.filter((x) => x !== id)
        : [...prev.teachingStyle, id],
    }));

  const togglePractical = (c: string) =>
    setInterview((prev) => ({
      ...prev,
      practicalComponents: toggleArray(prev.practicalComponents, c),
    }));

  const validateStep = (stepIndex = step): boolean => {
    if (stepIndex === 0 && (!interview.courseInfo.title.trim() || !interview.courseInfo.subject.trim())) {
      toast({ title: "Required", description: "Course title and subject are required.", variant: "destructive" });
      return false;
    }
    if (stepIndex === 8 && !bannerUrl) {
      toast({ title: "Banner required", description: "Select or generate a banner before continuing.", variant: "destructive" });
      return false;
    }
    if (stepIndex === 5 && interview.lessonStructure.length === 0) {
      toast({ title: "Lesson structure", description: "Select at least one lesson component template.", variant: "destructive" });
      return false;
    }
    if (stepIndex === 3 && interview.courseScale.id === "custom") {
      const hasLessonCount = !!interview.courseScale.customLessonCount;
      const hasModuleSplit =
        !!interview.courseScale.customModuleCount && !!interview.courseScale.customLessonsPerModule;
      if (!hasLessonCount && !hasModuleSplit) {
        toast({
          title: "Custom scale",
          description: "Enter target lesson count OR preferred modules × lessons per module.",
          variant: "destructive",
        });
        return false;
      }
    }
    if (stepIndex === 8) {
      const draft = youtubeDraft.trim();
      if (draft && !isValidYouTubeUrl(normalizeYouTubeWatchUrl(draft))) {
        toast({
          title: "Invalid YouTube URL",
          description: "Fix the YouTube link or clear the field before continuing.",
          variant: "destructive",
        });
        return false;
      }
    }
    return true;
  };

  const applyPendingYouTubeDraft = useCallback((): AICourseArchitectInterview => {
    const { interview: merged, flushed } = mergePendingYouTubeDraft(interview, youtubeDraft, youtubePreview);
    if (flushed) {
      setInterview(merged);
      setYoutubeDraft("");
      setYoutubePreview(null);
      toast({
        title: "YouTube video added",
        description: merged.videoStrategy.mappings[merged.videoStrategy.mappings.length - 1]?.title,
        variant: "success",
      });
    }
    return merged;
  }, [interview, youtubeDraft, youtubePreview, toast]);

  const goToStep = useCallback(
    async (target: number) => {
      if (generating || loadingBlueprint) return;
      const clamped = Math.max(0, Math.min(target, WIZARD_STEPS.length - 1));
      if (clamped === step) return;

      if (clamped >= 10 && !blueprint) {
        toast({
          title: "Blueprint required",
          description: "Complete Research & Plan Curriculum first.",
          variant: "destructive",
        });
        setStep(9);
        return;
      }
      if (clamped === 11 && !blueprintApproved) {
        toast({
          title: "Approval required",
          description: "Approve the curriculum blueprint before generating.",
          variant: "destructive",
        });
        setStep(10);
        return;
      }

      setStep(clamped);
    },
    [generating, loadingBlueprint, step, blueprint, blueprintApproved, toast]
  );

  const handlePrevious = () => {
    if (generating || loadingBlueprint) return;
    setStep((s) => Math.max(0, s - 1));
  };

  const fetchBlueprint = useCallback(async () => {
    setLoadingBlueprint(true);
    const activeInterview = applyPendingYouTubeDraft();
    const payload = {
      ...activeInterview,
      productType,
      banner: architectBanner,
    };
    console.info("[AI Architect] blueprint request", {
      hasBanner: Boolean(architectBanner?.bannerUrl),
      bannerType: architectBanner?.bannerType || null,
      hasSourceUrl: Boolean(architectBanner?.sourceUrl),
      hasBannerId: Boolean(architectBanner?.bannerId),
    });
    try {
      const res = await api<{
        data: {
          blueprint: ArchitectBlueprint;
          qualityReport: ArchitectQualityReport;
          research?: CurriculumResearchReport;
          curriculumValidation?: ArchitectQualityReport;
        };
      }>(
        "/ai-architect/blueprint",
        { method: "POST", body: { interview: payload } }
      );
      if (res.error) throw new Error(res.error);
      setBlueprint(res.data?.data?.blueprint ?? null);
      setResearchReport(res.data?.data?.research ?? res.data?.data?.blueprint?.researchReport ?? null);
      setQualityReport(res.data?.data?.qualityReport ?? null);
      setCurriculumValidation(res.data?.data?.curriculumValidation ?? null);
      setBlueprintApproved(false);
    } catch (e: any) {
      const msg = String((e as Error)?.message || "Blueprint failed");
      toast({
        title: /gemini/i.test(msg) ? "Gemini blueprint generation failed" : "Blueprint failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoadingBlueprint(false);
    }
  }, [applyPendingYouTubeDraft, architectBanner, toast, productType]);

  const handleNext = async () => {
    if (!validateStep()) return;
    if (step === 8) {
      applyPendingYouTubeDraft();
      setInterview((prev) => ({
        ...prev,
        banner: architectBanner,
      }));
      setStep(9);
      await fetchBlueprint();
      return;
    }
    if (step === 9) {
      if (!blueprint) {
        await fetchBlueprint();
        return;
      }
      setStep(10);
      return;
    }
    if (step === 10) {
      if (!blueprintApproved) {
        toast({ title: "Approval required", description: "Check the approval box to continue.", variant: "destructive" });
        return;
      }
      const structureFailed = curriculumValidation && !curriculumValidation.passed;
      if (structureFailed) {
        toast({
          title: "Structure mismatch",
          description: "Curriculum does not match your requested structure. Regenerate the blueprint before continuing.",
          variant: "destructive",
        });
        return;
      }
      setStep(11);
      return;
    }
    setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  };

  const nextButtonLabel =
    step === 8
      ? "Research & Plan Curriculum"
      : step === 9
        ? blueprint
          ? "Review Blueprint"
          : loadingBlueprint
            ? "Planning..."
            : "Start Research"
        : step === 10
          ? "Continue to Generation"
          : "Continue";

  const stepAccessible = (index: number) => {
    if (index <= 9) return true;
    if (index === 10) return Boolean(blueprint);
    if (index === 11) return Boolean(blueprint) && blueprintApproved;
    return false;
  };

  useEffect(() => {
    const url = youtubeDraft.trim();
    if (!url || !isValidYouTubeUrl(url)) {
      setYoutubePreview(null);
      return;
    }
    const timer = setTimeout(async () => {
      setYoutubePreviewLoading(true);
      const meta = await fetchYouTubeOEmbed(url);
      setYoutubePreview(meta);
      setYoutubePreviewLoading(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [youtubeDraft]);

  const addYouTubeVideo = () => {
    const url = normalizeYouTubeWatchUrl(youtubeDraft.trim());
    if (!url) return;
    if (!isValidYouTubeUrl(url)) {
      toast({ title: "Invalid URL", description: "Use youtu.be, youtube.com/watch, embed, or shorts links.", variant: "destructive" });
      return;
    }
    const mapping: VideoMapping = {
      type: "youtube",
      url,
      title: youtubePreview?.title || `YouTube Video ${interview.videoStrategy.mappings.length + 1}`,
    };
    setInterview((prev) => ({
      ...prev,
      learningComponents: prev.learningComponents.includes("Video Lessons")
        ? prev.learningComponents
        : [...prev.learningComponents, "Video Lessons"],
      videoStrategy: {
        ...prev.videoStrategy,
        includeVideos: true,
        method: prev.videoStrategy.method === "add-later" || prev.videoStrategy.method === "local-uploads"
          ? "youtube-urls"
          : prev.videoStrategy.method === "youtube-urls" ? "youtube-urls" : "both",
        mappings: [...prev.videoStrategy.mappings, { ...mapping, order: prev.videoStrategy.mappings.length }],
      },
    }));
    setYoutubeDraft("");
    setYoutubePreview(null);
    toast({
      title: "YouTube video added",
      description: mapping.title,
      variant: "success",
    });
  };

  const uploadSingleVideoFile = async (file: File): Promise<VideoMapping> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiFormData<{ url?: string; success?: boolean; data?: { url?: string } }>("/upload", fd);
    const rawUrl = res.data?.url || res.data?.data?.url;
    if (res.error || !rawUrl) {
      throw new Error(res.error || `Upload failed for ${file.name}`);
    }
    const cleanFile = rawUrl.replace(/^.*\/uploads\//, "").replace(/^uploads\//, "");
    return {
      type: "upload",
      file: cleanFile,
      url: rawUrl.startsWith("/") ? rawUrl : `/uploads/${cleanFile}`,
      title: file.name.replace(/\.[^.]+$/, ""),
      mimeType: file.type || "video/mp4",
      size: file.size,
    };
  };

  const handleVideoUpload = async (file: File) => {
    setUploadingVideo(true);
    try {
      const mapping = await uploadSingleVideoFile(file);
      setInterview((prev) => ({
        ...prev,
        learningComponents: prev.learningComponents.includes("Video Lessons")
          ? prev.learningComponents
          : [...prev.learningComponents, "Video Lessons"],
        videoStrategy: {
          ...prev.videoStrategy,
          includeVideos: true,
          method:
            prev.videoStrategy.method === "add-later" || prev.videoStrategy.method === "youtube-urls"
              ? "local-uploads"
              : prev.videoStrategy.method === "local-uploads"
                ? "local-uploads"
                : "both",
          mappings: [...prev.videoStrategy.mappings, { ...mapping, order: prev.videoStrategy.mappings.length }],
        },
      }));
      toast({ title: "Video uploaded", description: mapping.title, variant: "success" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleVideoUploadMultiple = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    setUploadingVideo(true);
    const uploadedMappings: VideoMapping[] = [];
    const failedFiles: string[] = [];

    for (const file of files) {
      try {
        const mapping = await uploadSingleVideoFile(file);
        uploadedMappings.push(mapping);
      } catch (err: any) {
        failedFiles.push(file.name);
      }
    }

    if (uploadedMappings.length > 0) {
      setInterview((prev) => {
        const currentCount = prev.videoStrategy.mappings.length;
        const newMappings = uploadedMappings.map((m, idx) => ({ ...m, order: currentCount + idx }));
        return {
          ...prev,
          learningComponents: prev.learningComponents.includes("Video Lessons")
            ? prev.learningComponents
            : [...prev.learningComponents, "Video Lessons"],
          videoStrategy: {
            ...prev.videoStrategy,
            includeVideos: true,
            method:
              prev.videoStrategy.method === "add-later" || prev.videoStrategy.method === "youtube-urls"
                ? "local-uploads"
                : prev.videoStrategy.method === "local-uploads"
                  ? "local-uploads"
                  : "both",
            mappings: [...prev.videoStrategy.mappings, ...newMappings],
          },
        };
      });

      toast({
        title: `${uploadedMappings.length} video${uploadedMappings.length > 1 ? "s" : ""} uploaded`,
        variant: "success",
      });
    }

    if (failedFiles.length > 0) {
      toast({
        title: "Some uploads failed",
        description: `Failed to upload: ${failedFiles.join(", ")}`,
        variant: "destructive",
      });
    }

    setUploadingVideo(false);
  };

  const pollJobStatus = useCallback(async (jobId: string) => {
    try {
      const res = await api<{ data: any }>(`/ai-architect/jobs/${jobId}`);
      if (res.error) throw new Error(res.error);
      const job = res.data?.data;
      if (!job) return;

      if (job.stageMessage) setJobStageMessage(job.stageMessage);
      if (typeof job.progress === "number") setJobProgress(job.progress);

      // Map progress to generation stage UI index
      const stageIdx = Math.min(
        GENERATION_STAGES.length - 1,
        Math.floor((job.progress / 100) * GENERATION_STAGES.length)
      );
      setGenerationStage(stageIdx);

      if (job.status === "COMPLETED" && job.resultData?.universeId) {
        setGenerating(false);
        setGenerationStage(GENERATION_STAGES.length - 1);
        const data = job.resultData;

        setValidationReport(data.validationReport ?? null);
        saveBrandingSession({
          title: interview.courseInfo.title,
          subtitle: interview.courseInfo.subtitle || "",
          description: blueprint?.description || "",
          categoryId: interview.courseInfo.categoryId || "",
          categoryName: interview.courseInfo.categoryName,
          difficulty: interview.courseInfo.difficulty,
          price: productType === PRODUCT_TYPES.PREMIUM_COURSE ? interview.courseInfo.price ?? 0 : undefined,
          bannerUrl: bannerUrl || "",
          thumbnailUrl: thumbnailUrl || bannerUrl || "",
          bannerType,
          universeId: data.universeId,
          productType,
        });

        toast({
          title: "Course generated successfully",
          description: `${data.moduleCount || 1} modules, ${data.lessonCount || 1} lessons — opening Academic Studio.`,
          variant: "success",
        });

        await new Promise((r) => setTimeout(r, 600));
        navigate(getAcademicStudioPath(data.universeId, productType));
        return;
      }

      if (job.status === "FAILED") {
        setGenerating(false);
        const errMsg = job.errorMessage || "Course generation failed. Please resume or retry.";
        setJobError(errMsg);
        toast({
          title: "Generation failed",
          description: errMsg,
          variant: "destructive",
        });
        return;
      }

      if (job.status === "RUNNING" || job.status === "QUEUED" || job.status === "RETRYING") {
        setTimeout(() => pollJobStatus(jobId), 1000);
      }
    } catch (err: any) {
      console.warn("[AI Architect] job poll error:", err);
      setTimeout(() => pollJobStatus(jobId), 2000);
    }
  }, [bannerType, bannerUrl, blueprint, interview, navigate, productType, thumbnailUrl, toast]);

  const handleGenerate = async () => {
    if (!blueprint) return;
    if (generating) {
      toast({
        title: "Generation already in progress",
        description: "Please wait for the current course generation to finish.",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    setJobError(null);
    setGenerationStage(0);
    setJobProgress(5);
    setJobStageMessage("Starting generation job...");

    const activeInterview = applyPendingYouTubeDraft();
    const payload = {
      ...activeInterview,
      productType,
      banner: architectBanner,
    };

    try {
      const res = await api<{
        data: {
          jobId: string;
          status: string;
          stageMessage?: string;
        };
      }>("/ai-architect/jobs", {
        method: "POST",
        body: { interview: payload, blueprint, approved: blueprintApproved, expectedProductType: productType },
      });

      if (res.error) throw new Error(res.error);
      const jobId = res.data?.data?.jobId;
      if (!jobId) throw new Error("No job ID received from server");

      setActiveJobId(jobId);
      setJobStageMessage(res.data?.data?.stageMessage || "Generation job created...");
      setTimeout(() => pollJobStatus(jobId), 1000);
    } catch (e: any) {
      const raw = String((e as Error)?.message || "Generation failed to start");
      setGenerating(false);
      setJobError(raw);
      toast({ title: "Generation failed", description: raw, variant: "destructive" });
    }
  };

  const handleResumeJob = async () => {
    if (!activeJobId) {
      handleGenerate();
      return;
    }
    setGenerating(true);
    setJobError(null);
    setJobStageMessage("Resuming generation from checkpoint...");
    try {
      const res = await api<{ data: any }>(`/ai-architect/jobs/${activeJobId}/resume`, { method: "POST" });
      if (res.error) throw new Error(res.error);
      setTimeout(() => pollJobStatus(activeJobId), 1000);
    } catch (e: any) {
      setGenerating(false);
      const msg = String((e as Error)?.message || "Failed to resume job");
      setJobError(msg);
      toast({ title: "Resume failed", description: msg, variant: "destructive" });
    }
  };

  const handleRetryFailedStage = async () => {
    if (!activeJobId) {
      handleGenerate();
      return;
    }
    setGenerating(true);
    setJobError(null);
    setJobStageMessage("Retrying failed stage...");
    try {
      const res = await api<{ data: any }>(`/ai-architect/jobs/${activeJobId}/retry-stage`, { method: "POST" });
      if (res.error) throw new Error(res.error);
      setTimeout(() => pollJobStatus(activeJobId), 1000);
    } catch (e: any) {
      setGenerating(false);
      const msg = String((e as Error)?.message || "Failed to retry stage");
      setJobError(msg);
      toast({ title: "Retry stage failed", description: msg, variant: "destructive" });
    }
  };

  const handleRetryEverything = async () => {
    if (!activeJobId) {
      handleGenerate();
      return;
    }
    setGenerating(true);
    setJobError(null);
    setJobStageMessage("Retrying entire generation...");
    try {
      const res = await api<{ data: any }>(`/ai-architect/jobs/${activeJobId}/retry-everything`, { method: "POST" });
      if (res.error) throw new Error(res.error);
      setTimeout(() => pollJobStatus(activeJobId), 1000);
    } catch (e: any) {
      setGenerating(false);
      const msg = String((e as Error)?.message || "Failed to restart generation");
      setJobError(msg);
      toast({ title: "Retry everything failed", description: msg, variant: "destructive" });
    }
  };

  const handleRegenerateModule = async (moduleId: string) => {
    if (!blueprint) return;
    setLoadingBlueprint(true);
    try {
      const res = await api<{ data: { blueprint: ArchitectBlueprint; qualityReport: ArchitectQualityReport } }>(
        "/ai-architect/regenerate",
        { method: "POST", body: { interview, blueprint, scope: "module", targetId: moduleId } }
      );
      if (res.error) throw new Error(res.error);
      setBlueprint(res.data?.data?.blueprint ?? blueprint);
      setQualityReport(res.data?.data?.qualityReport ?? null);
    } catch (e: any) {
      toast({ title: "Regeneration failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoadingBlueprint(false);
    }
  };

  const selectedCategory = categories.find((c) => c.id === interview.courseInfo.categoryId);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background to-muted/30">
      <div className="border-b border-border">
        <div className="w-full max-w-4xl mx-auto flex items-center gap-4 px-6 py-6 md:px-8">
          <Button variant="ghost" size="sm" onClick={() => navigate(backPath)} disabled={generating}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" /> AI Curriculum Architect
            </h1>
            <p className="text-sm text-muted-foreground">{productTypeLabel(productType)} · Instructional design engine — plan first, generate after approval</p>
          </div>
        </div>
      </div>

      <div className="w-full max-w-4xl mx-auto px-6 py-8 md:px-8 space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Wizard steps — click any section</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {WIZARD_STEPS.map((label, i) => {
              const isActive = i === step;
              const isPast = i < step;
              const accessible = stepAccessible(i);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => goToStep(i)}
                  disabled={generating || loadingBlueprint || !accessible}
                  title={!accessible ? "Complete earlier steps first" : label}
                  className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                    isActive
                      ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-sm"
                      : isPast
                        ? "border-border bg-muted/50 hover:border-primary/50 hover:bg-muted"
                        : accessible
                          ? "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
                          : "border-border/50 bg-muted/20"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isPast
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className={`text-xs leading-snug ${isActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 0: Course Identity */}
        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Course Identity</CardTitle>
              <CardDescription>Tell us about your course vision</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Course Title *</Label>
                  <Input value={interview.courseInfo.title} onChange={(e) => setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, title: e.target.value } }))} placeholder="Deep Learning Mastery" />
                </div>
                <div className="space-y-2">
                  <Label>Subtitle</Label>
                  <Input value={interview.courseInfo.subtitle || ""} onChange={(e) => setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, subtitle: e.target.value } }))} placeholder="From foundations to production" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Subject *</Label>
                  <Input value={interview.courseInfo.subject} onChange={(e) => setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, subject: e.target.value } }))} placeholder="Machine Learning" />
                </div>
                <div className="space-y-2">
                  <Label>Course Type</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={interview.courseInfo.courseType} onChange={(e) => setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, courseType: e.target.value as typeof p.courseInfo.courseType } }))}>
                    {COURSE_TYPE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={interview.courseInfo.categoryId || ""} onChange={(e) => {
                    const cat = categories.find((c) => c.id === e.target.value);
                    setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, categoryId: e.target.value, categoryName: cat?.name } }));
                  }}>
                    <option value="">Select category</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Subcategory</Label>
                  <Input value={interview.courseInfo.subcategory || ""} onChange={(e) => setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, subcategory: e.target.value } }))} placeholder={selectedCategory?.name ? `e.g. ${selectedCategory.name} advanced` : "Subcategory"} />
                </div>
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Input value={interview.courseInfo.language} onChange={(e) => setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, language: e.target.value } }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Difficulty</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={interview.courseInfo.difficulty} onChange={(e) => setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, difficulty: e.target.value as "beginner" | "intermediate" | "advanced" } }))}>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Academic Level</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={interview.courseInfo.academicLevel} onChange={(e) => setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, academicLevel: e.target.value as typeof p.courseInfo.academicLevel } }))}>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="graduate">Graduate</option>
                    <option value="expert">Expert</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Estimated Hours</Label>
                  <Input type="number" value={interview.courseInfo.estimatedHours || 40} onChange={(e) => setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, estimatedHours: parseInt(e.target.value, 10) || 40, estimatedDuration: `${e.target.value} hours` } }))} />
                </div>
              </div>
              {productType === PRODUCT_TYPES.PREMIUM_COURSE && (
                <div className="space-y-2">
                  <Label>Course Price (INR)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={interview.courseInfo.price ?? 0}
                    onChange={(e) =>
                      setInterview((p) => ({
                        ...p,
                        courseInfo: { ...p.courseInfo, price: Math.max(0, Number(e.target.value) || 0) },
                      }))
                    }
                    placeholder="e.g. 499 — use 0 for free enrollment"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Target Audience</Label>
                <Input value={interview.courseInfo.targetAudience} onChange={(e) => setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, targetAudience: e.target.value } }))} placeholder="Software engineers, data scientists..." />
              </div>
              <div className="space-y-2">
                <Label>Industry</Label>
                <Input value={interview.courseInfo.industry} onChange={(e) => setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, industry: e.target.value } }))} placeholder="Technology, Healthcare, Finance..." />
              </div>
              <ListInput label="Prerequisites" items={interview.courseInfo.prerequisites} onChange={(items) => setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, prerequisites: items } }))} />
              <ListInput label="Learning Goals" items={interview.courseInfo?.learningGoals ?? []} onChange={(items) => setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, learningGoals: items } }))} />
              <ListInput label="Expected Outcomes" items={interview.courseInfo.expectedOutcomes} onChange={(items) => setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, expectedOutcomes: items } }))} />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={interview.courseInfo.certificationEligible} onCheckedChange={(v) => setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, certificationEligible: !!v } }))} />
                Certification eligible
              </label>
            </CardContent>
          </Card>
        )}

        {/* Step 1: Audience & Background */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Target Audience & Learner Background</CardTitle>
              <CardDescription>What prior knowledge do students bring into this course?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Target Audience Description</Label>
                <Input
                  value={interview.courseInfo.targetAudience}
                  onChange={(e) => setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, targetAudience: e.target.value } }))}
                  placeholder="e.g. Computer Science undergrads, Data Analysts, Working Professionals..."
                />
              </div>

              <div>
                <Label className="mb-3 block font-semibold text-sm">Student Prerequisite Knowledge (Select all that apply)</Label>
                <div className="flex flex-wrap gap-2">
                  {STUDENT_BACKGROUND_OPTIONS.map((bg) => (
                    <ChipToggle
                      key={bg}
                      label={bg}
                      selected={(interview.studentBackground ?? []).includes(bg)}
                      onToggle={() =>
                        setInterview((p) => ({
                          ...p,
                          studentBackground: toggleArray(p.studentBackground ?? [], bg),
                        }))
                      }
                    />
                  ))}
                </div>
              </div>

              <ListInput
                label="Required Prerequisites (course syllabus prerequisites)"
                items={interview.courseInfo.prerequisites}
                onChange={(items) => setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, prerequisites: items } }))}
              />
            </CardContent>
          </Card>
        )}

        {/* Step 2: Learning Goals & Motivation */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Learning Goal & Core Motivation</CardTitle>
              <CardDescription>What is the ultimate objective students achieve by completing this course?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="mb-3 block font-semibold text-sm">Primary Learning Goal</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {LEARNING_GOAL_OPTIONS.map((goal) => (
                    <button
                      key={goal.id}
                      type="button"
                      onClick={() => setInterview((p) => ({ ...p, learningGoalType: goal.id }))}
                      className={`p-4 rounded-lg border text-left transition-colors ${
                        interview.learningGoalType === goal.id
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="font-semibold text-sm">{goal.label}</div>
                      <div className="text-xs text-muted-foreground mt-1">{goal.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <ListInput
                label="Key Learning Goals (Specific Skills)"
                items={interview.courseInfo?.learningGoals ?? []}
                onChange={(items) => setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, learningGoals: items } }))}
              />

              <ListInput
                label="Expected Tangible Outcomes (What students will build or master)"
                items={interview.courseInfo.expectedOutcomes}
                onChange={(items) => setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, expectedOutcomes: items } }))}
              />
            </CardContent>
          </Card>
        )}

        {/* Step 3: Course Scale */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Course Scale</CardTitle>
              <CardDescription>How large should this curriculum be? The architect plans tracks, modules, and lessons from this.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {COURSE_SCALE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setInterview((p) => ({
                        ...p,
                        courseScale: {
                          id: opt.id,
                          customLessonCount: p.courseScale.customLessonCount,
                          customModuleCount: p.courseScale.customModuleCount,
                          customLessonsPerModule: p.courseScale.customLessonsPerModule,
                        },
                      }))
                    }
                    className={`p-4 rounded-lg border text-left ${interview.courseScale.id === opt.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  >
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.range}</div>
                  </button>
                ))}
              </div>
              {interview.courseScale.id === "custom" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Custom lesson count (optional)</Label>
                    <Input
                      type="number"
                      min={5}
                      max={200}
                      value={interview.courseScale.customLessonCount || ""}
                      onChange={(e) =>
                        setInterview((p) => ({
                          ...p,
                          courseScale: { ...p.courseScale, customLessonCount: parseInt(e.target.value, 10) || undefined },
                        }))
                      }
                      placeholder="e.g. 35"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Or specify preferred module structure:</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Preferred modules</Label>
                      <Input
                        type="number"
                        min={2}
                        max={20}
                        value={interview.courseScale.customModuleCount || ""}
                        onChange={(e) =>
                          setInterview((p) => ({
                            ...p,
                            courseScale: { ...p.courseScale, customModuleCount: parseInt(e.target.value, 10) || undefined },
                          }))
                        }
                        placeholder="e.g. 6"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Lessons per module</Label>
                      <Input
                        type="number"
                        min={2}
                        max={15}
                        value={interview.courseScale.customLessonsPerModule || ""}
                        onChange={(e) =>
                          setInterview((p) => ({
                            ...p,
                            courseScale: {
                              ...p.courseScale,
                              customLessonsPerModule: parseInt(e.target.value, 10) || undefined,
                            },
                          }))
                        }
                        placeholder="e.g. 5"
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 4: Difficulty & Style */}
        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Difficulty & Learning Style</CardTitle>
              <CardDescription>How should difficulty progress and how should learners experience the course?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="mb-3 block">Difficulty Distribution</Label>
                <div className="flex flex-wrap gap-2 mb-4">
                  {(["percentages", "unit-counts", "ai-decides"] as const).map((mode) => (
                    <ChipToggle
                      key={mode}
                      label={mode === "percentages" ? "Percentage split" : mode === "unit-counts" ? "Unit counts" : "AI decides"}
                      selected={interview.difficultyDistribution.mode === mode}
                      onToggle={() => setInterview((p) => ({ ...p, difficultyDistribution: { ...p.difficultyDistribution, mode } }))}
                    />
                  ))}
                </div>
                {interview.difficultyDistribution.mode === "percentages" && (
                  <div className="grid grid-cols-3 gap-3">
                    {(["beginnerPercent", "intermediatePercent", "advancedPercent"] as const).map((key, i) => (
                      <div key={key} className="space-y-1">
                        <Label className="text-xs">{["Beginner %", "Intermediate %", "Advanced %"][i]}</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={interview.difficultyDistribution[key] ?? 0}
                          onChange={(e) =>
                            setInterview((p) => ({
                              ...p,
                              difficultyDistribution: { ...p.difficultyDistribution, [key]: parseInt(e.target.value, 10) || 0 },
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
                {interview.difficultyDistribution.mode === "unit-counts" && (
                  <div className="grid grid-cols-3 gap-3">
                    {(["easyUnits", "mediumUnits", "advancedUnits"] as const).map((key, i) => (
                      <div key={key} className="space-y-1">
                        <Label className="text-xs">{["Easy units", "Medium units", "Advanced units"][i]}</Label>
                        <Input
                          type="number"
                          min={0}
                          value={interview.difficultyDistribution[key] ?? 0}
                          onChange={(e) =>
                            setInterview((p) => ({
                              ...p,
                              difficultyDistribution: { ...p.difficultyDistribution, [key]: parseInt(e.target.value, 10) || 0 },
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4">
                  <Label className="mb-2 block text-xs text-muted-foreground">Difficulty progression preview</Label>
                  <DifficultyCurveVisual interview={interview} />
                </div>
              </div>
              <div>
                <Label className="mb-3 block">Learning Style</Label>
                <div className="flex flex-wrap gap-2">
                  {LEARNING_STYLE_OPTIONS.map((opt) => (
                    <ChipToggle key={opt.id} label={opt.label} selected={interview.learningStyle.includes(opt.id)} onToggle={() => toggleLearningStyle(opt.id)} />
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-3 block">Teaching Style</Label>
                <div className="flex flex-wrap gap-2">
                  {TEACHING_STYLE_OPTIONS.map((opt) => (
                    <ChipToggle key={opt.id} label={opt.label} selected={interview.teachingStyle.includes(opt.id)} onToggle={() => toggleTeachingStyle(opt.id)} />
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-3 block">Curriculum Progression</Label>
                <div className="flex flex-wrap gap-2">
                  {PROGRESSION_OPTIONS.map((opt) => (
                    <ChipToggle key={opt.id} label={opt.label} selected={interview.curriculumStrategy.progression.includes(opt.id)} onToggle={() => setInterview((p) => ({ ...p, curriculumStrategy: { ...p.curriculumStrategy, progression: toggleArray(p.curriculumStrategy.progression, opt.id) } }))} />
                  ))}
                </div>
              </div>
              <label className="flex items-start gap-3 p-4 rounded-lg border border-primary/20 bg-primary/5 cursor-pointer">
                <Checkbox checked={interview.curriculumStrategy.aiDecidesCurriculum} onCheckedChange={(v) => setInterview((p) => ({ ...p, curriculumStrategy: { ...p.curriculumStrategy, aiDecidesCurriculum: !!v } }))} />
                <div>
                  <div className="font-medium text-sm">Let AI recommend the optimal roadmap</div>
                  <div className="text-xs text-muted-foreground mt-1">Research university syllabuses, certifications, and industry standards before planning.</div>
                </div>
              </label>
              <div>
                <Label className="mb-3 block">Research Depth</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {RESEARCH_DEPTH_OPTIONS.map((opt) => (
                    <button key={opt.id} type="button" onClick={() => setInterview((p) => ({ ...p, researchDepth: opt.id as typeof p.researchDepth }))} className={`p-3 rounded-lg border text-left text-sm ${interview.researchDepth === opt.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                      <div className="font-medium">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Lesson Structure & Content Depth */}
        {step === 5 && (
          <Card>
            <CardHeader>
              <CardTitle>Lesson Structure & Content Depth</CardTitle>
              <CardDescription>Configure section templates and theoretical depth for every lesson generated.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="mb-3 block font-semibold text-sm">Content Depth & Explanation Scale</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {CONTENT_DEPTH_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setInterview((p) => ({ ...p, contentDepthPreference: opt.id }))}
                      className={`p-4 rounded-lg border text-left transition-colors ${
                        (interview.contentDepthPreference ?? "deep-dive") === opt.id
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="font-semibold text-sm">{opt.label}</div>
                      <div className="text-xs text-muted-foreground mt-1">{opt.detail}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-3 block font-semibold text-sm">Lesson Component Sections</Label>
                <div className="flex flex-wrap gap-2">
                  {LESSON_STRUCTURE_OPTIONS.map((opt) => (
                    <ChipToggle key={opt.id} label={opt.label} selected={interview.lessonStructure.includes(opt.id)} onToggle={() => toggleLessonStructure(opt.id)} />
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setInterview((p) => ({ ...p, lessonStructure: LESSON_STRUCTURE_OPTIONS.map((o) => o.id) }))}>Select All</Button>
                  <Button variant="outline" size="sm" onClick={() => setInterview((p) => ({ ...p, lessonStructure: [] }))}>Clear</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 6: Practical & Assessment */}
        {step === 6 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Practical Components</CardTitle>
                <CardDescription>Which hands-on elements should exist across the curriculum?</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {PRACTICAL_COMPONENT_OPTIONS.map((opt) => (
                    <ChipToggle key={opt} label={opt} selected={interview.practicalComponents.includes(opt)} onToggle={() => togglePractical(opt)} />
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Assessment Strategy</CardTitle>
                <CardDescription>How should learners be assessed throughout the program?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Primary assessment rhythm</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={interview.assessmentStrategy.style}
                    onChange={(e) => setInterview((p) => ({ ...p, assessmentStrategy: { ...p.assessmentStrategy, style: e.target.value } }))}
                  >
                    {ASSESSMENT_STYLE_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="mb-3 block">Assessment methods</Label>
                  <div className="flex flex-wrap gap-2">
                    {ASSESSMENT_METHOD_OPTIONS.map((opt) => (
                      <ChipToggle
                        key={opt}
                        label={opt}
                        selected={interview.assessmentStrategy.methods.includes(opt)}
                        onToggle={() =>
                          setInterview((p) => ({
                            ...p,
                            assessmentStrategy: {
                              ...p.assessmentStrategy,
                              methods: toggleArray(p.assessmentStrategy.methods, opt),
                            },
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Platform Learning Components</CardTitle>
                <CardDescription>Additional content types to generate in Academic Studio</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {LEARNING_COMPONENT_OPTIONS.map((opt) => (
                    <ChipToggle key={opt} label={opt} selected={interview.learningComponents.includes(opt)} onToggle={() => toggleComponent(opt)} />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 7: Language & Industry Context */}
        {step === 7 && (
          <Card>
            <CardHeader>
              <CardTitle>Language & Industry Context</CardTitle>
              <CardDescription>Specify programming languages and target industry domain for code examples and case studies.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Target Industry / Domain</Label>
                <Input
                  value={interview.courseInfo.industry}
                  onChange={(e) => setInterview((p) => ({ ...p, courseInfo: { ...p.courseInfo, industry: e.target.value } }))}
                  placeholder="e.g. Healthcare AI, Fintech & Trading, Robotics, Cybersecurity..."
                />
              </div>

              <div>
                <Label className="mb-3 block font-semibold text-sm">Preferred Programming Languages</Label>
                <div className="flex flex-wrap gap-2">
                  {PREFERRED_LANGUAGE_OPTIONS.map((lang) => (
                    <ChipToggle
                      key={lang}
                      label={lang}
                      selected={(interview.preferredLanguages ?? []).includes(lang)}
                      onToggle={() =>
                        setInterview((p) => ({
                          ...p,
                          preferredLanguages: toggleArray(p.preferredLanguages ?? [], lang),
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 8: Video & Banner */}
        {step === 8 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Video Strategy</CardTitle>
                <CardDescription>Instructor videos are official course content — they are embedded in lessons, preserved through publish, and shown in student preview.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Include videos in this course?</Label>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setInterview((p) => ({
                        ...p,
                        videoStrategy: { ...p.videoStrategy, includeVideos: false, mappings: [] },
                      }))}
                      className={`px-4 py-2 rounded-lg border text-sm ${interview.videoStrategy.includeVideos === false ? "border-primary bg-primary/5" : "border-border"}`}
                    >
                      No videos
                    </button>
                    <button
                      type="button"
                      onClick={() => setInterview((p) => ({
                        ...p,
                        videoStrategy: { ...p.videoStrategy, includeVideos: true, method: p.videoStrategy.method === "add-later" ? "youtube-urls" : p.videoStrategy.method },
                      }))}
                      className={`px-4 py-2 rounded-lg border text-sm ${interview.videoStrategy.includeVideos !== false ? "border-primary bg-primary/5" : "border-border"}`}
                    >
                      Yes — include videos
                    </button>
                  </div>
                </div>

                {interview.videoStrategy.includeVideos !== false && (
                  <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {VIDEO_STRATEGY_OPTIONS.filter((opt) => opt.id !== "add-later").map((opt) => (
                    <button key={opt.id} type="button" onClick={() => setInterview((p) => ({ ...p, videoStrategy: { ...p.videoStrategy, includeVideos: true, method: opt.id as typeof p.videoStrategy.method } }))} className={`p-3 rounded-lg border text-left text-sm ${interview.videoStrategy.method === opt.id ? "border-primary bg-primary/5" : "border-border"}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label>How should videos be placed?</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {VIDEO_PLACEMENT_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setInterview((p) => ({ ...p, videoStrategy: { ...p.videoStrategy, placement: opt.id } }))}
                        className={`p-3 rounded-lg border text-left ${interview.videoStrategy.placement === opt.id || (!interview.videoStrategy.placement && opt.id === "ai-auto") ? "border-primary bg-primary/5" : "border-border"}`}
                      >
                        <div className="text-sm font-medium">{opt.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                {(interview.videoStrategy.method === "youtube-urls" || interview.videoStrategy.method === "both") && (
                  <div className="space-y-2">
                    <Label>YouTube URLs</Label>
                    <div className="flex gap-2">
                      <Input placeholder="https://youtu.be/… or youtube.com/watch?v=…" value={youtubeDraft} onChange={(e) => setYoutubeDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addYouTubeVideo()} />
                      <Button type="button" onClick={addYouTubeVideo} disabled={!isValidYouTubeUrl(youtubeDraft.trim())}><Plus className="w-4 h-4" /></Button>
                    </div>
                    {youtubePreviewLoading && (
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" /> Validating link…
                      </p>
                    )}
                    {youtubePreview && isValidYouTubeUrl(youtubeDraft.trim()) && (
                      <div className="flex gap-3 p-3 rounded-lg border bg-muted/30">
                        {youtubePreview.thumbnail_url && (
                          <img src={youtubePreview.thumbnail_url} alt="" className="w-24 h-14 rounded object-cover shrink-0" />
                        )}
                        <div className="min-w-0 text-sm">
                          <p className="font-medium truncate">{youtubePreview.title}</p>
                          {youtubePreview.author_name && (
                            <p className="text-xs text-muted-foreground">{youtubePreview.author_name}</p>
                          )}
                          <p className="text-[10px] text-green-600 dark:text-green-400 mt-1">Valid YouTube link</p>
                        </div>
                      </div>
                    )}
                    {youtubeDraft.trim() && !youtubePreviewLoading && !isValidYouTubeUrl(youtubeDraft.trim()) && (
                      <p className="text-xs text-destructive">Invalid YouTube URL — check format before adding.</p>
                    )}
                  </div>
                )}
                {(interview.videoStrategy.method === "local-uploads" || interview.videoStrategy.method === "both") && (
                  <div className="space-y-2">
                    <Label>Upload Videos (multiple supported)</Label>
                    <label className="flex items-center justify-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50">
                      {uploadingVideo ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                      <span className="text-sm">{uploadingVideo ? "Uploading..." : "Drag & drop or click to upload (mp4, webm, mov, avi, mkv, m4v)"}</span>
                      <input type="file" accept={UPLOAD_VIDEO_ACCEPT} multiple className="hidden" disabled={uploadingVideo} onChange={(e) => { void handleVideoUploadMultiple(e.target.files); e.target.value = ""; }} />
                    </label>
                  </div>
                )}
                {interview.videoStrategy.mappings.length > 0 && (
                  <div className="space-y-2">
                    <Label>Video Queue ({interview.videoStrategy.mappings.length})</Label>
                    {interview.videoStrategy.mappings.map((v, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded border text-sm">
                        <Badge variant="outline">{v.type === "youtube" ? "YouTube" : "Local"}</Badge>
                        {v.type === "youtube" && v.url && extractYouTubeId(v.url) && (
                          <img
                            src={youTubeThumbnailUrl(extractYouTubeId(v.url)!)}
                            alt=""
                            className="w-12 h-8 rounded object-cover shrink-0"
                          />
                        )}
                        <span className="flex-1 truncate">{v.title || v.url || v.file}</span>
                        <Button variant="ghost" size="sm" onClick={() => setInterview((p) => ({ ...p, videoStrategy: { ...p.videoStrategy, mappings: p.videoStrategy.mappings.filter((_, j) => j !== i) } }))}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Banner Studio</CardTitle>
                <CardDescription>Course branding — required before curriculum planning</CardDescription>
              </CardHeader>
              <CardContent>
                <BannerStudio
                  bannerUrl={bannerUrl}
                  thumbnailUrl={thumbnailUrl || bannerUrl}
                  bannerType={bannerType}
                  bannerId={bannerId}
                  selectedSourceId={bannerSourceId}
                  sourceUrl={bannerSourceUrl}
                  provider={bannerProvider}
                  onChange={(sel) => {
                    setBannerUrl(sel.bannerUrl);
                    setThumbnailUrl(sel.thumbnailUrl);
                    setBannerType(sel.bannerType);
                    setBannerId(sel.bannerId);
                    setBannerSourceId(sel.selectedSourceId);
                    setBannerSourceUrl(sel.sourceUrl);
                    setBannerProvider(sel.provider);
                  }}
                  title={interview.courseInfo.title}
                  subtitle={interview.courseInfo.subtitle}
                  categoryName={interview.courseInfo.categoryName}
                  difficulty={interview.courseInfo.difficulty}
                  showPreviews
                />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 9: Research & Plan */}
        {step === 9 && (
          <Card>
            <CardContent className="py-12 flex flex-col items-center gap-4">
              {loadingBlueprint ? (
                <>
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <p className="font-medium animate-pulse">Phase 2–4: Researching university syllabuses & industry standards...</p>
                  <p className="text-sm text-muted-foreground">Planning curriculum structure — no lesson content generated yet</p>
                </>
              ) : blueprint ? (
                <>
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                  <p className="font-medium">Research complete — structural blueprint ready for your review</p>
                  {researchReport && (
                    <p className="text-xs text-muted-foreground text-center max-w-lg">
                      Sources: {researchReport.researchSources.slice(0, 3).join(", ")}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground text-center max-w-md">
                    Ready to research syllabuses and build your curriculum structure. This phase plans modules and lessons — no content is written yet.
                  </p>
                  <Button onClick={fetchBlueprint} disabled={loadingBlueprint}>
                    {loadingBlueprint ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Researching...
                      </>
                    ) : (
                      <>Start Research & Plan Curriculum</>
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 10: Blueprint Approval */}
        {step === 10 && blueprint && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{blueprint.courseTitle}</CardTitle>
                <CardDescription>{blueprint.subtitle} · {blueprint.phase === "planned" ? "Structure only — content after approval" : blueprint.phase}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="p-3 rounded-lg bg-muted/50"><div className="text-xs text-muted-foreground">Modules</div><div className="font-bold text-lg">{blueprint.modules.length}</div></div>
                  <div className="p-3 rounded-lg bg-muted/50"><div className="text-xs text-muted-foreground">Lessons</div><div className="font-bold text-lg">{blueprint.modules.reduce((n, m) => n + m.lessons.length, 0)}</div></div>
                  <div className="p-3 rounded-lg bg-muted/50"><div className="text-xs text-muted-foreground">Duration</div><div className="font-bold">{blueprint.estimatedDuration}</div></div>
                  <div className="p-3 rounded-lg bg-muted/50"><div className="text-xs text-muted-foreground">Scale</div><div className="font-bold text-sm">{blueprint.curriculumPlan?.scaleLabel ?? blueprint.difficulty}</div></div>
                </div>
                {blueprint.curriculumPlan && (
                  <div className="rounded-lg border border-border/60 p-3 text-sm space-y-2">
                    <div className="font-medium">Requested structure</div>
                    <p className="text-muted-foreground">
                      Target: {blueprint.curriculumPlan.targetLessons} lessons · {blueprint.curriculumPlan.moduleCount} modules
                      {blueprint.curriculumPlan.lessonDistribution?.length ? (
                        <> · Distribution: {blueprint.curriculumPlan.lessonDistribution.map((n, i) => `Module ${i + 1} — ${n}`).join(" · ")}</>
                      ) : null}
                    </p>
                    {blueprint.curriculumPlan.structureNote && (
                      <p className="text-amber-700 dark:text-amber-400 text-xs">{blueprint.curriculumPlan.structureNote}</p>
                    )}
                  </div>
                )}
                {curriculumValidation && !curriculumValidation.passed && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2">
                    <p className="font-medium text-destructive">Curriculum does not match your requested structure.</p>
                    <p className="text-muted-foreground">
                      Requested: {blueprint.curriculumPlan?.targetLessons ?? "?"} lessons / {blueprint.curriculumPlan?.moduleCount ?? "?"} modules
                      {" · "}
                      Generated: {blueprint.modules.reduce((n, m) => n + m.lessons.length, 0)} lessons / {blueprint.modules.length} modules
                    </p>
                    <Button variant="outline" size="sm" onClick={() => fetchBlueprint()} disabled={loadingBlueprint}>
                      <RefreshCw className="w-3.5 h-3.5 mr-1" /> Regenerate Blueprint
                    </Button>
                  </div>
                )}
                {blueprint.difficultyProgression && (
                  <p className="text-sm"><strong>Difficulty curve:</strong> {blueprint.difficultyProgression}</p>
                )}
                {blueprint.prerequisiteGraph && (
                  <p className="text-sm text-muted-foreground"><strong>Prerequisites:</strong> {blueprint.prerequisiteGraph}</p>
                )}
                {blueprint.knowledgeGraph && (
                  <p className="text-sm text-muted-foreground"><strong>Knowledge progression:</strong> {blueprint.knowledgeGraph}</p>
                )}
              </CardContent>
            </Card>
            {blueprint.academicBlueprint && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Academic Course Blueprint</CardTitle>
                  <CardDescription>Designed before lesson generation — professor-level curriculum architecture</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <p>{blueprint.academicBlueprint.courseVision}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="p-2 rounded bg-muted/50"><div className="text-xs text-muted-foreground">Projects</div><div className="font-semibold">{blueprint.academicBlueprint.projectCount}</div></div>
                    <div className="p-2 rounded bg-muted/50"><div className="text-xs text-muted-foreground">Quizzes</div><div className="font-semibold">{blueprint.academicBlueprint.quizCount}</div></div>
                    <div className="p-2 rounded bg-muted/50"><div className="text-xs text-muted-foreground">Coding labs</div><div className="font-semibold">{blueprint.academicBlueprint.codingLabs}</div></div>
                    <div className="p-2 rounded bg-muted/50"><div className="text-xs text-muted-foreground">Assignments</div><div className="font-semibold">{blueprint.academicBlueprint.assignments}</div></div>
                  </div>
                  <div>
                    <div className="font-medium mb-1">Career outcomes</div>
                    <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
                      {blueprint.academicBlueprint.careerOutcomes.slice(0, 4).map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="font-medium mb-1">Skills covered</div>
                    <div className="flex flex-wrap gap-1">
                      {blueprint.academicBlueprint.skillsCovered.slice(0, 8).map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="font-medium mb-1">Bloom&apos;s taxonomy</div>
                    <div className="space-y-1 text-muted-foreground">
                      {blueprint.academicBlueprint.bloomsTaxonomyMapping.slice(0, 4).map((b) => (
                        <div key={b.level}><strong>{b.level}:</strong> {b.objectives[0]}</div>
                      ))}
                    </div>
                  </div>
                  {blueprint.academicBlueprint.assessmentInventory.length > 0 && (
                    <div>
                      <div className="font-medium mb-1">Assessment inventory</div>
                      <div className="flex flex-wrap gap-1">
                        {blueprint.academicBlueprint.assessmentInventory.map((a) => (
                          <Badge key={a.type} variant="outline" className="text-xs">{a.type}: {a.count}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {researchReport && (
              <Card>
                <CardHeader><CardTitle className="text-base">Research Summary</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-2 text-muted-foreground">
                  <p>{researchReport.courseRationale.slice(0, 400)}…</p>
                  <div className="flex flex-wrap gap-1">
                    {researchReport.industryStandards.slice(0, 4).map((s) => (
                      <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {curriculumValidation && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    Curriculum Validation
                    <Badge variant={curriculumValidation.passed ? "default" : "destructive"}>{curriculumValidation.score}/100</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {curriculumValidation.checks.map((c) => (
                    <div key={c.id} className="flex items-start gap-2 text-sm">
                      {c.status === "pass" ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" /> : <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />}
                      <span><strong>{c.label}</strong> — {c.detail}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {qualityReport && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">AI Quality Preview <Badge variant={qualityReport.passed ? "default" : "destructive"}>{qualityReport.score}/100</Badge></CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {qualityReport.checks.map((c) => (
                    <div key={c.id} className="flex items-start gap-2 text-sm">
                      {c.status === "pass" ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" /> : <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />}
                      <span><strong>{c.label}</strong> — {c.detail}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader><CardTitle>Course Outline</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {blueprint.modules.map((mod) => (
                  <div key={mod.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex justify-between gap-2">
                      <div><div className="font-medium">{mod.title}</div><div className="text-xs text-muted-foreground">{mod.lessons.length} lessons · {mod.estimatedHours}h</div></div>
                      <Button variant="ghost" size="sm" onClick={() => handleRegenerateModule(mod.id)} disabled={loadingBlueprint}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Regenerate</Button>
                    </div>
                    <ul className="text-sm space-y-1 pl-4">{mod.lessons.map((l) => (
                      <li key={l.id} className="list-disc text-muted-foreground flex items-center gap-2">
                        {l.title}
                        {l.difficultyTier && <Badge variant="outline" className="text-[10px] py-0">{l.difficultyTier}</Badge>}
                        {l.contentStatus === "planned" && <span className="text-[10px] text-primary">planned</span>}
                      </li>
                    ))}</ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 11: Generate */}
        {step === 11 && (
          <Card>
            <CardHeader>
              <CardTitle>Generate Complete Course</CardTitle>
              <CardDescription>Phase 7–8: Professor-quality content, quality validation, LaTeX project, Academic Studio</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {generating ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-foreground">
                        Generating {blueprint?.modules.reduce((n, m) => n + m.lessons.length, 0) ?? 0} lessons…
                      </p>
                      <Badge variant="outline" className="text-xs font-semibold">
                        {jobProgress}%
                      </Badge>
                    </div>
                    {/* Real Progress Bar */}
                    <div className="w-full bg-muted rounded-full h-2 mt-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-primary to-violet-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(5, Math.min(100, jobProgress))}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />
                      {jobStageMessage || "Writing course content and building academic project..."}
                    </p>
                  </div>
                  <div className="space-y-3">
                  {GENERATION_STAGES.map((stage, i) => (
                    <div key={stage} className={`text-sm flex items-center gap-2 ${i <= generationStage ? "text-foreground" : "text-muted-foreground/40"}`}>
                      {i < generationStage ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" /> : i === generationStage ? <Loader2 className="w-4 h-4 animate-spin shrink-0 text-primary" /> : <div className="w-4 h-4 rounded-full border shrink-0" />}
                      {stage}
                      {i === generationStage && i === GENERATION_STAGES.length - 1 && (
                        <span className="text-xs text-muted-foreground ml-1">— opening Academic Studio…</span>
                      )}
                      {i === generationStage && i < GENERATION_STAGES.length - 1 && (
                        <span className="text-xs text-muted-foreground ml-1">— in progress</span>
                      )}
                    </div>
                  ))}
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Approved blueprint: <strong>{blueprint?.courseTitle}</strong> — {blueprint?.modules?.length ?? 0} modules,{" "}
                    {(blueprint?.modules ?? []).reduce((n, m) => n + (m.lessons?.length ?? 0), 0)} lessons. Content will be written to Academic Studio LaTeX project.
                  </p>
                  {jobError && (
                    <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 space-y-3">
                      <div className="flex items-start gap-2 text-sm text-destructive">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-semibold">
                            {/blueprint validation failed/i.test(jobError)
                              ? "Blueprint validation failed"
                              : "Generation interrupted"}
                          </p>
                          <p className="text-xs mt-0.5 text-muted-foreground">{jobError}</p>
                          {jobStageMessage && (
                            <p className="text-xs mt-1 text-muted-foreground">Stage: {jobStageMessage}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          className="bg-primary hover:bg-primary/90 text-xs"
                          onClick={handleResumeJob}
                        >
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Resume From Last Checkpoint
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={handleRetryFailedStage}
                        >
                          Retry Failed Stage
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-xs"
                          onClick={handleRetryEverything}
                        >
                          Retry Everything
                        </Button>
                      </div>
                    </div>
                  )}
                  {!blueprintApproved && (
                    <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm">
                      Go back to the blueprint step and approve the curriculum before generating.
                    </div>
                  )}
                  {validationReport && !validationReport.passed && (
                    <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
                      Previous validation failed: {validationReport.missingFiles.slice(0, 2).join("; ")}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground text-center">
                    Use the <strong>Generate Course</strong> button below when you are ready.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Wizard navigation — visible on every step */}
        <div className="sticky bottom-0 z-10 -mx-6 px-6 py-4 md:-mx-8 md:px-8 bg-background/95 backdrop-blur border-t border-border mt-6">
          {step === 10 && blueprint && (
            <label className={`flex items-center gap-2 text-sm mb-3 pb-3 border-b border-border/60 ${
              curriculumValidation && !curriculumValidation.passed
                ? "opacity-50 cursor-not-allowed"
                : "cursor-pointer"
            }`}>
              <Checkbox
                checked={blueprintApproved}
                disabled={Boolean(curriculumValidation && !curriculumValidation.passed)}
                onCheckedChange={(v) => setBlueprintApproved(!!v)}
              />
              I approve this curriculum blueprint — proceed to content generation
            </label>
          )}
          <div className="flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <Button
              variant="secondary"
              className="border border-border bg-card hover:bg-muted min-w-[120px]"
              onClick={handlePrevious}
              disabled={step === 0 || generating || loadingBlueprint}
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> Previous
            </Button>

            {step < WIZARD_STEPS.length - 1 ? (
              <Button
                onClick={handleNext}
                disabled={generating || loadingBlueprint}
                className="min-w-[140px]"
              >
                {nextButtonLabel}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                className="min-w-[140px] bg-gradient-to-r from-primary to-violet-600"
                onClick={handleGenerate}
                disabled={!blueprint || !blueprintApproved || generating}
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" /> Generate Course
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
