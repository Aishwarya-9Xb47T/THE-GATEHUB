import { useState, useEffect, useRef } from "react";
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
    data: subtopics = [],
    isLoading: loadingSubtopics,
    refetch: refetchSubtopics,
  } = usePptSubtopics(selectedTopicId);

  const { invalidate } = useInvalidatePptCategories();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [language, setLanguage] = useState("en");
  const [academicLevel, setAcademicLevel] = useState("Undergraduate");
  const [status, setStatus] = useState<"published" | "draft">("published");

  const [pptFile, setPptFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

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
    if (subtopics.length > 0) {
      if (!subtopics.some((s) => s.id === selectedSubtopicId)) {
        setSelectedSubtopicId(subtopics[0].id);
      }
    } else {
      setSelectedSubtopicId("");
    }
  }, [subtopics, selectedTopicId]);

  // Topic change handler
  const handleTopicChange = (newTopicId: string) => {
    setSelectedTopicId(newTopicId);
    setSelectedSubtopicId("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pptx" && ext !== "ppt") {
      toast({
        title: "Unsupported File Format",
        description: "Please upload a .pptx or .ppt PowerPoint presentation.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Presentation files must be 100 MB or smaller.",
        variant: "destructive",
      });
      return;
    }

    setPptFile(file);
    if (!title) {
      // Auto-fill title from filename
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
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
      toast({ title: "Title Required", description: "Please enter a presentation title.", variant: "destructive" });
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
        description: "Please select or create a subtopic for this presentation.",
        variant: "destructive",
      });
      return;
    }

    if (!pptFile) {
      toast({
        title: "File Required",
        description: "Please select a .pptx or .ppt presentation file.",
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
      formData.append("file", pptFile);
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
        description: `"${res.data.title}" has been successfully added to the PPT Library.`,
        variant: "success",
      });

      navigate(`/ppt-library/${res.data.id}/view`);
    } catch (err: any) {
      console.error("PPT upload failed:", err);
      toast({
        title: "Upload Failed",
        description: err.message || "An error occurred during upload. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

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
            <Presentation className="w-4 h-4" />
            View PPT Library
          </Button>
        </div>

        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Upload Presentation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Share structured presentation slides with students and educators across THE GATEHUB.
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
                  publish presentations directly to the PPT Library without repeated approval requests.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upload Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="border-border bg-card shadow-sm rounded-2xl overflow-hidden">
            <CardContent className="p-6 sm:p-8 space-y-6">
              {/* File Dropzone */}
              <div>
                <Label className="text-sm font-semibold">Presentation File *</Label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`mt-2 border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                    pptFile
                      ? "border-primary/60 bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-muted/40"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {pptFile ? (
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-12 h-12 rounded-xl bg-primary/20 text-primary flex items-center justify-center mb-2">
                        <CheckCircle className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">{pptFile.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {(pptFile.size / (1024 * 1024)).toFixed(2)} MB • Click to change file
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-12 h-12 rounded-xl bg-muted text-muted-foreground flex items-center justify-center mb-2">
                        <Upload className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">Click or drag PowerPoint file here</p>
                      <p className="text-xs text-muted-foreground mt-1">Supports .pptx and .ppt (up to 100 MB)</p>
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
                    placeholder="e.g. Introduction to Convolutional Neural Networks"
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
                    placeholder="Briefly describe what students will learn from this presentation..."
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
                      className="mt-1.5 w-full h-11 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary disabled:opacity-50"
                      required
                      disabled={loadingTopics}
                    >
                      {loadingTopics ? (
                        <option value="">Loading categories...</option>
                      ) : topics.length === 0 ? (
                        <option value="">No categories available</option>
                      ) : (
                        <>
                          <option value="">Select a Topic / Category...</option>
                          {topics.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  )}

                  {!loadingTopics && topics.length === 0 && !errorTopics && (
                    <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      No categories exist yet. Click &quot;New Category&quot; above to create one.
                    </p>
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
                        Add Subtopic
                      </button>
                    )}
                  </div>

                  <select
                    id="ppt-subtopic"
                    value={selectedSubtopicId}
                    onChange={(e) => setSelectedSubtopicId(e.target.value)}
                    className="mt-1.5 w-full h-11 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary disabled:opacity-50"
                    required
                    disabled={!selectedTopicId || loadingSubtopics || subtopics.length === 0}
                  >
                    {!selectedTopicId ? (
                      <option value="">Select a category first</option>
                    ) : loadingSubtopics ? (
                      <option value="">Loading subtopics...</option>
                    ) : subtopics.length === 0 ? (
                      <option value="">No subtopics available under this topic</option>
                    ) : (
                      <>
                        <option value="">Select a Subtopic...</option>
                        {subtopics.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </>
                    )}
                  </select>

                  {selectedTopicId && !loadingSubtopics && subtopics.length === 0 && (
                    <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      No subtopics in this category. Click &quot;Add Subtopic&quot; above to create one.
                    </p>
                  )}
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
                    className="mt-1.5 w-full h-11 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                    <option value="Undergraduate">Undergraduate</option>
                    <option value="Postgraduate">Postgraduate</option>
                    <option value="Research">Research & Industry</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="ppt-lang" className="text-sm font-semibold">
                    Language
                  </Label>
                  <select
                    id="ppt-lang"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="mt-1.5 w-full h-11 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                  >
                    <option value="en">English (en)</option>
                    <option value="hi">Hindi (hi)</option>
                    <option value="es">Spanish (es)</option>
                    <option value="fr">French (fr)</option>
                    <option value="de">German (de)</option>
                  </select>
                </div>
              </div>

              {/* Tags */}
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

              {/* Optional Thumbnail */}
              <div>
                <Label className="text-sm font-semibold">Optional Cover Image / Thumbnail</Label>
                <div className="mt-1.5 flex items-center gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => thumbInputRef.current?.click()}
                    className="gap-2 text-xs"
                  >
                    <ImageIcon className="w-4 h-4" />
                    {thumbnailFile ? "Change Image" : "Choose Thumbnail"}
                  </Button>
                  <input
                    ref={thumbInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleThumbChange}
                    className="hidden"
                  />
                  {thumbnailFile && (
                    <span className="text-xs text-muted-foreground truncate">{thumbnailFile.name}</span>
                  )}
                </div>
              </div>

              {/* Status Radio */}
              <div className="pt-2 border-t border-border/50">
                <Label className="text-sm font-semibold block mb-2">Publish Status</Label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      checked={status === "published"}
                      onChange={() => setStatus("published")}
                      className="text-primary focus:ring-primary"
                    />
                    <span>Publish Immediately</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
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

              {/* Submit Button */}
              <div className="pt-4 flex items-center justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => navigate(-1)} disabled={uploading}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={uploading || !isApproved || !pptFile || !title.trim() || !selectedTopicId || !selectedSubtopicId}
                  className="min-w-[140px]"
                >
                  {uploading ? `Uploading (${uploadProgress}%)` : status === "published" ? "Upload & Publish" : "Save Draft"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>

      {/* Quick Category / Subtopic Creation Modal */}
      <Dialog open={showCategoryModal} onOpenChange={setShowCategoryModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-primary" />
              {modalMode === "topic" ? "Create New Category" : "Add New Subtopic"}
            </DialogTitle>
            <DialogDescription>
              {modalMode === "topic"
                ? "Add a high-level academic subject or technology field."
                : "Add a specific specialized topic under the selected category."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCategorySubmit} className="space-y-4 py-2">
            {modalMode === "topic" ? (
              <>
                <div>
                  <Label htmlFor="new-cat-name" className="text-sm font-semibold">
                    Category Name *
                  </Label>
                  <Input
                    id="new-cat-name"
                    value={modalTopicName}
                    onChange={(e) => setModalTopicName(e.target.value)}
                    placeholder="e.g. Distributed Computing"
                    className="mt-1.5"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <Label htmlFor="new-cat-desc" className="text-sm font-semibold">
                    Description (optional)
                  </Label>
                  <Textarea
                    id="new-cat-desc"
                    value={modalTopicDesc}
                    onChange={(e) => setModalTopicDesc(e.target.value)}
                    placeholder="Brief description of this field..."
                    rows={2}
                    className="mt-1.5 resize-none"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="parent-cat-select" className="text-sm font-semibold">
                    Parent Category *
                  </Label>
                  <select
                    id="parent-cat-select"
                    value={modalParentTopicId}
                    onChange={(e) => setModalParentTopicId(e.target.value)}
                    className="mt-1.5 w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
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
                  <Label htmlFor="new-sub-name" className="text-sm font-semibold">
                    Subtopic Name *
                  </Label>
                  <Input
                    id="new-sub-name"
                    value={modalSubtopicName}
                    onChange={(e) => setModalSubtopicName(e.target.value)}
                    placeholder="e.g. MapReduce & Spark"
                    className="mt-1.5"
                    required
                    autoFocus
                  />
                </div>
              </>
            )}

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowCategoryModal(false)}
                disabled={submittingCategory}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submittingCategory}>
                {submittingCategory ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : modalMode === "topic" ? (
                  "Create Category"
                ) : (
                  "Add Subtopic"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
