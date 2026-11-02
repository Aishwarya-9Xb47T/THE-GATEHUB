import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Presentation,
  Upload,
  Eye,
  Edit,
  Trash2,
  RefreshCw,
  FolderPlus,
  Download,
  CheckCircle,
  FileText,
  Search,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { useInvalidatePptCategories } from "@/lib/pptLibrary/usePptQuery";
import {
  fetchMyResources,
  fetchLibraryTopics,
  publishPptResource,
  unpublishPptResource,
  deletePptResource,
  replacePptFile,
  updatePptMetadata,
  createTopic,
  createSubtopic,
  PPTResource,
  PPTTopic,
} from "@/lib/pptLibrary/api";
import { useUserStore, isAdminRole } from "@/store/userStore";
import { useToastStore } from "@/store/toastStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

export function InstructorPptManagementPage() {
  const navigate = useNavigate();
  const { user } = useUserStore();
  const toast = useToastStore((s) => s.add);

  const [resources, setResources] = useState<PPTResource[]>([]);
  const [topics, setTopics] = useState<PPTTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [stats, setStats] = useState({
    totalPpts: 0,
    publishedPpts: 0,
    draftPpts: 0,
    totalDownloads: 0,
    totalViews: 0,
  });

  // Edit Metadata Modal
  const [editingPpt, setEditingPpt] = useState<PPTResource | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editTopicId, setEditTopicId] = useState("");
  const [editSubtopicId, setEditSubtopicId] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editLevel, setEditLevel] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Replace File Modal
  const [replacingPpt, setReplacingPpt] = useState<PPTResource | null>(null);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [replaceNote, setReplaceNote] = useState("");
  const [replacingFileLoading, setReplacingFileLoading] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Delete Confirmation Modal
  const [deletingPpt, setDeletingPpt] = useState<PPTResource | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);

  // New Category / Topic Modal
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicDesc, setNewTopicDesc] = useState("");
  const [selectedParentTopicId, setSelectedParentTopicId] = useState("");
  const [newSubtopicName, setNewSubtopicName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const { invalidate: invalidateCategories } = useInvalidatePptCategories();

  const isApproved =
    isAdminRole(user?.role) ||
    (user?.role === "instructor" && (user as any).instructorApprovalStatus === "APPROVED");

  const loadData = async () => {
    try {
      setLoading(true);
      const [resData, topicsData] = await Promise.all([
        fetchMyResources({
          search: search.trim() || undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
        }),
        fetchLibraryTopics(),
      ]);
      setResources(resData.data);
      if (resData.stats) setStats(resData.stats);
      setTopics(topicsData);
    } catch (err: any) {
      console.error("Failed to load instructor PPTs:", err);
      toast({ title: "Failed to load presentations", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  // Toggle Publish / Unpublish
  const handleTogglePublish = async (ppt: PPTResource) => {
    try {
      if (ppt.status === "published") {
        await unpublishPptResource(ppt.id);
        toast({ title: "Moved to draft", variant: "success" });
      } else {
        await publishPptResource(ppt.id);
        toast({ title: "Presentation published to library", variant: "success" });
      }
      loadData();
    } catch (err: any) {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    }
  };

  // Open Edit Modal
  const openEditModal = (ppt: PPTResource) => {
    setEditingPpt(ppt);
    setEditTitle(ppt.title);
    setEditDesc(ppt.description || "");
    setEditTopicId(ppt.topicId);
    setEditSubtopicId(ppt.subtopicId);
    setEditTags(ppt.tags ? ppt.tags.join(", ") : "");
    setEditLevel(ppt.academicLevel || "Undergraduate");
  };

  const handleSaveEdit = async () => {
    if (!editingPpt) return;
    try {
      setSavingEdit(true);
      const tags = editTags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      await updatePptMetadata(editingPpt.id, {
        title: editTitle.trim(),
        description: editDesc.trim(),
        topicId: editTopicId,
        subtopicId: editSubtopicId,
        academicLevel: editLevel,
        tags,
      });

      toast({ title: "Presentation details updated", variant: "success" });
      setEditingPpt(null);
      loadData();
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  // Open Replace Modal
  const openReplaceModal = (ppt: PPTResource) => {
    setReplacingPpt(ppt);
    setReplacementFile(null);
    setReplaceNote("");
  };

  const handleReplaceFile = async () => {
    if (!replacingPpt || !replacementFile) return;
    try {
      setReplacingFileLoading(true);
      const formData = new FormData();
      formData.append("file", replacementFile);
      if (replaceNote) formData.append("changeNote", replaceNote.trim());

      await replacePptFile(replacingPpt.id, formData);
      toast({ title: "File updated to new version", variant: "success" });
      setReplacingPpt(null);
      loadData();
    } catch (err: any) {
      toast({ title: "Replacement failed", description: err.message, variant: "destructive" });
    } finally {
      setReplacingFileLoading(false);
    }
  };

  // Delete Handlers
  const handleDelete = async () => {
    if (!deletingPpt) return;
    try {
      setDeletingLoading(true);
      await deletePptResource(deletingPpt.id);
      toast({ title: "Presentation deleted", variant: "success" });
      setDeletingPpt(null);
      loadData();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setDeletingLoading(false);
    }
  };

  // Create Topic / Subtopic
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreatingCategory(true);
      if (selectedParentTopicId && newSubtopicName.trim()) {
        await createSubtopic({
          topicId: selectedParentTopicId,
          name: newSubtopicName.trim(),
        });
        toast({ title: "Subtopic created successfully", variant: "success" });
      } else if (newTopicName.trim()) {
        await createTopic({
          name: newTopicName.trim(),
          description: newTopicDesc.trim() || undefined,
        });
        toast({ title: "Topic created successfully", variant: "success" });
      }
      setNewTopicName("");
      setNewTopicDesc("");
      setNewSubtopicName("");
      setShowCategoryModal(false);
      await invalidateCategories();
      loadData();
    } catch (err: any) {
      toast({ title: "Category creation failed", description: err.message, variant: "destructive" });
    } finally {
      setCreatingCategory(false);
    }
  };

  const activeEditTopic = topics.find((t) => t.id === editTopicId);
  const editAvailableSubtopics = activeEditTopic?.subtopics || [];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">PPT Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your presentations, replace versions, and publish slide decks to THE GATEHUB PPT Library.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCategoryModal(true)}
            className="gap-2 text-xs"
          >
            <FolderPlus className="w-4 h-4" />
            Add Topic/Subtopic
          </Button>

          <Button
            size="sm"
            onClick={() => navigate("/ppt-library/upload")}
            className="gap-2 shadow-sm"
            disabled={!isApproved}
          >
            <Upload className="w-4 h-4" />
            Upload PPT
          </Button>
        </div>
      </div>

      {/* Approval Status Banner */}
      {!isApproved && (
        <Card className="border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <CardContent className="p-4 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm">Instructor Account Under Review</h4>
              <p className="text-xs mt-1 leading-relaxed">
                Your instructor registration is awaiting one-time administrator approval. Once approved, you will be
                able to publish presentations directly to students without waiting for approval on future uploads.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border shadow-xs">
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Total Uploads</span>
            <p className="text-2xl font-bold font-display text-foreground mt-1">{stats.totalPpts}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-xs">
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Published Decks</span>
            <p className="text-2xl font-bold font-display text-primary mt-1">{stats.publishedPpts}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-xs">
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Drafts</span>
            <p className="text-2xl font-bold font-display text-muted-foreground mt-1">{stats.draftPpts}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-xs">
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Total Downloads</span>
            <p className="text-2xl font-bold font-display text-foreground mt-1">{stats.totalDownloads}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <form onSubmit={handleSearch} className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search your presentations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </form>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 px-3 rounded-lg border border-border bg-card text-foreground text-xs focus:ring-primary"
          >
            <option value="all">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Drafts</option>
          </select>

          <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5 h-10">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Presentations Table */}
      <Card className="border-border bg-card shadow-xs rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border/60 text-xs font-semibold text-muted-foreground uppercase">
              <tr>
                <th className="px-5 py-3.5">Title</th>
                <th className="px-4 py-3.5">Topic & Subtopic</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Uploaded</th>
                <th className="px-4 py-3.5 text-center">Downloads</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground">
                    Loading presentations...
                  </td>
                </tr>
              ) : resources.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-muted-foreground">
                    <Presentation className="w-10 h-10 mx-auto text-muted-foreground/60 mb-2" />
                    <p className="font-semibold text-foreground">No presentations found</p>
                    <p className="text-xs mt-1">Upload your first slide deck to get started.</p>
                  </td>
                </tr>
              ) : (
                resources.map((ppt) => (
                  <tr key={ppt.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-foreground">
                        <Link to={`/ppt-library/${ppt.id}/view`} className="hover:text-primary transition-colors">
                          {ppt.title}
                        </Link>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">
                        {ppt.originalFileName} ({Math.round(ppt.fileSize / 1024)} KB)
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <div className="text-xs font-medium text-foreground">{ppt.topic.name}</div>
                      <div className="text-[11px] text-muted-foreground">{ppt.subtopic.name}</div>
                    </td>

                    <td className="px-4 py-4">
                      <Badge
                        variant={ppt.status === "published" ? "default" : "secondary"}
                        className="text-[11px] font-semibold"
                      >
                        {ppt.status === "published" ? "Published" : "Draft"}
                      </Badge>
                    </td>

                    <td className="px-4 py-4 text-xs text-muted-foreground">
                      {new Date(ppt.createdAt).toLocaleDateString()}
                    </td>

                    <td className="px-4 py-4 text-xs text-center font-semibold text-foreground">
                      {ppt.downloadCount}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => navigate(`/ppt-library/${ppt.id}/view`)}
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => openEditModal(ppt)}
                          title="Edit Details"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => openReplaceModal(ppt)}
                          title="Replace File"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-8 px-2"
                          onClick={() => handleTogglePublish(ppt)}
                        >
                          {ppt.status === "published" ? "Unpublish" : "Publish"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => setDeletingPpt(ppt)}
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Details Dialog */}
      <Dialog open={Boolean(editingPpt)} onOpenChange={(open) => !open && setEditingPpt(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Presentation Details</DialogTitle>
            <DialogDescription>Update presentation metadata, categories, and tags.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Title</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1"
                placeholder="Title"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Description</Label>
              <Textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="mt-1 resize-none"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Topic</Label>
                <select
                  value={editTopicId}
                  onChange={(e) => setEditTopicId(e.target.value)}
                  className="mt-1 w-full h-9 px-2 text-xs rounded-md border border-border bg-card"
                >
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
                  value={editSubtopicId}
                  onChange={(e) => setEditSubtopicId(e.target.value)}
                  className="mt-1 w-full h-9 px-2 text-xs rounded-md border border-border bg-card"
                >
                  {editAvailableSubtopics.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Tags (comma separated)</Label>
              <Input
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                className="mt-1"
                placeholder="tag1, tag2"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingPpt(null)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit || !editTitle.trim()}>
              {savingEdit ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Replace File Dialog */}
      <Dialog open={Boolean(replacingPpt)} onOpenChange={(open) => !open && setReplacingPpt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Replace Presentation File</DialogTitle>
            <DialogDescription>
              Upload an updated version of this presentation. Version history will be preserved.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div
              onClick={() => replaceInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              <input
                ref={replaceInputRef}
                type="file"
                accept=".pptx,.ppt"
                onChange={(e) => setReplacementFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <Upload className="w-8 h-8 text-primary mx-auto mb-2" />
              {replacementFile ? (
                <div>
                  <p className="text-sm font-semibold">{replacementFile.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(replacementFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold">Select new presentation file</p>
                  <p className="text-xs text-muted-foreground mt-0.5">.pptx or .ppt up to 100 MB</p>
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs font-semibold">Version Change Note (Optional)</Label>
              <Input
                value={replaceNote}
                onChange={(e) => setReplaceNote(e.target.value)}
                placeholder="e.g. Updated slide 4 diagram and exercises"
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setReplacingPpt(null)} disabled={replacingFileLoading}>
              Cancel
            </Button>
            <Button
              onClick={handleReplaceFile}
              disabled={replacingFileLoading || !replacementFile}
            >
              {replacingFileLoading ? "Uploading Version..." : "Update File Version"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(deletingPpt)} onOpenChange={(open) => !open && setDeletingPpt(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete Presentation?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deletingPpt?.title}&rdquo;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setDeletingPpt(null)} disabled={deletingLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletingLoading}>
              {deletingLoading ? "Deleting..." : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Topic / Subtopic Dialog */}
      <Dialog open={showCategoryModal} onOpenChange={setShowCategoryModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Topic or Subtopic</DialogTitle>
            <DialogDescription>
              Create new categories to organize presentation slides in the library.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCategory} className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Parent Topic</Label>
              <select
                value={selectedParentTopicId}
                onChange={(e) => setSelectedParentTopicId(e.target.value)}
                className="mt-1 w-full h-9 px-2 text-xs rounded-md border border-border bg-card"
              >
                <option value="">(None - Create New Top-Level Topic)</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedParentTopicId ? (
              <div>
                <Label className="text-xs font-semibold">Subtopic Name *</Label>
                <Input
                  value={newSubtopicName}
                  onChange={(e) => setNewSubtopicName(e.target.value)}
                  placeholder="e.g. Neural Networks"
                  className="mt-1"
                  required
                />
              </div>
            ) : (
              <>
                <div>
                  <Label className="text-xs font-semibold">Topic Name *</Label>
                  <Input
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    placeholder="e.g. Artificial Intelligence"
                    className="mt-1"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Description</Label>
                  <Input
                    value={newTopicDesc}
                    onChange={(e) => setNewTopicDesc(e.target.value)}
                    placeholder="Optional description"
                    className="mt-1"
                  />
                </div>
              </>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowCategoryModal(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  creatingCategory ||
                  (selectedParentTopicId ? !newSubtopicName.trim() : !newTopicName.trim())
                }
              >
                {creatingCategory ? "Creating..." : "Create Category"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

