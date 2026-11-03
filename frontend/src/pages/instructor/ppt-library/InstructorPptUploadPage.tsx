import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  FileText,
  Image as ImageIcon,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Presentation,
  ShieldAlert,
  Plus,
  Loader2,
  FolderPlus,
  RefreshCw,
  BookOpen,
} from "lucide-react";
import {
  uploadPptResource,
  createTopic,
  createSubtopic,
  PPTTopic,
  PPTSubtopic,
} from "@/lib/pptLibrary/api";
import {
  usePptTopics,
  usePptSubtopics,
  useInvalidatePptCategories,
} from "@/lib/pptLibrary/usePptQuery";
import { useUserStore, isAdminRole } from "@/store/userStore";
import { useToastStore } from "@/store/toastStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

export function InstructorPptUploadPage() {
  const navigate = useNavigate();
  const { user } = useUserStore();
  const toast = useToastStore((s) => s.add);

  // TanStack Query for topics & subtopics
  const {
    data: topics = [],
    isLoading: loadingTopics,
    isError: errorTopics,
    refetch: refetchTopics,
  } = usePptTopics();

  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [selectedSubtopicId, setSelectedSubtopicId] = useState("");

  const {
    data: fetchedSubtopics = [],
    isLoading: loadingSubtopics,
    refetch: refetchSubtopics,
  } = usePptSubtopics(selectedTopicId);

  // Synchronously derive subtopics from currentTopic if already in memory
  const currentTopic = useMemo(() => topics.find((t) => t.id === selectedTopicId), [topics, selectedTopicId]);
  const availableSubtopics = useMemo(() => {
    if (fetchedSubtopics.length > 0) return fetchedSubtopics;
    return currentTopic?.subtopics || [];
  }, [fetchedSubtopics, currentTopic]);

  const { invalidate } = useInvalidatePptCategories();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [language, setLanguage] = useState("en");
  const [academicLevel, setAcademicLevel] = useState("Undergraduate");
  const [status, setStatus] = useState<"published" | "draft">("published");

  // Mandatory Material Type Selection: Presentation vs PDF
  const [uploadType, setUploadType] = useState<"presentation" | "pdf">("presentation");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);

  // Category & Subtopic Creation Modal
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [modalMode, setModalMode] = useState<"topic" | "subtopic">("topic");
  const [modalTopicName, setModalTopicName] = useState("");
  const [modalTopicDesc, setModalTopicDesc] = useState("");
  const [modalSubtopicName, setModalSubtopicName] = useState("");
  const [modalParentTopicId, setModalParentTopicId] = useState("");
  const [submittingCategory, setSubmittingCategory] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  // Check approval status
  const isApproved =
    isAdminRole(user?.role) ||
    (user?.role === "instructor" && (user as any).instructorApprovalStatus === "APPROVED");

  // Auto-select initial topic when loaded if not yet set
  useEffect(() => {
    if (topics.length > 0 && !selectedTopicId) {
      setSelectedTopicId(topics[0].id);
    }
  }, [topics, selectedTopicId]);

  // When subtopics arrive for the selected topic, select the first if none selected
  useEffect(() => {
    if (availableSubtopics.length > 0) {
      if (!availableSubtopics.some((s) => s.id === selectedSubtopicId)) {
        setSelectedSubtopicId(availableSubtopics[0].id);
      }
    } else {
      setSelectedSubtopicId("");
    }
  }, [availableSubtopics, selectedTopicId]);

  // Topic change handler
  const handleTopicChange = (newTopicId: string) => {
    setSelectedTopicId(newTopicId);
    setSelectedSubtopicId("");
  };

  // Switch upload type handler
  const handleUploadTypeChange = (newType: "presentation" | "pdf") => {
    if (newType === uploadType) return;
    setUploadType(newType);

    // If existing selected file doesn't match the newly chosen type, clear it
    if (selectedFile) {
      const ext = selectedFile.name.split(".").pop()?.toLowerCase();
      if (newType === "pdf" && ext !== "pdf") {
        setSelectedFile(null);
        toast({
          title: "File Cleared",
          description: "Switched to PDF mode. Please select a .pdf document.",
        });
      } else if (newType === "presentation" && ext !== "pptx" && ext !== "ppt") {
        setSelectedFile(null);
        toast({
          title: "File Cleared",
          description: "Switched to PowerPoint mode. Please select a .pptx or .ppt presentation.",
        });
      }
    }
  };

  // Validate and set file
  const processFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (uploadType === "presentation") {
      if (ext !== "pptx" && ext !== "ppt") {
        toast({
          title: "Invalid File Format",
          description: "Please upload a .pptx or .ppt PowerPoint presentation, or switch to PDF Document.",
          variant: "destructive",
        });
        return;
      }
    } else {
      if (ext !== "pdf") {
        toast({
          title: "Invalid File Format",
          description: "Please upload a .pdf document, or switch to PowerPoint Presentation.",
          variant: "destructive",
        });
        return;
      }
    }

    // 100 MB max file size
    if (file.size > 100 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Uploaded file must be 100 MB or smaller.",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    if (!title) {
      // Auto-fill title from filename
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
    // Reset input value so re-selecting the same file fires onChange
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleThumbChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid Thumbnail",
        description: "Please choose an image file (PNG, JPG, WebP).",
        variant: "destructive",
      });
      return;
    }

    setThumbnailFile(file);
  };

  // Open modal for new topic
  const openCreateTopicModal = () => {
    setModalMode("topic");
    setModalTopicName("");
    setModalTopicDesc("");
    setShowCategoryModal(true);
  };

  // Open modal for new subtopic
  const openCreateSubtopicModal = () => {
    setModalMode("subtopic");
    setModalSubtopicName("");
    setModalParentTopicId(selectedTopicId || (topics[0]?.id ?? ""));
    setShowCategoryModal(true);
  };

  // Handle category / subtopic creation
  const handleCreateCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalMode === "topic") {
      if (!modalTopicName.trim()) {
        toast({ title: "Name Required", description: "Please enter a topic name.", variant: "destructive" });
        return;
      }
      try {
        setSubmittingCategory(true);
        const res = await createTopic({
          name: modalTopicName.trim(),
          description: modalTopicDesc.trim() || undefined,
        });
        await invalidate();
        await refetchTopics();
        setSelectedTopicId(res.data.id);
        setShowCategoryModal(false);
        toast({ title: "Category Created", description: `"${res.data.name}" is now available.`, variant: "success" });
      } catch (err: any) {
        toast({ title: "Failed to create topic", description: err.message, variant: "destructive" });
      } finally {
        setSubmittingCategory(false);
      }
    } else {
      if (!modalParentTopicId) {
        toast({ title: "Topic Required", description: "Please select a parent topic.", variant: "destructive" });
        return;
      }
      if (!modalSubtopicName.trim()) {
        toast({ title: "Subtopic Name Required", description: "Please enter a subtopic name.", variant: "destructive" });
        return;
      }
      try {
        setSubmittingCategory(true);
        const res = await createSubtopic({
          topicId: modalParentTopicId,
          name: modalSubtopicName.trim(),
        });
        await invalidate(modalParentTopicId);
        await Promise.all([refetchTopics(), refetchSubtopics()]);
        setSelectedTopicId(modalParentTopicId);
        setSelectedSubtopicId(res.data.id);
        setShowCategoryModal(false);
        toast({ title: "Subtopic Created", description: `"${res.data.name}" added successfully.`, variant: "success" });
      } catch (err: any) {
        toast({ title: "Failed to create subtopic", description: err.message, variant: "destructive" });
      } finally {
        setSubmittingCategory(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isApproved) {
      toast({
        title: "Approval Required",
        description: "Your instructor account is pending administrator approval.",
        variant: "destructive",
      });
      return;
    }

    if (!title.trim()) {
      toast({ title: "Title Required", description: "Please enter a title.", variant: "destructive" });
      return;
    }

    if (!selectedTopicId) {
      toast({
        title: "Category Required",
        description: "Please select a category / topic.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedSubtopicId) {
      toast({
        title: "Subtopic Required",
        description: "Please select or create a subtopic for this resource.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedFile) {
      toast({
        title: "File Required",
        description:
          uploadType === "pdf"
            ? "Please select a .pdf document file."
            : "Please select a .pptx or .ppt presentation file.",
        variant: "destructive",
      });
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(20);

      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("description", description.trim());
      formData.append("topicId", selectedTopicId);
      formData.append("subtopicId", selectedSubtopicId);
      formData.append("file", selectedFile);
      if (thumbnailFile) {
        formData.append("thumbnail", thumbnailFile);
      }

      const tags = tagsInput
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      formData.append("tags", JSON.stringify(tags));
      formData.append("language", language);
      formData.append("academicLevel", academicLevel);
      formData.append("status", status);

      setUploadProgress(60);
      const res = await uploadPptResource(formData);
      setUploadProgress(100);

      toast({
        title: "Upload Successful!",
        description: `"${res.data.title}" has been successfully added to Study Materials.`,
        variant: "success",
      });

      navigate(`/ppt-library/${res.data.id}/view`);
    } catch (err: any) {
      console.error("Study material upload failed:", err);
      toast({
        title: "Upload Failed",
        description: err.message || "An error occurred during upload. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const fileExt = selectedFile?.name.split(".").pop()?.toUpperCase() || "";

  return (
    <div className="min-h-screen bg-background text-foreground py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back and Page Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          <Button variant="outline" size="sm" onClick={() => navigate("/ppt-library")} className="gap-2">
            <BookOpen className="w-4 h-4" />
            View Study Materials
          </Button>
        </div>

        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Upload Study Material</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Share structured presentation slides (.pptx, .ppt) and PDF documents (.pdf) with students and educators across THE GATEHUB.
          </p>
        </div>

        {/* Approval Notice if not approved */}
        {!isApproved && (
          <Card className="border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
            <CardContent className="p-4 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm">Instructor Approval Required</h4>
                <p className="text-xs mt-1 leading-relaxed">
                  Your instructor profile is currently under administrator review. Once verified, you will be able to
                  publish materials directly to Study Materials without repeated approval requests.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upload Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="border-border bg-card shadow-sm rounded-2xl overflow-hidden">
            <CardContent className="p-6 sm:p-8 space-y-6">
              {/* Mandatory File-Type Selection */}
              <div>
                <Label className="text-sm font-semibold">What would you like to upload? *</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  <div
                    onClick={() => handleUploadTypeChange("presentation")}
                    className={`flex items-center gap-3.5 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      uploadType === "presentation"
                        ? "border-amber-500 bg-amber-500/10 text-foreground shadow-xs ring-1 ring-amber-500/30"
                        : "border-border hover:border-border/80 bg-card hover:bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    <div
                      className={`p-2.5 rounded-lg ${
                        uploadType === "presentation" ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Presentation className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-foreground">PowerPoint Presentation</div>
                      <div className="text-xs text-muted-foreground">.pptx, .ppt slide decks</div>
                    </div>
                  </div>

                  <div
                    onClick={() => handleUploadTypeChange("pdf")}
                    className={`flex items-center gap-3.5 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      uploadType === "pdf"
                        ? "border-rose-500 bg-rose-500/10 text-foreground shadow-xs ring-1 ring-rose-500/30"
                        : "border-border hover:border-border/80 bg-card hover:bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    <div
                      className={`p-2.5 rounded-lg ${
                        uploadType === "pdf" ? "bg-rose-500/20 text-rose-600 dark:text-rose-400" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-foreground">PDF Document</div>
                      <div className="text-xs text-muted-foreground">.pdf notes, manuals, guides</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dynamic File Dropzone */}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">
                    {uploadType === "pdf" ? "PDF Document File *" : "PowerPoint Presentation File *"}
                  </Label>
                  {selectedFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs h-7 text-primary hover:underline"
                    >
                      Replace File
                    </Button>
                  )}
                </div>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`mt-2 border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                    isDragOver
                      ? "border-primary bg-primary/10 scale-[1.01]"
                      : selectedFile
                      ? "border-primary/60 bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-muted/40"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={
                      uploadType === "pdf"
                        ? ".pdf,application/pdf"
                        : ".pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
                    }
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {selectedFile ? (
                    <div className="flex flex-col items-center justify-center">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center mb-2 ${
                          uploadType === "pdf"
                            ? "bg-rose-500/20 text-rose-600 dark:text-rose-400"
                            : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        <CheckCircle className="w-6 h-6" />
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground max-w-xs sm:max-w-md truncate">
                          {selectedFile.name}
                        </p>
                        <Badge
                          className={`text-[10px] uppercase font-mono font-bold ${
                            uploadType === "pdf"
                              ? "bg-rose-500/20 text-rose-600 border-rose-500/30"
                              : "bg-amber-500/20 text-amber-600 border-amber-500/30"
                          }`}
                        >
                          .{fileExt}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Click or tap Replace File to change
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center mb-2 ${
                          uploadType === "pdf" ? "bg-rose-500/10 text-rose-500" : "bg-amber-500/10 text-amber-500"
                        }`}
                      >
                        {uploadType === "pdf" ? <FileText className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        {uploadType === "pdf" ? "Click or drag PDF document here" : "Click or drag PowerPoint file here"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {uploadType === "pdf"
                          ? "Supports .pdf documents (up to 100 MB)"
                          : "Supports .pptx and .ppt (up to 100 MB)"}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Title & Description */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="ppt-title" className="text-sm font-semibold">
                    Title *
                  </Label>
                  <Input
                    id="ppt-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={
                      uploadType === "pdf"
                        ? "e.g. Complete Operating Systems Lecture Notes"
                        : "e.g. Introduction to Convolutional Neural Networks"
                    }
                    className="mt-1.5 h-11"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="ppt-desc" className="text-sm font-semibold">
                    Description
                  </Label>
                  <Textarea
                    id="ppt-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={
                      uploadType === "pdf"
                        ? "Briefly describe what students will learn from this PDF document..."
                        : "Briefly describe what students will learn from this presentation..."
                    }
                    rows={3}
                    className="mt-1.5 resize-none"
                  />
                </div>
              </div>

              {/* Topic & Subtopic Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Topic / Category Selector */}
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="ppt-topic" className="text-sm font-semibold flex items-center gap-1.5">
                      Topic / Category *
                      {loadingTopics && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                    </Label>
                    {isApproved && (
                      <button
                        type="button"
                        onClick={openCreateTopicModal}
                        className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                      >
                        <Plus className="w-3 h-3" />
                        New Category
                      </button>
                    )}
                  </div>

                  {errorTopics ? (
                    <div className="mt-1.5 flex items-center justify-between p-2.5 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-xs">
                      <span>Failed to load categories</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => refetchTopics()}
                        className="h-6 px-2 text-xs"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" /> Retry
                      </Button>
                    </div>
                  ) : (
                    <select
                      id="ppt-topic"
                      value={selectedTopicId}
                      onChange={(e) => handleTopicChange(e.target.value)}
                      disabled={loadingTopics && topics.length === 0}
                      className="mt-1.5 w-full h-11 px-3 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary shadow-xs disabled:opacity-70"
                      required
                    >
                      {loadingTopics && topics.length === 0 ? (
                        <option value="">Loading categories...</option>
                      ) : topics.length === 0 ? (
                        <option value="">No categories available (Click '+ New Category' to create)</option>
                      ) : (
                        topics.map((topic) => (
                          <option key={topic.id} value={topic.id}>
                            {topic.name}
                          </option>
                        ))
                      )}
                    </select>
                  )}
                </div>

                {/* Subtopic Selector */}
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="ppt-subtopic" className="text-sm font-semibold flex items-center gap-1.5">
                      Subtopic *
                      {loadingSubtopics && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                    </Label>
                    {isApproved && selectedTopicId && (
                      <button
                        type="button"
                        onClick={openCreateSubtopicModal}
                        className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                      >
                        <Plus className="w-3 h-3" />
                        New Subtopic
                      </button>
                    )}
                  </div>

                  <select
                    id="ppt-subtopic"
                    value={selectedSubtopicId}
                    onChange={(e) => setSelectedSubtopicId(e.target.value)}
                    className="mt-1.5 w-full h-11 px-3 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary shadow-xs disabled:opacity-70"
                    disabled={!selectedTopicId || availableSubtopics.length === 0}
                    required
                  >
                    {loadingTopics && topics.length === 0 ? (
                      <option value="">Loading subtopics...</option>
                    ) : !selectedTopicId ? (
                      <option value="">Select a category first</option>
                    ) : availableSubtopics.length === 0 ? (
                      <option value="">No subtopics available (Click &apos;New Subtopic&apos; to create)</option>
                    ) : (
                      availableSubtopics.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Academic Level & Language */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="ppt-level" className="text-sm font-semibold">
                    Academic Level
                  </Label>
                  <select
                    id="ppt-level"
                    value={academicLevel}
                    onChange={(e) => setAcademicLevel(e.target.value)}
                    className="mt-1.5 w-full h-11 px-3 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary shadow-xs"
                  >
                    <option value="School / Beginner">School / Beginner</option>
                    <option value="Undergraduate">Undergraduate</option>
                    <option value="Postgraduate">Postgraduate</option>
                    <option value="Research / Professional">Research / Professional</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="ppt-language" className="text-sm font-semibold">
                    Language
                  </Label>
                  <select
                    id="ppt-language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="mt-1.5 w-full h-11 px-3 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary shadow-xs"
                  >
                    <option value="en">English (en)</option>
                    <option value="hi">Hindi (hi)</option>
                    <option value="es">Spanish (es)</option>
                    <option value="fr">French (fr)</option>
                    <option value="de">German (de)</option>
                  </select>
                </div>
              </div>

              {/* Tags Input */}
              <div>
                <Label htmlFor="ppt-tags" className="text-sm font-semibold">
                  Tags / Keywords (comma separated)
                </Label>
                <Input
                  id="ppt-tags"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g. machine-learning, cnn, deep-learning, computer-vision"
                  className="mt-1.5 h-11"
                />
              </div>

              {/* Optional Cover Image / Thumbnail */}
              <div>
                <Label className="text-sm font-semibold">Optional Cover Image / Thumbnail</Label>
                <div className="mt-1.5 flex items-center gap-4">
                  <input
                    ref={thumbInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleThumbChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => thumbInputRef.current?.click()}
                    className="gap-2 text-xs"
                  >
                    <ImageIcon className="w-4 h-4" />
                    {thumbnailFile ? "Change Thumbnail" : "Choose Thumbnail"}
                  </Button>
                  {thumbnailFile && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-primary" />
                      {thumbnailFile.name}
                    </span>
                  )}
                </div>
              </div>

              {/* Publish Status Radio */}
              <div>
                <Label className="text-sm font-semibold">Publish Status</Label>
                <div className="flex items-center gap-6 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="status"
                      checked={status === "published"}
                      onChange={() => setStatus("published")}
                      className="text-primary focus:ring-primary"
                    />
                    <span>Publish Immediately</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="status"
                      checked={status === "draft"}
                      onChange={() => setStatus("draft")}
                      className="text-primary focus:ring-primary"
                    />
                    <span>Save as Draft</span>
                  </label>
                </div>
              </div>

              {/* Submit Button & Progress */}
              <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate(-1)}
                  disabled={uploading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={uploading || !selectedFile || !title.trim() || !selectedTopicId || !selectedSubtopicId}
                  className="min-w-36 gap-2"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Uploading ({uploadProgress}%)
                    </>
                  ) : status === "published" ? (
                    `Upload & Publish ${uploadType === "pdf" ? "PDF" : "Presentation"}`
                  ) : (
                    "Save as Draft"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>

      {/* Category & Subtopic Creation Modal */}
      <Dialog open={showCategoryModal} onOpenChange={setShowCategoryModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {modalMode === "topic" ? "Create New Category / Topic" : "Create New Subtopic"}
            </DialogTitle>
            <DialogDescription>
              {modalMode === "topic"
                ? "Add a high-level category to organize study materials."
                : "Add a specific subtopic under the selected category."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCategorySubmit} className="space-y-4 py-2">
            {modalMode === "topic" ? (
              <>
                <div>
                  <Label className="text-xs font-semibold">Category Name *</Label>
                  <Input
                    value={modalTopicName}
                    onChange={(e) => setModalTopicName(e.target.value)}
                    placeholder="e.g. Operating Systems"
                    className="mt-1"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Description (Optional)</Label>
                  <Textarea
                    value={modalTopicDesc}
                    onChange={(e) => setModalTopicDesc(e.target.value)}
                    placeholder="Brief description of this academic topic..."
                    className="mt-1 resize-none"
                    rows={2}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label className="text-xs font-semibold">Parent Category *</Label>
                  <select
                    value={modalParentTopicId}
                    onChange={(e) => setModalParentTopicId(e.target.value)}
                    className="mt-1 w-full h-9 px-2 text-xs rounded-md border border-border bg-card"
                    required
                  >
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Subtopic Name *</Label>
                  <Input
                    value={modalSubtopicName}
                    onChange={(e) => setModalSubtopicName(e.target.value)}
                    placeholder="e.g. Memory Management"
                    className="mt-1"
                    required
                  />
                </div>
              </>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowCategoryModal(false)}
                disabled={submittingCategory}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submittingCategory}>
                {submittingCategory ? "Creating..." : `Create ${modalMode === "topic" ? "Category" : "Subtopic"}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
