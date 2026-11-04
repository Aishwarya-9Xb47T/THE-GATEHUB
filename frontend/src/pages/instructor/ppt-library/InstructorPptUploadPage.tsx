import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  Upload,
  FileText,
  Presentation,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Plus,
  Loader2,
  FolderPlus,
  Trash2,
  ChevronDown,
  ChevronUp,
  MoveUp,
  MoveDown,
  Layers,
  Sparkles,
  BookOpen,
  Cpu,
  Brain,
  Code,
  Database,
  Globe,
  Terminal,
  HelpCircle,
  X,
  RefreshCw,
  Folder,
} from "lucide-react";
import {
  uploadPptResource,
  createTopic,
  createSubtopic,
  PPTTopic,
  PPTSubtopic,
} from "@/lib/pptLibrary/api";
import { usePptTopics, useInvalidatePptCategories } from "@/lib/pptLibrary/usePptQuery";
import { useUserStore, isAdminRole } from "@/store/userStore";
import { useToastStore } from "@/store/toastStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export interface StagedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  format: "pdf" | "pptx" | "ppt";
  title: string;
  description: string;
}

export interface SubtopicStage {
  id: string; // client id (e.g. sub-1234)
  name: string;
  description: string;
  files: StagedFile[];
  isExpanded: boolean;
}

export interface UploadStep {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "success" | "error";
  errorMessage?: string;
  progressPercent?: number;
}

const ALLOWED_EXTENSIONS = ["pdf", "pptx", "ppt"];
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

const TOPIC_ICONS = [
  { id: "Brain", label: "AI & Neural Networks", icon: Brain },
  { id: "Layers", label: "Architectures & Systems", icon: Layers },
  { id: "Cpu", label: "Hardware & Computing", icon: Cpu },
  { id: "Code", label: "Software & Coding", icon: Code },
  { id: "Database", label: "Data & Databases", icon: Database },
  { id: "Globe", label: "Web & Cloud", icon: Globe },
  { id: "Terminal", label: "DevOps & CLI", icon: Terminal },
  { id: "BookOpen", label: "General & Academic", icon: BookOpen },
];

export function InstructorPptUploadPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryTopicId = searchParams.get("topicId");

  const { user } = useUserStore();
  const toast = useToastStore((s) => s.add);

  const {
    data: topics = [],
    isLoading: loadingTopics,
    refetch: refetchTopics,
  } = usePptTopics();

  const { invalidate } = useInvalidatePptCategories();

  // Mode: "new" (default) or "existing"
  const [topicMode, setTopicMode] = useState<"new" | "existing">(
    queryTopicId ? "existing" : "new"
  );
  const [selectedExistingTopicId, setSelectedExistingTopicId] = useState(queryTopicId || "");

  // Main Topic Form (for "new")
  const [mainTopicTitle, setMainTopicTitle] = useState("");
  const [mainTopicDesc, setMainTopicDesc] = useState("");
  const [mainTopicIcon, setMainTopicIcon] = useState("Brain");

  // Main Topic Materials (Direct Upload)
  const [mainTopicFiles, setMainTopicFiles] = useState<StagedFile[]>([]);
  const [isMainDragOver, setIsMainDragOver] = useState(false);
  const mainFileInputRef = useRef<HTMLInputElement>(null);

  // Subtopics list
  const [subtopics, setSubtopics] = useState<SubtopicStage[]>([
    {
      id: `sub-${Date.now()}-1`,
      name: "",
      description: "",
      files: [],
      isExpanded: true,
    },
  ]);

  // Shared Metadata & Settings
  const [academicLevel, setAcademicLevel] = useState("Undergraduate");
  const [language, setLanguage] = useState("en");
  const [tagsInput, setTagsInput] = useState("");
  const [publishStatus, setPublishStatus] = useState<"published" | "draft">("published");

  // Publishing Pipeline State
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSteps, setPublishSteps] = useState<UploadStep[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [publishedTopicId, setPublishedTopicId] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);

  // When queryTopicId arrives or topics load, sync existing topic if requested
  useEffect(() => {
    if (queryTopicId && topics.some((t) => t.id === queryTopicId)) {
      setTopicMode("existing");
      setSelectedExistingTopicId(queryTopicId);
    }
  }, [queryTopicId, topics]);

  // Derived chosen topic object if existing
  const existingTopic = useMemo(
    () => topics.find((t) => t.id === selectedExistingTopicId),
    [topics, selectedExistingTopicId]
  );

  // Helper: validate and construct StagedFile object
  const validateAndStageFile = (file: File): StagedFile | null => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      toast({
        title: "Unsupported File Format",
        description: `"${file.name}" is not supported. Please upload PDF (.pdf) or PowerPoint (.pptx, .ppt) documents.`,
        variant: "destructive",
      });
      return null;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast({
        title: "File Exceeds 100 MB Limit",
        description: `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Files must be under 100 MB.`,
        variant: "destructive",
      });
      return null;
    }

    const cleanTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    const formattedTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);

    return {
      id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      file,
      name: file.name,
      size: file.size,
      format: ext as "pdf" | "pptx" | "ppt",
      title: formattedTitle,
      description: "",
    };
  };

  // Main Topic Files Handlers
  const handleMainFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const incoming = Array.from(e.target.files);
    const valid: StagedFile[] = [];
    for (const f of incoming) {
      const staged = validateAndStageFile(f);
      if (staged) valid.push(staged);
    }
    if (valid.length > 0) {
      setMainTopicFiles((prev) => [...prev, ...valid]);
      toast({
        title: "Files Added",
        description: `Added ${valid.length} material(s) directly to main topic.`,
        variant: "success",
      });
    }
    e.target.value = "";
  };

  const handleMainDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsMainDragOver(false);
    if (!e.dataTransfer.files) return;
    const incoming = Array.from(e.dataTransfer.files);
    const valid: StagedFile[] = [];
    for (const f of incoming) {
      const staged = validateAndStageFile(f);
      if (staged) valid.push(staged);
    }
    if (valid.length > 0) {
      setMainTopicFiles((prev) => [...prev, ...valid]);
    }
  };

  const removeMainFile = (fileId: string) => {
    setMainTopicFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const updateMainFileField = (fileId: string, field: "title" | "description", value: string) => {
    setMainTopicFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, [field]: value } : f))
    );
  };

  // Subtopic Operations
  const addSubtopic = () => {
    const newSub: SubtopicStage = {
      id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: "",
      description: "",
      files: [],
      isExpanded: true,
    };
    setSubtopics((prev) => [...prev, newSub]);
  };

  const removeSubtopic = (subId: string) => {
    setSubtopics((prev) => prev.filter((s) => s.id !== subId));
  };

  const toggleSubtopicExpand = (subId: string) => {
    setSubtopics((prev) =>
      prev.map((s) => (s.id === subId ? { ...s, isExpanded: !s.isExpanded } : s))
    );
  };

  const moveSubtopic = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= subtopics.length) return;
    const copy = [...subtopics];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, moved);
    setSubtopics(copy);
  };

  const updateSubtopicField = (subId: string, field: "name" | "description", value: string) => {
    setSubtopics((prev) =>
      prev.map((s) => (s.id === subId ? { ...s, [field]: value } : s))
    );
  };

  // Subtopic File Handlers
  const handleSubtopicFileSelect = (subId: string, filesList: FileList | null) => {
    if (!filesList) return;
    const incoming = Array.from(filesList);
    const valid: StagedFile[] = [];
    for (const f of incoming) {
      const staged = validateAndStageFile(f);
      if (staged) valid.push(staged);
    }
    if (valid.length > 0) {
      setSubtopics((prev) =>
        prev.map((s) => (s.id === subId ? { ...s, files: [...s.files, ...valid] } : s))
      );
    }
  };

  const removeSubtopicFile = (subId: string, fileId: string) => {
    setSubtopics((prev) =>
      prev.map((s) =>
        s.id === subId ? { ...s, files: s.files.filter((f) => f.id !== fileId) } : s
      )
    );
  };

  const updateSubtopicFileField = (
    subId: string,
    fileId: string,
    field: "title" | "description",
    val: string
  ) => {
    setSubtopics((prev) =>
      prev.map((s) =>
        s.id === subId
          ? {
              ...s,
              files: s.files.map((f) => (f.id === fileId ? { ...f, [field]: val } : f)),
            }
          : s
      )
    );
  };

  // Total stats computation
  const totalSubtopicFiles = useMemo(
    () => subtopics.reduce((acc, s) => acc + s.files.length, 0),
    [subtopics]
  );
  const totalAllFiles = mainTopicFiles.length + totalSubtopicFiles;
  const activeSubtopicsCount = useMemo(
    () => subtopics.filter((s) => s.name.trim().length > 0).length,
    [subtopics]
  );

  // Form Validation
  const validateForm = (): boolean => {
    if (topicMode === "new") {
      if (!mainTopicTitle.trim()) {
        toast({
          title: "Topic Title Required",
          description: "Please enter a title for the Main Topic (e.g. Deep Learning).",
          variant: "destructive",
        });
        return false;
      }
    } else {
      if (!selectedExistingTopicId) {
        toast({
          title: "Please Select a Topic",
          description: "Choose an existing topic to add materials and subtopics to.",
          variant: "destructive",
        });
        return false;
      }
    }

    // Check that any subtopics with files or content have a title
    for (let i = 0; i < subtopics.length; i++) {
      const s = subtopics[i];
      if (s.files.length > 0 && !s.name.trim()) {
        toast({
          title: "Subtopic Title Missing",
          description: `Subtopic #${i + 1} has ${s.files.length} attached file(s) but is missing a title.`,
          variant: "destructive",
        });
        return false;
      }
    }

    // Must have at least something to publish: direct files OR a subtopic
    if (mainTopicFiles.length === 0 && subtopics.every((s) => !s.name.trim())) {
      toast({
        title: "Nothing to Publish",
        description: "Please attach at least one main topic file or add at least one subtopic.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  // Unified Publish Pipeline Execution
  const handlePublishTopic = async () => {
    if (!validateForm()) return;

    // Filter valid subtopics that have a title
    const validSubtopics = subtopics.filter((s) => s.name.trim().length > 0);

    // Build the step plan
    const steps: UploadStep[] = [];

    // Step 1: Create or verify main topic
    const effectiveTopicName =
      topicMode === "new" ? mainTopicTitle.trim() : existingTopic?.name || "Topic";
    steps.push({
      id: "step-topic",
      label:
        topicMode === "new"
          ? `Create Main Topic "${effectiveTopicName}"`
          : `Select Topic "${effectiveTopicName}"`,
      status: "pending",
    });

    // Step 2: Main topic files upload steps
    mainTopicFiles.forEach((fileItem, idx) => {
      steps.push({
        id: `step-main-file-${fileItem.id}`,
        label: `Upload direct material (${idx + 1}/${mainTopicFiles.length}): "${fileItem.title || fileItem.name}"`,
        status: "pending",
      });
    });

    // Step 3: Subtopics creation and files upload steps
    validSubtopics.forEach((sub, subIdx) => {
      steps.push({
        id: `step-sub-${sub.id}`,
        label: `Create Subtopic (${subIdx + 1}/${validSubtopics.length}): "${sub.name.trim()}"`,
        status: "pending",
      });

      sub.files.forEach((subFile, fileIdx) => {
        steps.push({
          id: `step-sub-file-${subFile.id}`,
          label: `Upload "${sub.name}" material (${fileIdx + 1}/${sub.files.length}): "${subFile.title || subFile.name}"`,
          status: "pending",
        });
      });
    });

    setPublishSteps(steps);
    setOverallProgress(5);
    setIsPublishing(true);
    setShowProgressModal(true);
    setPublishSuccess(false);

    let activeTopicId = selectedExistingTopicId;
    let completedSteps = 0;

    const updateStep = (id: string, updates: Partial<UploadStep>) => {
      setPublishSteps((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
      );
    };

    try {
      // 1. Resolve or Create Main Topic
      updateStep("step-topic", { status: "in_progress" });
      if (topicMode === "new") {
        const created = await createTopic(
          {
            name: mainTopicTitle.trim(),
            description: mainTopicDesc.trim() || undefined,
            icon: mainTopicIcon,
          },
          true // orGet idempotent
        );
        activeTopicId = created.data.id;
      }
      updateStep("step-topic", { status: "success" });
      completedSteps++;
      setOverallProgress(Math.round((completedSteps / steps.length) * 100));

      const parsedTags = tagsInput
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      // 2. Upload Direct Main Topic Materials
      for (const item of mainTopicFiles) {
        const stepId = `step-main-file-${item.id}`;
        updateStep(stepId, { status: "in_progress" });

        const formData = new FormData();
        formData.append("file", item.file);
        formData.append("title", item.title.trim() || item.name);
        if (item.description.trim()) {
          formData.append("description", item.description.trim());
        }
        formData.append("topicId", activeTopicId);
        formData.append("subtopicId", ""); // Explicitly null/empty = direct under main topic!
        formData.append("academicLevel", academicLevel);
        formData.append("language", language);
        formData.append("tags", JSON.stringify(parsedTags));
        formData.append("status", publishStatus);

        await uploadPptResource(formData);

        updateStep(stepId, { status: "success" });
        completedSteps++;
        setOverallProgress(Math.round((completedSteps / steps.length) * 100));
      }

      // 3. Create Subtopics and Upload Their Materials
      for (const sub of validSubtopics) {
        const subStepId = `step-sub-${sub.id}`;
        updateStep(subStepId, { status: "in_progress" });

        const createdSub = await createSubtopic(
          {
            topicId: activeTopicId,
            name: sub.name.trim(),
            description: sub.description.trim() || undefined,
          },
          true // orGet idempotent
        );
        const subtopicId = createdSub.data.id;

        updateStep(subStepId, { status: "success" });
        completedSteps++;
        setOverallProgress(Math.round((completedSteps / steps.length) * 100));

        // Upload files under this subtopic
        for (const subFile of sub.files) {
          const fileStepId = `step-sub-file-${subFile.id}`;
          updateStep(fileStepId, { status: "in_progress" });

          const formData = new FormData();
          formData.append("file", subFile.file);
          formData.append("title", subFile.title.trim() || subFile.name);
          if (subFile.description.trim()) {
            formData.append("description", subFile.description.trim());
          }
          formData.append("topicId", activeTopicId);
          formData.append("subtopicId", subtopicId);
          formData.append("academicLevel", academicLevel);
          formData.append("language", language);
          formData.append("tags", JSON.stringify(parsedTags));
          formData.append("status", publishStatus);

          await uploadPptResource(formData);

          updateStep(fileStepId, { status: "success" });
          completedSteps++;
          setOverallProgress(Math.round((completedSteps / steps.length) * 100));
        }
      }

      // Invalidate queries to refresh library cache
      invalidate();
      refetchTopics();

      setPublishedTopicId(activeTopicId);
      setPublishSuccess(true);
      setOverallProgress(100);

      toast({
        title: "Topic Published Successfully!",
        description: `"${effectiveTopicName}" and all associated study materials are now live.`,
        variant: "success",
      });
    } catch (err: any) {
      console.error("[TOPIC_BUILDER] Publish error:", err);
      toast({
        title: "Publish Interrupted",
        description: err.message || "An error occurred during publication.",
        variant: "destructive",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleResetForm = () => {
    setMainTopicTitle("");
    setMainTopicDesc("");
    setMainTopicFiles([]);
    setSubtopics([
      {
        id: `sub-${Date.now()}-1`,
        name: "",
        description: "",
        files: [],
        isExpanded: true,
      },
    ]);
    setTagsInput("");
    setShowProgressModal(false);
    setPublishSuccess(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8 pb-24">
        {/* Top Navigation & Breadcrumb */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/ppt-library")}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Study Materials
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link to="/ppt-library">
                <BookOpen className="w-4 h-4" />
                Browse Library
              </Link>
            </Button>
          </div>
        </div>

        {/* Page Hero Header */}
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary mb-3">
            <FolderPlus className="w-3.5 h-3.5" />
            Unified Study Material Builder
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground tracking-tight">
            Create Topic & Upload Materials
          </h1>
          <p className="mt-2 text-muted-foreground max-w-3xl leading-relaxed">
            Build your entire learning topic in one flow: name the main topic, upload foundational lecture
            slides or notes, organize subtopics (e.g. CNN, ANN, RNN), and attach materials to each module.
          </p>
        </div>

        {/* SECTION 1: Topic Selection / Creation Mode */}
        <Card className="rounded-2xl border-border bg-card shadow-xs overflow-hidden">
          <CardHeader className="border-b border-border/50 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Layers className="w-5 h-5 text-primary" />
                  1. Main Topic
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose whether to create a brand new topic or append materials to an existing one.
                </p>
              </div>

              {/* Toggle Mode */}
              <div className="flex items-center gap-1 p-1 bg-muted rounded-xl self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setTopicMode("new")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    topicMode === "new"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  + Create New Topic
                </button>
                <button
                  type="button"
                  onClick={() => setTopicMode("existing")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    topicMode === "existing"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Add to Existing Topic
                </button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-5">
            {topicMode === "existing" ? (
              <div className="space-y-3">
                <Label htmlFor="existing-topic-select" className="text-sm font-semibold">
                  Select Existing Topic *
                </Label>
                <select
                  id="existing-topic-select"
                  value={selectedExistingTopicId}
                  onChange={(e) => setSelectedExistingTopicId(e.target.value)}
                  className="w-full h-11 px-3 text-sm rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary shadow-xs"
                >
                  <option value="">-- Choose an existing topic --</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.subtopics?.length || 0} subtopics, {t.resourceCount || 0} materials)
                    </option>
                  ))}
                </select>
                {existingTopic && (
                  <p className="text-xs text-muted-foreground">
                    {existingTopic.description || "Existing topic ready for additional subtopics and materials."}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="topic-title" className="text-sm font-semibold">
                    Main Topic Title *
                  </Label>
                  <Input
                    id="topic-title"
                    value={mainTopicTitle}
                    onChange={(e) => setMainTopicTitle(e.target.value)}
                    placeholder="e.g. Deep Learning, Computer Vision, Operating Systems"
                    className="mt-1.5 h-11 text-base rounded-xl"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="topic-desc" className="text-sm font-semibold">
                    Description
                  </Label>
                  <Textarea
                    id="topic-desc"
                    value={mainTopicDesc}
                    onChange={(e) => setMainTopicDesc(e.target.value)}
                    placeholder="Briefly describe what this topic covers, foundational prerequisites, or learning objectives..."
                    rows={2}
                    className="mt-1.5 resize-none rounded-xl"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                    Topic Category Icon
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {TOPIC_ICONS.map((item) => {
                      const IconComp = item.icon;
                      const isSelected = mainTopicIcon === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setMainTopicIcon(item.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary shadow-xs"
                              : "bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                          }`}
                        >
                          <IconComp className="w-3.5 h-3.5" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SECTION 2: Main Topic Materials (Direct Upload) */}
        <Card className="rounded-2xl border-border bg-card shadow-xs overflow-hidden">
          <CardHeader className="border-b border-border/50 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <FileText className="w-5 h-5 text-amber-500" />
                    2. Main Topic Materials (Direct Upload)
                  </CardTitle>
                  <Badge variant="secondary" className="text-[10px] font-medium">
                    Optional • Direct to Topic
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Upload materials directly under the main topic without placing them into a subtopic
                  (e.g. syllabus, foundational overview slides, comprehensive introductory notes).
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => mainFileInputRef.current?.click()}
                className="gap-1.5 text-xs h-8"
              >
                <Upload className="w-3.5 h-3.5" />
                Add Files
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-4">
            <input
              ref={mainFileInputRef}
              type="file"
              multiple
              accept=".pdf,.pptx,.ppt"
              className="hidden"
              onChange={handleMainFileSelect}
            />

            {/* Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsMainDragOver(true);
              }}
              onDragLeave={() => setIsMainDragOver(false)}
              onDrop={handleMainDrop}
              onClick={() => mainFileInputRef.current?.click()}
              className={`cursor-pointer border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                isMainDragOver
                  ? "border-primary bg-primary/5 scale-[1.005]"
                  : "border-border hover:border-primary/50 hover:bg-muted/30 bg-muted/10"
              }`}
            >
              <div className="flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-2">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  Click or drag PowerPoint (.pptx, .ppt) or PDF (.pdf) documents here
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports multiple files • Up to 100 MB per file • Stored directly under{" "}
                  <span className="font-semibold text-foreground">
                    {topicMode === "new"
                      ? mainTopicTitle || "Main Topic"
                      : existingTopic?.name || "Selected Topic"}
                  </span>
                </p>
              </div>
            </div>

            {/* Attached Main Topic Files List */}
            {mainTopicFiles.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-1">
                  <span>Direct Files to Upload ({mainTopicFiles.length})</span>
                  <span>Editable Title & Description</span>
                </div>

                <div className="space-y-2">
                  {mainTopicFiles.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl border border-border bg-card/80 hover:bg-card transition-all flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
                    >
                      <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                        <Badge
                          className={`font-mono text-[10px] font-bold uppercase shrink-0 ${
                            item.format === "pdf"
                              ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30"
                              : "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30"
                          }`}
                        >
                          .{item.format}
                        </Badge>

                        <div className="space-y-1 flex-1 min-w-0">
                          <Input
                            value={item.title}
                            onChange={(e) => updateMainFileField(item.id, "title", e.target.value)}
                            placeholder="Material Title"
                            className="h-8 text-xs font-semibold rounded-lg"
                          />
                          <Input
                            value={item.description}
                            onChange={(e) =>
                              updateMainFileField(item.id, "description", e.target.value)
                            }
                            placeholder="Optional brief description..."
                            className="h-7 text-[11px] rounded-lg text-muted-foreground"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-1 sm:pt-0">
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {(item.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeMainFile(item.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                          title="Remove File"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SECTION 3: Subtopics & Modular Materials */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
                  <Folder className="w-5 h-5 text-primary" />
                  3. Subtopics & Modules
                </h2>
                <Badge variant="outline" className="text-xs font-semibold">
                  {subtopics.length} Subtopic{subtopics.length === 1 ? "" : "s"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Organize learning materials into sequential or conceptual modules (e.g. CNN, ANN, RNN,
                Supervised Learning). Each subtopic has its own file upload area.
              </p>
            </div>

            <Button
              type="button"
              onClick={addSubtopic}
              className="gap-1.5 text-xs font-semibold h-9 rounded-xl shadow-xs self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              Add Subtopic
            </Button>
          </div>

          {/* Subtopics List */}
          {subtopics.length === 0 ? (
            <div className="p-8 rounded-2xl border-2 border-dashed border-border text-center bg-card">
              <Folder className="w-10 h-10 text-muted-foreground/60 mx-auto mb-2" />
              <p className="text-sm font-semibold text-foreground">No subtopics defined yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                You can upload materials directly under the main topic or click &ldquo;Add Subtopic&rdquo;
                to organize materials into specific categories.
              </p>
              <Button type="button" size="sm" onClick={addSubtopic} className="mt-4 gap-1 text-xs">
                <Plus className="w-3.5 h-3.5" />
                Add First Subtopic
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {subtopics.map((sub, index) => {
                const subFileInputId = `file-input-${sub.id}`;
                return (
                  <Card
                    key={sub.id}
                    className="rounded-2xl border-border bg-card shadow-xs overflow-hidden transition-all duration-200"
                  >
                    {/* Subtopic Header */}
                    <div className="p-4 bg-muted/40 border-b border-border/50 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <Badge variant="secondary" className="font-mono text-xs font-bold shrink-0">
                          #{index + 1}
                        </Badge>
                        <span className="font-bold text-sm text-foreground truncate">
                          {sub.name.trim() || `Subtopic ${index + 1} (Untitled)`}
                        </span>
                        {sub.files.length > 0 && (
                          <Badge variant="outline" className="text-[10px] font-medium shrink-0">
                            {sub.files.length} file{sub.files.length === 1 ? "" : "s"}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Reorder Buttons */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={index === 0}
                          onClick={() => moveSubtopic(index, "up")}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg disabled:opacity-30"
                          title="Move Up"
                        >
                          <MoveUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={index === subtopics.length - 1}
                          onClick={() => moveSubtopic(index, "down")}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg disabled:opacity-30"
                          title="Move Down"
                        >
                          <MoveDown className="w-3.5 h-3.5" />
                        </Button>

                        {/* Expand / Collapse */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleSubtopicExpand(sub.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
                          title={sub.isExpanded ? "Collapse" : "Expand"}
                        >
                          {sub.isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </Button>

                        {/* Delete Subtopic */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeSubtopic(sub.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg ml-1"
                          title="Remove Subtopic"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Subtopic Body (when expanded) */}
                    {sub.isExpanded && (
                      <CardContent className="p-5 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <Label
                              htmlFor={`sub-title-${sub.id}`}
                              className="text-xs font-semibold"
                            >
                              Subtopic Title *
                            </Label>
                            <Input
                              id={`sub-title-${sub.id}`}
                              value={sub.name}
                              onChange={(e) =>
                                updateSubtopicField(sub.id, "name", e.target.value)
                              }
                              placeholder="e.g. CNN, ANN, RNN, Supervised Learning"
                              className="mt-1 h-10 text-sm rounded-xl"
                            />
                          </div>

                          <div>
                            <Label
                              htmlFor={`sub-desc-${sub.id}`}
                              className="text-xs font-semibold"
                            >
                              Subtopic Description (Optional)
                            </Label>
                            <Input
                              id={`sub-desc-${sub.id}`}
                              value={sub.description}
                              onChange={(e) =>
                                updateSubtopicField(sub.id, "description", e.target.value)
                              }
                              placeholder="Brief summary of this module..."
                              className="mt-1 h-10 text-sm rounded-xl"
                            />
                          </div>
                        </div>

                        {/* Subtopic Upload Area */}
                        <div className="pt-2">
                          <div className="flex items-center justify-between mb-2">
                            <Label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                              <Upload className="w-3 h-3 text-primary" />
                              Materials for &ldquo;{sub.name.trim() || `Subtopic ${index + 1}`}&rdquo;
                            </Label>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                document.getElementById(subFileInputId)?.click();
                              }}
                              className="h-7 px-2.5 text-xs gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              Add Files to {sub.name.trim() || `Subtopic ${index + 1}`}
                            </Button>
                          </div>

                          <input
                            id={subFileInputId}
                            type="file"
                            multiple
                            accept=".pdf,.pptx,.ppt"
                            className="hidden"
                            onChange={(e) => handleSubtopicFileSelect(sub.id, e.target.files)}
                          />

                          <div
                            onClick={() => {
                              document.getElementById(subFileInputId)?.click();
                            }}
                            className="cursor-pointer border border-dashed border-border rounded-xl p-4 text-center hover:border-primary/50 hover:bg-muted/30 transition-all bg-muted/10"
                          >
                            <p className="text-xs font-medium text-foreground">
                              Click or drop .pdf or .pptx files to add under &ldquo;
                              {sub.name.trim() || `Subtopic ${index + 1}`}&rdquo;
                            </p>
                          </div>

                          {/* List of Files in this Subtopic */}
                          {sub.files.length > 0 && (
                            <div className="space-y-2 mt-3">
                              {sub.files.map((fileItem) => (
                                <div
                                  key={fileItem.id}
                                  className="p-3 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
                                >
                                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                    <Badge
                                      className={`font-mono text-[9px] font-bold uppercase shrink-0 ${
                                        fileItem.format === "pdf"
                                          ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30"
                                          : "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                      }`}
                                    >
                                      .{fileItem.format}
                                    </Badge>

                                    <div className="flex-1 min-w-0 space-y-1">
                                      <Input
                                        value={fileItem.title}
                                        onChange={(e) =>
                                          updateSubtopicFileField(
                                            sub.id,
                                            fileItem.id,
                                            "title",
                                            e.target.value
                                          )
                                        }
                                        placeholder="Material title"
                                        className="h-7 text-xs font-semibold rounded-md"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                                    <span className="text-[10px] text-muted-foreground font-mono">
                                      {(fileItem.size / (1024 * 1024)).toFixed(2)} MB
                                    </span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => removeSubtopicFile(sub.id, fileItem.id)}
                                      className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
                                      title="Remove"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}

              <Button
                type="button"
                variant="outline"
                onClick={addSubtopic}
                className="w-full h-11 border-dashed border-border hover:border-primary/50 text-xs font-semibold gap-1.5 rounded-xl"
              >
                <Plus className="w-4 h-4" />
                Add Another Subtopic
              </Button>
            </div>
          )}
        </div>

        {/* SECTION 4: Shared Metadata & Publishing Options */}
        <Card className="rounded-2xl border-border bg-card shadow-xs">
          <CardHeader className="border-b border-border/50 pb-3">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              4. Publication Settings & Metadata
            </CardTitle>
          </CardHeader>

          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="academic-level" className="text-xs font-semibold">
                  Academic Level
                </Label>
                <select
                  id="academic-level"
                  value={academicLevel}
                  onChange={(e) => setAcademicLevel(e.target.value)}
                  className="mt-1 w-full h-10 px-3 text-xs rounded-xl border border-border bg-card text-foreground"
                >
                  <option value="School / Beginner">School / Beginner</option>
                  <option value="Undergraduate">Undergraduate</option>
                  <option value="Postgraduate">Postgraduate</option>
                  <option value="Research / Professional">Research / Professional</option>
                </select>
              </div>

              <div>
                <Label htmlFor="topic-lang" className="text-xs font-semibold">
                  Language
                </Label>
                <select
                  id="topic-lang"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="mt-1 w-full h-10 px-3 text-xs rounded-xl border border-border bg-card text-foreground"
                >
                  <option value="en">English (en)</option>
                  <option value="hi">Hindi (hi)</option>
                  <option value="es">Spanish (es)</option>
                  <option value="fr">French (fr)</option>
                </select>
              </div>

              <div>
                <Label htmlFor="topic-tags" className="text-xs font-semibold">
                  Tags / Keywords
                </Label>
                <Input
                  id="topic-tags"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g. deep-learning, cnn, ai"
                  className="mt-1 h-10 text-xs rounded-xl"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center gap-6 text-xs">
              <span className="font-semibold text-foreground">Publication Status:</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="publishStatus"
                  value="published"
                  checked={publishStatus === "published"}
                  onChange={() => setPublishStatus("published")}
                  className="accent-primary"
                />
                <span>Publish Immediately (Visible to students)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="publishStatus"
                  value="draft"
                  checked={publishStatus === "draft"}
                  onChange={() => setPublishStatus("draft")}
                  className="accent-primary"
                />
                <span>Save as Draft</span>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* STICKY BOTTOM ACTION BAR */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border p-4 shadow-lg">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div>
                <span className="font-bold text-foreground">
                  {topicMode === "new"
                    ? mainTopicTitle || "New Topic"
                    : existingTopic?.name || "Existing Topic"}
                </span>
                <span className="mx-2">•</span>
                <span>{mainTopicFiles.length} Direct Materials</span>
                <span className="mx-2">•</span>
                <span>
                  {activeSubtopicsCount} Subtopics ({totalSubtopicFiles} Materials)
                </span>
                <span className="mx-2">•</span>
                <span className="font-semibold text-foreground">
                  {totalAllFiles} Total File{totalAllFiles === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetForm}
                disabled={isPublishing}
                className="text-xs"
              >
                Reset
              </Button>

              <Button
                type="button"
                size="default"
                onClick={handlePublishTopic}
                disabled={isPublishing}
                className="gap-2 font-semibold px-6 shadow-md"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Publishing ({overallProgress}%)...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Publish Entire Topic
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* MULTI-STEP PUBLICATION PROGRESS MODAL */}
      <Dialog
        open={showProgressModal}
        onOpenChange={(open) => {
          if (!isPublishing && !open) setShowProgressModal(false);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {publishSuccess ? (
                <>
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                  Publication Complete!
                </>
              ) : (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  Publishing Topic & Materials...
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {publishSuccess
                ? "All learning materials and subtopics have been published and linked to the library."
                : "Please wait while your main topic, subtopics, and documents are securely processed and uploaded."}
            </DialogDescription>
          </DialogHeader>

          {/* Progress bar */}
          <div className="space-y-2 py-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>Overall Progress</span>
              <span className="font-mono">{overallProgress}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>

          {/* Live Steps Checklist */}
          <div className="max-h-60 overflow-y-auto space-y-2 pr-1 text-xs">
            {publishSteps.map((step) => (
              <div
                key={step.id}
                className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 ${
                  step.status === "success"
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                    : step.status === "in_progress"
                    ? "bg-primary/10 border-primary/30 text-primary font-semibold"
                    : step.status === "error"
                    ? "bg-destructive/10 border-destructive/20 text-destructive"
                    : "bg-muted/30 border-border/40 text-muted-foreground"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {step.status === "success" && (
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  )}
                  {step.status === "in_progress" && (
                    <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                  )}
                  {step.status === "error" && (
                    <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                  )}
                  {step.status === "pending" && (
                    <div className="w-4 h-4 rounded-full border border-border shrink-0" />
                  )}
                  <span className="truncate">{step.label}</span>
                </div>

                <Badge
                  variant={
                    step.status === "success"
                      ? "default"
                      : step.status === "in_progress"
                      ? "secondary"
                      : "outline"
                  }
                  className="text-[10px] shrink-0 uppercase font-mono"
                >
                  {step.status}
                </Badge>
              </div>
            ))}
          </div>

          <DialogFooter className="pt-3">
            {publishSuccess ? (
              <div className="flex items-center justify-end gap-2 w-full">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResetForm}
                  className="text-xs"
                >
                  Create Another Topic
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setShowProgressModal(false);
                    if (publishedTopicId) {
                      navigate(`/ppt-library?topic=${publishedTopicId}`);
                    } else {
                      navigate("/ppt-library");
                    }
                  }}
                  className="gap-1.5 text-xs font-semibold"
                >
                  <BookOpen className="w-4 h-4" />
                  View Topic in Library
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPublishing}
                onClick={() => setShowProgressModal(false)}
                className="text-xs"
              >
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
