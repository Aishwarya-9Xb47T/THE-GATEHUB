import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Presentation,
  Search,
  Download,
  Eye,
  Calendar,
  Layers,
  FileText,
  Upload,
  ArrowRight,
  Filter,
  X,
  BookOpen,
  Sparkles,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Plus,
  Edit2,
  Trash2,
  Cpu,
  Brain,
  Database,
  Code,
  Globe,
  Terminal,
  Server,
  ArrowLeft,
  AlertTriangle,
  Loader2,
  Share2,
  Check,
} from "lucide-react";
import { DEFAULT_PPT_TOPICS } from "@/lib/pptLibrary/defaultTopics";
import {
  fetchLibraryResources,
  fetchLibraryTopics,
  getPptDownloadUrl,
  createTopic,
  updateTopic,
  deleteTopic,
  createSubtopic,
  updateSubtopic,
  deleteSubtopic,
  updatePptMetadata,
  deletePptResource,
  PPTResource,
  PPTTopic,
  PPTSubtopic,
} from "@/lib/pptLibrary/api";
import { useUserStore, isAdminRole } from "@/store/userStore";
import { useToastStore } from "@/store/toastStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { UnifiedAvatar } from "@/components/common/UnifiedAvatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Helper to format dates cleanly
function formatDate(dateString?: string): string {
  if (!dateString) return "";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

// Helper to render topic icons dynamically
function getTopicIcon(iconName?: string | null, className = "w-5 h-5") {
  const name = (iconName || "").toLowerCase();
  if (name.includes("ai") || name.includes("brain") || name.includes("deep") || name.includes("machine")) {
    return <Brain className={className} />;
  }
  if (name.includes("cpu") || name.includes("chip") || name.includes("hardware") || name.includes("architecture")) {
    return <Cpu className={className} />;
  }
  if (name.includes("data") || name.includes("sql") || name.includes("storage")) {
    return <Database className={className} />;
  }
  if (name.includes("code") || name.includes("programming") || name.includes("python") || name.includes("java")) {
    return <Code className={className} />;
  }
  if (name.includes("cloud") || name.includes("web") || name.includes("network") || name.includes("globe")) {
    return <Globe className={className} />;
  }
  if (name.includes("terminal") || name.includes("linux") || name.includes("os") || name.includes("sys")) {
    return <Terminal className={className} />;
  }
  if (name.includes("server") || name.includes("devops") || name.includes("backend")) {
    return <Server className={className} />;
  }
  return <Layers className={className} />;
}

export function PptLibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useUserStore();
  const toast = useToastStore((s) => s.add);
  const queryClient = useQueryClient();

  // Filters from URL search params
  const currentSearch = searchParams.get("search") || "";
  const currentTopicId = searchParams.get("topicId") || "";
  const currentSubtopicId = searchParams.get("subtopicId") || "";
  const currentSort = searchParams.get("sort") || "newest";
  const currentFileType = searchParams.get("fileType") || "all";
  const currentPage = Number(searchParams.get("page")) || 1;

  const [searchInput, setSearchInput] = useState(currentSearch);

  // Instructor / Admin permissions
  const canUpload = useMemo(() => {
    if (!user) return false;
    if (isAdminRole(user.role)) return true;
    if (user.role === "instructor" && (user as any).instructorApprovalStatus === "APPROVED") return true;
    return false;
  }, [user]);

  // Topic & Subtopic Management Dialogs
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [editingTopic, setEditingTopic] = useState<PPTTopic | null>(null);
  const [topicName, setTopicName] = useState("");
  const [topicDesc, setTopicDesc] = useState("");
  const [topicIcon, setTopicIcon] = useState("");
  const [savingTopic, setSavingTopic] = useState(false);

  const [showSubtopicModal, setShowSubtopicModal] = useState(false);
  const [editingSubtopic, setEditingSubtopic] = useState<PPTSubtopic | null>(null);
  const [subtopicParentId, setSubtopicParentId] = useState("");
  const [subtopicName, setSubtopicName] = useState("");
  const [subtopicDesc, setSubtopicDesc] = useState("");
  const [savingSubtopic, setSavingSubtopic] = useState(false);

  // Delete Confirmation Dialog (for Topic, Subtopic, or Material)
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "topic" | "subtopic" | "material";
    id: string;
    name: string;
    itemCount?: number;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit Material Metadata Dialog
  const [editingMaterial, setEditingMaterial] = useState<PPTResource | null>(null);
  const [editMaterialTitle, setEditMaterialTitle] = useState("");
  const [editMaterialDesc, setEditMaterialDesc] = useState("");
  const [editMaterialTopicId, setEditMaterialTopicId] = useState("");
  const [editMaterialSubtopicId, setEditMaterialSubtopicId] = useState("");
  const [editMaterialLevel, setEditMaterialLevel] = useState("Undergraduate");
  const [editMaterialTags, setEditMaterialTags] = useState("");
  const [savingMaterial, setSavingMaterial] = useState(false);

  // TanStack Query for topics — instant cached render with curated defaults (0ms delay)
  const { data: topics = [], isLoading: isTopicsLoading, isPlaceholderData, refetch: refetchTopics } = useQuery({
    queryKey: ["ppt-library", "topics"],
    queryFn: () => fetchLibraryTopics(),
    placeholderData: (prev) => prev || DEFAULT_PPT_TOPICS,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // TanStack Query for resources with stale-while-revalidate
  const {
    data: resourceData,
    isLoading: isResourcesLoading,
    isError: isResourcesError,
    error: resourcesError,
    refetch: refetchResources,
  } = useQuery({
    queryKey: [
      "ppt-library",
      "resources",
      currentPage,
      currentSearch,
      currentTopicId,
      currentSubtopicId,
      currentSort,
      currentFileType,
    ],
    queryFn: () =>
      fetchLibraryResources({
        page: currentPage,
        limit: 12,
        search: currentSearch,
        topicId: currentTopicId,
        subtopicId: currentSubtopicId,
        sort: currentSort,
        fileType: currentFileType !== "all" ? currentFileType : undefined,
      }),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const resources = resourceData?.data ?? [];
  const pagination = resourceData?.pagination ?? { page: 1, limit: 12, total: 0, totalPages: 1 };
  const loading = !resourceData && isResourcesLoading;

  // Derive active topic & subtopic objects from memory
  const activeTopic = useMemo(() => topics.find((t) => t.id === currentTopicId), [topics, currentTopicId]);
  const activeSubtopic = useMemo(
    () => activeTopic?.subtopics.find((s) => s.id === currentSubtopicId),
    [activeTopic, currentSubtopicId]
  );

  // Direct materials under active main topic (no subtopic assigned)
  const directMaterials = useMemo(() => {
    if (!currentTopicId || currentSubtopicId) return [];
    return resources.filter((r) => !r.subtopicId || r.subtopicId === "");
  }, [resources, currentTopicId, currentSubtopicId]);

  // Search & Navigation Handlers
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newParams = new URLSearchParams(searchParams);
    if (searchInput.trim()) {
      newParams.set("search", searchInput.trim());
    } else {
      newParams.delete("search");
    }
    newParams.set("page", "1");
    setSearchParams(newParams);
  };

  const clearSearch = () => {
    setSearchInput("");
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("search");
    newParams.set("page", "1");
    setSearchParams(newParams);
  };

  const handleTopicClick = (topicId: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (currentTopicId === topicId) {
      newParams.delete("topicId");
      newParams.delete("subtopicId");
    } else {
      newParams.set("topicId", topicId);
      newParams.delete("subtopicId");
    }
    newParams.set("page", "1");
    setSearchParams(newParams);
  };

  const handleSubtopicClick = (subtopicId: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (currentSubtopicId === subtopicId) {
      newParams.delete("subtopicId");
    } else {
      newParams.set("subtopicId", subtopicId);
    }
    newParams.set("page", "1");
    setSearchParams(newParams);
  };

  const handleFileTypeChange = (type: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (type === "all") {
      newParams.delete("fileType");
    } else {
      newParams.set("fileType", type);
    }
    newParams.set("page", "1");
    setSearchParams(newParams);
  };

  const handleSortChange = (sort: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("sort", sort);
    newParams.set("page", "1");
    setSearchParams(newParams);
  };

  const handlePageChange = (newPage: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("page", String(newPage));
    setSearchParams(newParams);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return "0 KB";
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Open Topic Creation / Edit Modal
  const openCreateTopic = () => {
    setEditingTopic(null);
    setTopicName("");
    setTopicDesc("");
    setTopicIcon("Brain");
    setShowTopicModal(true);
  };

  const openEditTopic = (t: PPTTopic, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTopic(t);
    setTopicName(t.name);
    setTopicDesc(t.description || "");
    setTopicIcon(t.icon || "Layers");
    setShowTopicModal(true);
  };

  const handleSaveTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicName.trim()) {
      toast({ title: "Topic Name Required", variant: "destructive" });
      return;
    }
    try {
      setSavingTopic(true);
      if (editingTopic) {
        await updateTopic(editingTopic.id, {
          name: topicName.trim(),
          description: topicDesc.trim() || undefined,
          icon: topicIcon.trim() || undefined,
        });
        toast({ title: "Topic Updated", description: `"${topicName}" has been updated.`, variant: "success" });
      } else {
        const res = await createTopic({
          name: topicName.trim(),
          description: topicDesc.trim() || undefined,
          icon: topicIcon.trim() || undefined,
        });
        toast({ title: "Topic Created", description: `"${res.data.name}" added to library.`, variant: "success" });
      }
      setShowTopicModal(false);
      queryClient.invalidateQueries({ queryKey: ["ppt-library"] });
      refetchTopics();
    } catch (err: any) {
      toast({ title: "Failed to save topic", description: err.message, variant: "destructive" });
    } finally {
      setSavingTopic(false);
    }
  };

  // Open Subtopic Creation / Edit Modal
  const openCreateSubtopic = (parentTopicId?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingSubtopic(null);
    setSubtopicParentId(parentTopicId || currentTopicId || topics[0]?.id || "");
    setSubtopicName("");
    setSubtopicDesc("");
    setShowSubtopicModal(true);
  };

  const openEditSubtopic = (s: PPTSubtopic, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSubtopic(s);
    setSubtopicParentId(s.topicId);
    setSubtopicName(s.name);
    setSubtopicDesc(s.description || "");
    setShowSubtopicModal(true);
  };

  const handleSaveSubtopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subtopicParentId) {
      toast({ title: "Parent Topic Required", variant: "destructive" });
      return;
    }
    if (!subtopicName.trim()) {
      toast({ title: "Subtopic Name Required", variant: "destructive" });
      return;
    }
    try {
      setSavingSubtopic(true);
      if (editingSubtopic) {
        await updateSubtopic(editingSubtopic.id, {
          name: subtopicName.trim(),
          description: subtopicDesc.trim() || undefined,
        });
        toast({ title: "Subtopic Updated", description: `"${subtopicName}" has been updated.`, variant: "success" });
      } else {
        const res = await createSubtopic({
          topicId: subtopicParentId,
          name: subtopicName.trim(),
          description: subtopicDesc.trim() || undefined,
        });
        toast({ title: "Subtopic Created", description: `"${res.data.name}" added successfully.`, variant: "success" });
      }
      setShowSubtopicModal(false);
      queryClient.invalidateQueries({ queryKey: ["ppt-library"] });
      refetchTopics();
    } catch (err: any) {
      toast({ title: "Failed to save subtopic", description: err.message, variant: "destructive" });
    } finally {
      setSavingSubtopic(false);
    }
  };

  // Safe Deletion Handlers with Cascade support
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      if (deleteTarget.type === "topic") {
        await deleteTopic(deleteTarget.id, true);
        toast({ title: "Topic Deleted", description: `"${deleteTarget.name}" and any associated materials were deleted.`, variant: "success" });
        if (currentTopicId === deleteTarget.id) {
          handleTopicClick("");
        }
      } else if (deleteTarget.type === "subtopic") {
        await deleteSubtopic(deleteTarget.id, true);
        toast({ title: "Subtopic Deleted", description: `"${deleteTarget.name}" and any associated materials were deleted.`, variant: "success" });
        if (currentSubtopicId === deleteTarget.id) {
          handleSubtopicClick("");
        }
      } else if (deleteTarget.type === "material") {
        await deletePptResource(deleteTarget.id);
        toast({ title: "Material Deleted", description: `"${deleteTarget.name}" was deleted.`, variant: "success" });
      }
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["ppt-library"] });
      refetchTopics();
    } catch (err: any) {
      toast({ title: "Deletion Failed", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  // Open Material Edit Modal
  const openEditMaterialModal = (ppt: PPTResource, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingMaterial(ppt);
    setEditMaterialTitle(ppt.title);
    setEditMaterialDesc(ppt.description || "");
    setEditMaterialTopicId(ppt.topicId || "");
    setEditMaterialSubtopicId(ppt.subtopicId || "");
    setEditMaterialLevel(ppt.academicLevel || "Undergraduate");
    setEditMaterialTags(ppt.tags ? ppt.tags.join(", ") : "");
  };

  const handleSaveMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial) return;
    if (!editMaterialTitle.trim()) {
      toast({ title: "Title Required", variant: "destructive" });
      return;
    }
    try {
      setSavingMaterial(true);
      const tags = editMaterialTags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      await updatePptMetadata(editingMaterial.id, {
        title: editMaterialTitle.trim(),
        description: editMaterialDesc.trim() || undefined,
        topicId: editMaterialTopicId || undefined,
        subtopicId: editMaterialSubtopicId || null,
        academicLevel: editMaterialLevel,
        tags,
      });

      toast({ title: "Material Updated", description: "Details saved successfully.", variant: "success" });
      setEditingMaterial(null);
      queryClient.invalidateQueries({ queryKey: ["ppt-library"] });
      refetchTopics();
    } catch (err: any) {
      toast({ title: "Failed to update material", description: err.message, variant: "destructive" });
    } finally {
      setSavingMaterial(false);
    }
  };

  // Available subtopics for material edit modal
  const editModalTopic = topics.find((t) => t.id === editMaterialTopicId);
  const editModalSubtopics = editModalTopic?.subtopics || [];

  // Compact horizontal document row renderer for study materials (matching Box 3 in handwritten spec)
  const renderMaterialRow = (ppt: PPTResource) => {
    const ext = ppt.originalFileName.toLowerCase();
    const isPdf = ppt.fileType === "pdf" || ext.endsWith(".pdf");
    const isPptx = ppt.fileType === "pptx" || ext.endsWith(".pptx");
    const canManageMaterial =
      user &&
      (isAdminRole(user.role) || (user.id === ppt.instructorId && user.role === "instructor"));

    return (
      <div
        key={ppt.id}
        className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 bg-card hover:bg-muted/40 border border-border rounded-2xl transition-all duration-200 gap-4 shadow-xs"
      >
        <div className="flex items-start gap-3 sm:gap-4 min-w-0">
          {/* Format Icon / Badge */}
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
              isPdf
                ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25"
            }`}
          >
            {isPdf ? <FileText className="w-5 h-5" /> : <Presentation className="w-5 h-5" />}
          </div>

          {/* Details */}
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                className={`text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 ${
                  isPdf
                    ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                }`}
              >
                {isPdf ? ".PDF" : isPptx ? ".PPTX" : ".PPT"}
              </Badge>
              {ppt.academicLevel && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  {ppt.academicLevel}
                </Badge>
              )}
              {/* Show topic & subtopic breadcrumbs in Search or Top-level context */}
              {(currentSearch || (!currentTopicId && !currentSubtopicId)) && ppt.topic && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <span>{ppt.topic.name}</span>
                  {ppt.subtopic && (
                    <>
                      <span>›</span>
                      <span className="text-foreground font-medium">{ppt.subtopic.name}</span>
                    </>
                  )}
                </span>
              )}
            </div>

            <h4 className="font-semibold text-foreground text-base group-hover:text-primary transition-colors leading-snug">
              <Link to={`/ppt-library/${ppt.id}/view`} className="hover:underline">
                {ppt.title}
              </Link>
            </h4>

            {ppt.description && (
              <p className="text-xs text-muted-foreground line-clamp-1 max-w-2xl leading-relaxed">
                {ppt.description}
              </p>
            )}

            <div className="flex items-center gap-3 sm:gap-4 text-xs text-muted-foreground flex-wrap pt-0.5">
              <div className="flex items-center gap-1.5">
                <UnifiedAvatar user={ppt.instructor as any} size="sm" className="ring-1 ring-border shrink-0" />
                <span className="font-medium text-foreground">
                  {ppt.instructor ? `${ppt.instructor.firstName} ${ppt.instructor.lastName}` : "Instructor"}
                </span>
              </div>
              {ppt.createdAt && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-muted-foreground" />
                  {formatDate(ppt.createdAt)}
                </span>
              )}
              {isPdf && ppt.pageCount ? (
                <>
                  <span className="text-muted-foreground/60">•</span>
                  <span>{ppt.pageCount} {ppt.pageCount === 1 ? "page" : "pages"}</span>
                </>
              ) : ppt.slideCount ? (
                <>
                  <span className="text-muted-foreground/60">•</span>
                  <span>{ppt.slideCount} slides</span>
                </>
              ) : null}
              {ppt.fileSize ? (
                <>
                  <span className="text-muted-foreground/60">•</span>
                  <span>{formatFileSize(ppt.fileSize)}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          {canManageMaterial && (
            <div className="flex items-center gap-1 mr-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={(e) => openEditMaterialModal(ppt, e)}
                className="h-8 w-8 text-muted-foreground hover:text-primary"
                title="Edit Material"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget({ type: "material", id: ppt.id, name: ppt.title });
                }}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                title="Delete Material"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          <Button size="sm" variant="outline" asChild className="text-xs gap-1.5 h-8">
            <a href={getPptDownloadUrl(ppt.id)} download={ppt.originalFileName}>
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
          </Button>
          <Button size="sm" asChild className="text-xs gap-1.5 h-8 shadow-xs">
            <Link to={`/ppt-library/${ppt.id}/view`}>
              <Eye className="w-3.5 h-3.5" />
              {isPdf ? "View Document" : "View Slides"}
            </Link>
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Hero / Header Section */}
      <section className="relative border-b border-border/50 bg-gradient-to-b from-primary/5 via-transparent to-transparent pt-12 pb-10">
        <div className="app-workspace max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-primary/10 text-primary border border-primary/20 mb-3">
                <BookOpen className="w-3.5 h-3.5" />
                ACADEMIC RESOURCE HUB
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold tracking-tight text-foreground">
                Study Materials
              </h1>
              <p className="mt-2 text-base sm:text-lg text-muted-foreground max-w-2xl">
                Browse, view, and download structured PowerPoint presentation slide decks and PDF documents curated by verified
                technology instructors.
              </p>
            </div>

            {canUpload && (
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => navigate("/ppt-library/upload")}
                  className="gap-2 shadow-md hover:shadow-lg transition-all"
                >
                  <Upload className="w-4 h-4" />
                  Upload Material
                </Button>
                {user?.role === "instructor" && (
                  <Button
                    variant="outline"
                    onClick={() => navigate("/instructor/ppt-library")}
                    className="gap-2"
                  >
                    My Materials
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Material Type Tabs (All Materials / Presentations / PDF Documents) */}
          <div className="mt-8 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => handleFileTypeChange("all")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                currentFileType === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card/70 hover:bg-card border border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              All Materials
            </button>
            <button
              type="button"
              onClick={() => handleFileTypeChange("presentation")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                currentFileType === "presentation"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "bg-card/70 hover:bg-card border border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Presentation className="w-3.5 h-3.5" />
              Presentations (.pptx, .ppt)
            </button>
            <button
              type="button"
              onClick={() => handleFileTypeChange("pdf")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                currentFileType === "pdf"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "bg-card/70 hover:bg-card border border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              PDF Documents (.pdf)
            </button>
          </div>

          {/* Search bar */}
          <form onSubmit={handleSearchSubmit} className="mt-6 relative max-w-3xl">
            <div className="relative flex items-center">
              <Search className="absolute left-4 w-5 h-5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search materials by title, topic, tags, or instructor..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-12 pr-24 h-12 text-base rounded-xl border-border bg-card shadow-sm focus-visible:ring-primary"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-20 text-muted-foreground hover:text-foreground p-1 rounded-full"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <Button type="submit" size="sm" className="absolute right-2 h-8 px-4 rounded-lg">
                Search
              </Button>
            </div>
          </form>

          {/* Breadcrumbs Navigation Bar (visible when navigating topics, subtopics, or searching) */}
          {(currentTopicId || currentSearch || currentFileType !== "all") && (
            <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground overflow-x-auto pb-1 scrollbar-none">
              <button
                type="button"
                onClick={() => {
                  const newParams = new URLSearchParams(searchParams);
                  newParams.delete("topicId");
                  newParams.delete("subtopicId");
                  newParams.delete("search");
                  newParams.delete("fileType");
                  newParams.set("page", "1");
                  setSearchParams(newParams);
                  setSearchInput("");
                }}
                className="hover:text-foreground font-medium flex items-center gap-1.5 transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Study Materials
              </button>

              {currentTopicId && activeTopic && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  <button
                    type="button"
                    onClick={() => {
                      const newParams = new URLSearchParams(searchParams);
                      newParams.set("topicId", activeTopic.id);
                      newParams.delete("subtopicId");
                      newParams.delete("search");
                      newParams.set("page", "1");
                      setSearchParams(newParams);
                    }}
                    className={`hover:text-foreground font-medium truncate max-w-xs transition-colors ${
                      !currentSubtopicId ? "text-primary font-semibold" : ""
                    }`}
                  >
                    {activeTopic.name}
                  </button>
                </>
              )}

              {currentSubtopicId && activeSubtopic && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  <span className="font-semibold text-primary truncate max-w-xs">
                    {activeSubtopic.name}
                  </span>
                </>
              )}

              {currentSearch && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  <span className="font-semibold text-primary truncate max-w-xs">
                    Search: &ldquo;{currentSearch}&rdquo;
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Main Hierarchical Browsing Content */}
      <section className="app-workspace max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-12">
        {/* LEVEL 1: MAIN TOPICS FIRST (When browsing root library without specific topic or search) */}
        {!currentTopicId && !currentSearch && currentFileType === "all" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground flex items-center gap-2">
                  <Layers className="w-5 h-5 text-primary" />
                  Main Topics & Categories
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Select a topic to explore its subtopics and learning materials.
                </p>
              </div>

              {canUpload && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openCreateTopic}
                  className="gap-1.5 text-xs h-8"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Topic
                </Button>
              )}
            </div>

            {/* Clean Folder-Style List of Main Topics (Matching Level 1 & Handwritten Spec) */}
            {isTopicsLoading && topics.length === 0 ? (
              <div className="border border-border rounded-2xl bg-card overflow-hidden divide-y divide-border/60 shadow-xs">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="animate-pulse p-4 sm:p-5 flex items-center justify-between">
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="w-6 h-4 bg-muted/60 rounded" />
                      <div className="w-5 h-5 rounded bg-muted/60" />
                      <div className="h-5 bg-muted rounded w-44" />
                    </div>
                    <div className="h-4 bg-muted/40 rounded w-20" />
                  </div>
                ))}
              </div>
            ) : !isPlaceholderData && topics.length === 0 ? (
              <div className="text-center py-12 px-4 bg-card/30 rounded-2xl border border-border/50">
                <Layers className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium text-foreground">No topics created yet</p>
                <p className="text-xs text-muted-foreground mt-1">Create a topic to organize study materials.</p>
              </div>
            ) : (
              <div className="border border-border rounded-2xl bg-card overflow-hidden divide-y divide-border/60 shadow-xs">
                {topics.map((topic, index) => {
                  const isCreatorOrAdmin =
                    !isPlaceholderData &&
                    user &&
                    (isAdminRole(user.role) || (topic as any).createdById === user.id);

                  return (
                    <div
                      key={topic.id}
                      onClick={() => {
                        if (!isPlaceholderData) {
                          handleTopicClick(topic.id);
                        }
                      }}
                      className={`group p-4 sm:p-5 flex items-center justify-between transition-colors ${
                        isPlaceholderData ? "cursor-default opacity-80" : "cursor-pointer hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        {/* Topic Number matching handwritten diagram: 1., 2., 3. */}
                        <span className="font-mono text-sm sm:text-base font-semibold text-muted-foreground w-6 sm:w-8 shrink-0">
                          {index + 1}.
                        </span>

                        <Folder className="w-5 h-5 text-primary shrink-0" />

                        <div className="min-w-0">
                          <span className="font-semibold text-base sm:text-lg text-foreground group-hover:text-primary transition-colors">
                            {topic.name}
                          </span>
                          {topic.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                              {topic.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <Badge variant="secondary" className="text-xs font-normal">
                          {topic.subtopics.length} Subtopic{topic.subtopics.length === 1 ? "" : "s"}
                        </Badge>
                        <Badge variant="outline" className="text-xs font-normal hidden sm:inline-flex">
                          {topic.resourceCount || 0} Material{(topic.resourceCount || 0) === 1 ? "" : "s"}
                        </Badge>

                        {isCreatorOrAdmin && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => openEditTopic(topic, e)}
                              className="p-1 text-muted-foreground hover:text-primary transition-colors"
                              title="Edit Topic"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget({
                                  type: "topic",
                                  id: topic.id,
                                  name: topic.name,
                                  itemCount: (topic.resourceCount || 0) + topic.subtopics.length,
                                });
                              }}
                              className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                              title="Delete Topic"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* LEVEL 2: MAIN TOPIC SELECTED — SHOW SUBTOPICS & DIRECT MATERIALS */}
        {currentTopicId && !currentSubtopicId && activeTopic && !currentSearch && (
          <div className="space-y-10">
            {/* Topic Header Banner */}
            <div className="p-6 sm:p-8 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-md">
                    {getTopicIcon(activeTopic.icon || activeTopic.name, "w-7 h-7")}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl sm:text-3xl font-display font-bold text-foreground">
                        {activeTopic.name}
                      </h2>
                      {canUpload && (
                        <button
                          type="button"
                          onClick={(e) => openEditTopic(activeTopic, e)}
                          className="text-muted-foreground hover:text-primary transition-colors p-1"
                          title="Rename / Edit Topic"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground max-w-2xl leading-relaxed">
                      {activeTopic.description || "Browse all subtopics and learning documents in this topic."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTopicClick("")}
                    className="gap-1.5 text-xs h-9"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    All Topics
                  </Button>
                  {canUpload && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openCreateSubtopic(activeTopic.id)}
                        className="gap-1.5 text-xs h-9"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Subtopic
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => navigate(`/ppt-library/upload?topicId=${activeTopic.id}`)}
                        className="gap-1.5 text-xs h-9"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Add Materials
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Subtopics Grid in this Topic */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-primary" />
                  Subtopics in {activeTopic.name} ({activeTopic.subtopics.length})
                </h3>
              </div>

              {activeTopic.subtopics.length === 0 ? (
                <div className="text-center py-8 px-4 rounded-2xl border border-dashed border-border bg-card/40">
                  <p className="text-sm text-muted-foreground">
                    No subtopics created yet in this topic.
                  </p>
                  {canUpload && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openCreateSubtopic(activeTopic.id)}
                      className="mt-3 gap-1.5 text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Create First Subtopic
                    </Button>
                  )}
                </div>
              ) : (
                <div className="border border-border rounded-2xl bg-card overflow-hidden divide-y divide-border/60 shadow-xs">
                  {activeTopic.subtopics.map((sub, idx) => (
                    <div
                      key={sub.id}
                      onClick={() => handleSubtopicClick(sub.id)}
                      className="group cursor-pointer p-4 sm:p-5 flex items-center justify-between hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        {/* Letter index matching handwritten spec: a. CNN, b. ANN */}
                        <span className="font-mono text-sm sm:text-base font-semibold text-muted-foreground w-6 shrink-0">
                          {String.fromCharCode(97 + (idx % 26))}.
                        </span>
                        <Folder className="w-5 h-5 text-primary shrink-0" />
                        <div className="min-w-0">
                          <span className="font-semibold text-base text-foreground group-hover:text-primary transition-colors">
                            {sub.name}
                          </span>
                          {sub.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                              {sub.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <Badge variant="secondary" className="text-xs font-normal">
                          {sub.resourceCount || 0} material{(sub.resourceCount || 0) === 1 ? "" : "s"}
                        </Badge>
                        {canUpload && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => openEditSubtopic(sub, e)}
                              className="p-1 text-muted-foreground hover:text-primary transition-colors"
                              title="Edit Subtopic"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget({
                                  type: "subtopic",
                                  id: sub.id,
                                  name: sub.name,
                                  itemCount: sub.resourceCount || 0,
                                });
                              }}
                              className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                              title="Delete Subtopic"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Direct Materials under this Main Topic (Only shown when direct materials exist) */}
            {directMaterials.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-border/40">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" />
                      Main Topic Materials &bull; Direct Materials under {activeTopic.name} ({directMaterials.length})
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Documents uploaded directly under this topic without a specific subtopic.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {directMaterials.map((ppt) => renderMaterialRow(ppt))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* LEVEL 3: SUBTOPIC SELECTED — SHOW SUBTOPIC HEADER & MATERIALS (Box 3 in handwritten diagram) */}
        {currentTopicId && currentSubtopicId && !currentSearch && (
          <div className="space-y-8">
            {activeTopic && activeSubtopic ? (
              <>
                {/* Subtopic Header Banner */}
                <div className="p-6 sm:p-8 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 shadow-sm">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                      <span>Topic:</span>
                      <button
                        type="button"
                        onClick={() => handleSubtopicClick("")}
                        className="font-semibold text-primary hover:underline transition-colors"
                      >
                        {activeTopic.name}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl sm:text-3xl font-display font-bold text-foreground">
                        {activeSubtopic.name}
                      </h2>
                      {canUpload && (
                        <button
                          type="button"
                          onClick={(e) => openEditSubtopic(activeSubtopic, e)}
                          className="text-muted-foreground hover:text-primary transition-colors p-1"
                          title="Rename / Edit Subtopic"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {activeSubtopic.description && (
                      <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
                        {activeSubtopic.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSubtopicClick("")}
                      className="gap-1.5 text-xs h-9"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back to {activeTopic.name}
                    </Button>
                    {canUpload && (
                      <Button
                        size="sm"
                        onClick={() => navigate(`/ppt-library/upload?topicId=${activeTopic.id}&subtopicId=${activeSubtopic.id}`)}
                        className="gap-1.5 text-xs h-9 shadow-xs"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Upload to {activeSubtopic.name}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Subtopic Materials Listing (Matching Box 3 in handwritten diagram!) */}
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/40">
                    <div className="text-sm text-muted-foreground">
                      {loading ? (
                        <span>Loading materials...</span>
                      ) : (
                        <span>
                          Showing <strong className="text-foreground">{resources.length}</strong> of{" "}
                          <strong className="text-foreground">{pagination.total}</strong> study material
                          {pagination.total === 1 ? "" : "s"} in{" "}
                          <strong className="text-foreground">{activeSubtopic.name}</strong>
                        </span>
                      )}
                    </div>

                    {/* Sort Controls */}
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      <span className="text-muted-foreground shrink-0 flex items-center gap-1">
                        <Filter className="w-3.5 h-3.5" /> Sort:
                      </span>
                      <div className="flex items-center rounded-lg bg-card border border-border p-0.5 text-xs">
                        {(["newest", "oldest", "popular", "views", "title"] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => handleSortChange(s)}
                            className={`px-3 py-1.5 rounded-md transition-colors ${
                              currentSort === s
                                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {s === "newest"
                              ? "Newest"
                              : s === "oldest"
                              ? "Oldest"
                              : s === "popular"
                              ? "Most Downloaded"
                              : s === "views"
                              ? "Most Viewed"
                              : "A-Z"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Clean Horizontal Document Rows (Matching Box 3 in handwritten spec) */}
                  {loading ? (
                    <div className="space-y-3 mt-6">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="animate-pulse p-4 sm:p-5 rounded-2xl border border-border bg-card/60 h-24 flex items-center justify-between">
                          <div className="flex items-center gap-3 sm:gap-4">
                            <div className="w-11 h-11 rounded-xl bg-muted/60" />
                            <div className="space-y-2">
                              <div className="h-4 bg-muted rounded w-48 sm:w-64" />
                              <div className="h-3 bg-muted/60 rounded w-32 sm:w-40" />
                            </div>
                          </div>
                          <div className="h-8 bg-muted/40 rounded w-24 sm:w-32" />
                        </div>
                      ))}
                    </div>
                  ) : isResourcesError && !resourceData ? (
                    <div className="text-center py-16 px-4 bg-card/40 rounded-3xl border border-border/60">
                      <div className="w-14 h-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle className="w-7 h-7" />
                      </div>
                      <h3 className="text-lg font-semibold font-display text-foreground">Could not load study materials</h3>
                      <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto">
                        {resourcesError instanceof Error ? resourcesError.message : "A connection issue occurred while fetching study materials."}
                      </p>
                      <Button variant="outline" size="sm" onClick={() => refetchResources()} className="mt-5 gap-2">
                        <Sparkles className="w-3.5 h-3.5" />
                        Try Again
                      </Button>
                    </div>
                  ) : resources.length === 0 ? (
                    <div className="text-center py-16 px-4 bg-card/20 rounded-3xl border border-dashed border-border">
                      <div className="w-16 h-16 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto text-muted-foreground mb-4">
                        <BookOpen className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-semibold font-display text-foreground">
                        No study materials in {activeSubtopic.name} yet
                      </h3>
                      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                        {currentFileType !== "all"
                          ? `No ${currentFileType === "presentation" ? "presentation decks" : "PDF documents"} match this filter in ${activeSubtopic.name}.`
                          : `Instructors haven't uploaded documents under ${activeSubtopic.name} yet.`}
                      </p>
                      {canUpload && (
                        <Button
                          size="sm"
                          onClick={() => navigate(`/ppt-library/upload?topicId=${activeTopic.id}&subtopicId=${activeSubtopic.id}`)}
                          className="mt-6 gap-2"
                        >
                          <Upload className="w-4 h-4" />
                          Upload First Material to {activeSubtopic.name}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {resources.map((ppt) => renderMaterialRow(ppt))}
                    </div>
                  )}

                  {/* Pagination Controls */}
                  {pagination.totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-8">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage <= 1}
                        className="text-xs h-8"
                      >
                        Previous
                      </Button>
                      <span className="text-xs text-muted-foreground px-2">
                        Page {currentPage} of {pagination.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage >= pagination.totalPages}
                        className="text-xs h-8"
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-16 px-4 bg-card/30 rounded-2xl border border-border">
                <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
                <h3 className="text-lg font-bold text-foreground">Subtopic not found</h3>
                <p className="text-xs text-muted-foreground mt-1">The requested subtopic could not be located.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSubtopicClick("")}
                  className="mt-4 gap-1.5 text-xs"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Topic
                </Button>
              </div>
            )}
          </div>
        )}

        {/* SEARCH RESULTS OR GLOBAL FILE-TYPE FILTER */}
        {(currentSearch || (!currentTopicId && currentFileType !== "all")) && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/40">
              <div>
                <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground flex items-center gap-2">
                  <Search className="w-5 h-5 text-primary" />
                  {currentSearch ? (
                    <>Search Results for &ldquo;{currentSearch}&rdquo;</>
                  ) : (
                    <>All {currentFileType === "presentation" ? "Presentation Decks" : "PDF Documents"}</>
                  )}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Showing <strong className="text-foreground">{resources.length}</strong> of{" "}
                  <strong className="text-foreground">{pagination.total}</strong> study material
                  {pagination.total === 1 ? "" : "s"}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newParams = new URLSearchParams(searchParams);
                    newParams.delete("search");
                    newParams.delete("fileType");
                    newParams.set("page", "1");
                    setSearchParams(newParams);
                    setSearchInput("");
                  }}
                  className="gap-1.5 text-xs h-8"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  View All Topics
                </Button>
              </div>
            </div>

            {/* Sort Controls */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground shrink-0 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5" /> Sort:
                </span>
                <div className="flex items-center rounded-lg bg-card border border-border p-0.5 text-xs">
                  {(["newest", "oldest", "popular", "views", "title"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSortChange(s)}
                      className={`px-3 py-1.5 rounded-md transition-colors ${
                        currentSort === s
                          ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s === "newest"
                        ? "Newest"
                        : s === "oldest"
                        ? "Oldest"
                        : s === "popular"
                        ? "Most Downloaded"
                        : s === "views"
                        ? "Most Viewed"
                        : "A-Z"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Clean Horizontal Document Rows for Search */}
            {loading ? (
              <div className="space-y-3 mt-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="animate-pulse p-4 sm:p-5 rounded-2xl border border-border bg-card/60 h-24 flex items-center justify-between">
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="w-11 h-11 rounded-xl bg-muted/60" />
                      <div className="space-y-2">
                        <div className="h-4 bg-muted rounded w-48 sm:w-64" />
                        <div className="h-3 bg-muted/60 rounded w-32 sm:w-40" />
                      </div>
                    </div>
                    <div className="h-8 bg-muted/40 rounded w-24 sm:w-32" />
                  </div>
                ))}
              </div>
            ) : isResourcesError && !resourceData ? (
              <div className="text-center py-16 px-4 bg-card/40 rounded-3xl border border-border/60">
                <div className="w-14 h-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-semibold font-display text-foreground">Could not load study materials</h3>
                <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto">
                  {resourcesError instanceof Error ? resourcesError.message : "A connection issue occurred while fetching study materials."}
                </p>
                <Button variant="outline" size="sm" onClick={() => refetchResources()} className="mt-5 gap-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  Try Again
                </Button>
              </div>
            ) : resources.length === 0 ? (
              <div className="text-center py-16 px-4 bg-card/20 rounded-3xl border border-dashed border-border">
                <div className="w-16 h-16 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto text-muted-foreground mb-4">
                  <Search className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-semibold font-display text-foreground">No matching study materials found</h3>
                <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                  {currentSearch
                    ? `No materials matched "${currentSearch}". Try a different keyword, topic name, or reset your search.`
                    : "No materials found for the selected file type."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newParams = new URLSearchParams(searchParams);
                    newParams.delete("search");
                    newParams.delete("fileType");
                    newParams.set("page", "1");
                    setSearchParams(newParams);
                    setSearchInput("");
                  }}
                  className="mt-6"
                >
                  Clear Search & View Topics
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {resources.map((ppt) => renderMaterialRow(ppt))}
              </div>
            )}

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="text-xs h-8"
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground px-2">
                  Page {currentPage} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= pagination.totalPages}
                  className="text-xs h-8"
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* MODAL 1: Create / Edit Topic Dialog */}
      <Dialog open={showTopicModal} onOpenChange={setShowTopicModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTopic ? "Edit Main Topic" : "Create New Main Topic"}</DialogTitle>
            <DialogDescription>
              {editingTopic
                ? "Rename or update topic description and icon."
                : "Add a new main learning topic to organize subtopics and materials."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveTopic} className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Topic Name *</Label>
              <Input
                value={topicName}
                onChange={(e) => setTopicName(e.target.value)}
                placeholder="e.g. Deep Learning"
                className="mt-1"
                required
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Description</Label>
              <Textarea
                value={topicDesc}
                onChange={(e) => setTopicDesc(e.target.value)}
                placeholder="Brief summary of what this subject covers..."
                className="mt-1 resize-none"
                rows={3}
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Icon</Label>
              <select
                value={topicIcon}
                onChange={(e) => setTopicIcon(e.target.value)}
                className="mt-1 w-full h-9 px-2 text-xs rounded-md border border-border bg-card"
              >
                <option value="Brain">Brain / AI</option>
                <option value="Cpu">CPU / Systems</option>
                <option value="Database">Database / Data</option>
                <option value="Code">Code / Programming</option>
                <option value="Globe">Web / Networking</option>
                <option value="Terminal">Terminal / OS</option>
                <option value="Server">Server / DevOps</option>
                <option value="Layers">General / Layers</option>
              </select>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowTopicModal(false)}
                disabled={savingTopic}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingTopic || !topicName.trim()}>
                {savingTopic ? "Saving..." : editingTopic ? "Save Changes" : "Create Topic"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: Create / Edit Subtopic Dialog */}
      <Dialog open={showSubtopicModal} onOpenChange={setShowSubtopicModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSubtopic ? "Edit Subtopic" : "Create New Subtopic"}</DialogTitle>
            <DialogDescription>
              Add a focused subtopic under a main topic (e.g. CNN under Deep Learning).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveSubtopic} className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Parent Topic *</Label>
              <select
                value={subtopicParentId}
                onChange={(e) => setSubtopicParentId(e.target.value)}
                className="mt-1 w-full h-9 px-2 text-xs rounded-md border border-border bg-card"
                disabled={Boolean(editingSubtopic)}
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
                value={subtopicName}
                onChange={(e) => setSubtopicName(e.target.value)}
                placeholder="e.g. Convolutional Neural Networks"
                className="mt-1"
                required
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Description</Label>
              <Textarea
                value={subtopicDesc}
                onChange={(e) => setSubtopicDesc(e.target.value)}
                placeholder="Brief summary of subtopic notes..."
                className="mt-1 resize-none"
                rows={2}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowSubtopicModal(false)}
                disabled={savingSubtopic}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingSubtopic || !subtopicName.trim()}>
                {savingSubtopic ? "Saving..." : editingSubtopic ? "Save Changes" : "Create Subtopic"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: Safe Deletion Confirmation Dialog */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Delete {deleteTarget?.type === "topic" ? "Main Topic" : deleteTarget?.type === "subtopic" ? "Subtopic" : "Study Material"}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;?
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 text-sm text-muted-foreground space-y-2">
            {deleteTarget?.type === "topic" && (deleteTarget.itemCount || 0) > 0 && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                ⚠️ This topic contains {deleteTarget.itemCount} item(s) (subtopics or materials). Deleting this topic will permanently remove all child subtopics and documents from cloud storage. This action cannot be undone.
              </div>
            )}
            {deleteTarget?.type === "subtopic" && (deleteTarget.itemCount || 0) > 0 && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                ⚠️ This subtopic contains {deleteTarget.itemCount} material(s). Deleting it will permanently remove all associated documents from cloud storage. This action cannot be undone.
              </div>
            )}
            {deleteTarget?.type === "material" && (
              <p>This will permanently remove the study material and its document from cloud storage.</p>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting
                ? "Deleting..."
                : deleteTarget?.itemCount
                ? `Delete (${deleteTarget.itemCount} items)`
                : "Confirm Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: Edit Material Details Dialog */}
      <Dialog open={Boolean(editingMaterial)} onOpenChange={(open) => !open && setEditingMaterial(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Study Material Details</DialogTitle>
            <DialogDescription>
              Update material title, description, categories, and tags.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveMaterial} className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Title *</Label>
              <Input
                value={editMaterialTitle}
                onChange={(e) => setEditMaterialTitle(e.target.value)}
                placeholder="Title"
                className="mt-1"
                required
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Description</Label>
              <Textarea
                value={editMaterialDesc}
                onChange={(e) => setEditMaterialDesc(e.target.value)}
                placeholder="Description"
                className="mt-1 resize-none"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Main Topic</Label>
                <select
                  value={editMaterialTopicId}
                  onChange={(e) => {
                    setEditMaterialTopicId(e.target.value);
                    setEditMaterialSubtopicId("");
                  }}
                  className="mt-1 w-full h-9 px-2 text-xs rounded-md border border-border bg-card"
                >
                  <option value="">(None / Uncategorized)</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-semibold">Subtopic</Label>
                <select
                  value={editMaterialSubtopicId}
                  onChange={(e) => setEditMaterialSubtopicId(e.target.value)}
                  className="mt-1 w-full h-9 px-2 text-xs rounded-md border border-border bg-card"
                  disabled={!editMaterialTopicId}
                >
                  <option value="">(None — Directly under Main Topic)</option>
                  {editModalSubtopics.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Academic Level</Label>
                <select
                  value={editMaterialLevel}
                  onChange={(e) => setEditMaterialLevel(e.target.value)}
                  className="mt-1 w-full h-9 px-2 text-xs rounded-md border border-border bg-card"
                >
                  <option value="School / Beginner">School / Beginner</option>
                  <option value="Undergraduate">Undergraduate</option>
                  <option value="Postgraduate">Postgraduate</option>
                  <option value="Research / Professional">Research / Professional</option>
                </select>
              </div>

              <div>
                <Label className="text-xs font-semibold">Tags (comma-separated)</Label>
                <Input
                  value={editMaterialTags}
                  onChange={(e) => setEditMaterialTags(e.target.value)}
                  placeholder="e.g. cnn, deep-learning"
                  className="mt-1"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditingMaterial(null)}
                disabled={savingMaterial}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingMaterial || !editMaterialTitle.trim()}>
                {savingMaterial ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
