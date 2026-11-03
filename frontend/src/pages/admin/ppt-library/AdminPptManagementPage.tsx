import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useInvalidatePptCategories } from "@/lib/pptLibrary/usePptQuery";
import {
  Presentation,
  Search,
  Filter,
  Eye,
  Trash2,
  FolderPlus,
  RefreshCw,
  FolderTree,
  Download,
  ShieldCheck,
  Upload,
  Plus,
  AlertTriangle,
  User,
  Layers,
  Edit,
} from "lucide-react";
import {
  fetchAdminPptLibrary,
  fetchLibraryTopics,
  updateAdminPptStatus,
  deletePptResource,
  createTopic,
  updateTopic,
  deleteTopic,
  createSubtopic,
  updateSubtopic,
  deleteSubtopic,
  PPTResource,
  PPTTopic,
  PPTAdminStats,
} from "@/lib/pptLibrary/api";
import { useToastStore } from "@/store/toastStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { UnifiedAvatar } from "@/components/common/UnifiedAvatar";

export function AdminPptManagementPage() {
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.add);

  const [activeTab, setActiveTab] = useState("all-ppts");
  const { invalidate: invalidateCategories } = useInvalidatePptCategories();
  const [resources, setResources] = useState<PPTResource[]>([]);
  const [topics, setTopics] = useState<PPTTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");

  const [stats, setStats] = useState<PPTAdminStats>({
    totalPpts: 0,
    publishedPpts: 0,
    draftPpts: 0,
    totalDownloads: 0,
    totalViews: 0,
    totalTopics: 0,
    totalSubtopics: 0,
    contributingInstructors: 0,
  });

  // Category Modal State
  const [showAddTopicModal, setShowAddTopicModal] = useState(false);
  const [topicName, setTopicName] = useState("");
  const [topicDesc, setTopicDesc] = useState("");
  const [editingTopic, setEditingTopic] = useState<PPTTopic | null>(null);

  const [showAddSubtopicModal, setShowAddSubtopicModal] = useState(false);
  const [subtopicParentId, setSubtopicParentId] = useState("");
  const [subtopicName, setSubtopicName] = useState("");
  const [subtopicDesc, setSubtopicDesc] = useState("");

  // Delete Item Confirmation State
  const [deletingResource, setDeletingResource] = useState<PPTResource | null>(null);
  const [deletingActionLoading, setDeletingActionLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [resData, topicsData] = await Promise.all([
        fetchAdminPptLibrary({
          search: search.trim() || undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
          topicId: topicFilter !== "all" ? topicFilter : undefined,
        }),
        fetchLibraryTopics(true),
      ]);
      setResources(resData.data);
      if (resData.stats) setStats(resData.stats);
      setTopics(topicsData);
    } catch (err: any) {
      console.error("Failed to load admin PPT library data:", err);
      toast({ title: "Failed to load PPT library data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, topicFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const handleStatusChange = async (pptId: string, status: "published" | "draft" | "archived") => {
    try {
      await updateAdminPptStatus(pptId, status);
      toast({ title: `Presentation status changed to ${status}`, variant: "success" });
      loadData();
    } catch (err: any) {
      toast({ title: "Failed to change status", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteResource = async () => {
    if (!deletingResource) return;
    try {
      setDeletingActionLoading(true);
      await deletePptResource(deletingResource.id);
      toast({ title: "Presentation deleted permanently", variant: "success" });
      setDeletingResource(null);
      loadData();
    } catch (err: any) {
      toast({ title: "Failed to delete presentation", description: err.message, variant: "destructive" });
    } finally {
      setDeletingActionLoading(false);
    }
  };

  // Topic CRUD
  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTopic) {
        await updateTopic(editingTopic.id, {
          name: topicName.trim(),
          description: topicDesc.trim() || undefined,
        });
        toast({ title: "Topic updated", variant: "success" });
      } else {
        await createTopic({
          name: topicName.trim(),
          description: topicDesc.trim() || undefined,
        });
        toast({ title: "Topic created", variant: "success" });
      }
      await invalidateCategories();
      setShowAddTopicModal(false);
      setEditingTopic(null);
      setTopicName("");
      setTopicDesc("");
      loadData();
    } catch (err: any) {
      toast({ title: "Topic action failed", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteTopic = async (topic: PPTTopic) => {
    if (!confirm(`Delete topic "${topic.name}"? Subtopics and presentations must be empty.`)) return;
    try {
      await deleteTopic(topic.id);
      toast({ title: "Topic deleted", variant: "success" });
      await invalidateCategories();
      loadData();
    } catch (err: any) {
      toast({ title: "Cannot delete topic", description: err.message, variant: "destructive" });
    }
  };

  // Subtopic CRUD
  const handleCreateSubtopic = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createSubtopic({
        topicId: subtopicParentId,
        name: subtopicName.trim(),
        description: subtopicDesc.trim() || undefined,
      });
      toast({ title: "Subtopic created", variant: "success" });
      setShowAddSubtopicModal(false);
      setSubtopicName("");
      setSubtopicDesc("");
      loadData();
    } catch (err: any) {
      toast({ title: "Subtopic action failed", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteSubtopic = async (subtopicId: string, subtopicName: string) => {
    if (!confirm(`Delete subtopic "${subtopicName}"? Presentations must be empty.`)) return;
    try {
      await deleteSubtopic(subtopicId);
      toast({ title: "Subtopic deleted", variant: "success" });
      await invalidateCategories();
      loadData();
    } catch (err: any) {
      toast({ title: "Cannot delete subtopic", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">Study Materials Administration</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor presentations, manage topic hierarchies, and oversee academic slide resources.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild className="gap-2">
            <Link to="/admin/instructor-approvals">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Instructor Approvals
            </Link>
          </Button>
          <Button size="sm" onClick={() => navigate("/ppt-library/upload")} className="gap-2 shadow-sm">
            <Upload className="w-4 h-4" />
            Upload PPT
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-card border-border shadow-xs">
          <CardContent className="p-4">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">Total PPTs</span>
            <p className="text-2xl font-bold font-display text-foreground mt-1">{stats.totalPpts}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-xs">
          <CardContent className="p-4">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">Published</span>
            <p className="text-2xl font-bold font-display text-primary mt-1">{stats.publishedPpts}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-xs">
          <CardContent className="p-4">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">Drafts</span>
            <p className="text-2xl font-bold font-display text-muted-foreground mt-1">{stats.draftPpts}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-xs">
          <CardContent className="p-4">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">Downloads</span>
            <p className="text-2xl font-bold font-display text-foreground mt-1">{stats.totalDownloads}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-xs">
          <CardContent className="p-4">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">Topics</span>
            <p className="text-2xl font-bold font-display text-foreground mt-1">{stats.totalTopics}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-xs">
          <CardContent className="p-4">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">Instructors</span>
            <p className="text-2xl font-bold font-display text-foreground mt-1">{stats.contributingInstructors}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted/60 p-1">
          <TabsTrigger value="all-ppts" className="gap-2 text-xs">
            <Presentation className="w-4 h-4" />
            All Presentations ({stats.totalPpts})
          </TabsTrigger>
          <TabsTrigger value="categories" className="gap-2 text-xs">
            <FolderTree className="w-4 h-4" />
            Topics & Subtopics ({stats.totalTopics})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: All Presentations */}
        <TabsContent value="all-ppts" className="space-y-6">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <form onSubmit={handleSearch} className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search presentations, instructors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10"
              />
            </form>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
                className="h-10 px-3 rounded-lg border border-border bg-card text-foreground text-xs"
              >
                <option value="all">All Topics</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 px-3 rounded-lg border border-border bg-card text-foreground text-xs"
              >
                <option value="all">All Statuses</option>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
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
                    <th className="px-5 py-3.5">Presentation</th>
                    <th className="px-4 py-3.5">Instructor</th>
                    <th className="px-4 py-3.5">Category</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-center">Downloads</th>
                    <th className="px-5 py-3.5 text-right">Admin Actions</th>
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
                        <p className="font-semibold text-foreground">No presentations match your filters</p>
                      </td>
                    </tr>
                  ) : (
                    resources.map((ppt) => (
                      <tr key={ppt.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-semibold text-foreground">
                            <Link
                              to={`/ppt-library/${ppt.id}/view`}
                              className="hover:text-primary transition-colors"
                            >
                              {ppt.title}
                            </Link>
                          </div>
                          <span className="text-xs text-muted-foreground font-mono">
                            {ppt.originalFileName} ({Math.round(ppt.fileSize / 1024)} KB)
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <UnifiedAvatar user={ppt.instructor as any} size="sm" />
                            <span className="text-xs font-medium text-foreground">
                              {ppt.instructor.firstName} {ppt.instructor.lastName}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="text-xs font-medium text-foreground">{ppt.topic.name}</div>
                          <div className="text-[11px] text-muted-foreground">{ppt.subtopic.name}</div>
                        </td>

                        <td className="px-4 py-4">
                          <select
                            value={ppt.status}
                            onChange={(e) =>
                              handleStatusChange(ppt.id, e.target.value as "published" | "draft" | "archived")
                            }
                            className={`h-7 px-2 text-xs font-semibold rounded-md border border-border bg-card ${
                              ppt.status === "published"
                                ? "text-primary"
                                : ppt.status === "draft"
                                ? "text-muted-foreground"
                                : "text-amber-500"
                            }`}
                          >
                            <option value="published">Published</option>
                            <option value="draft">Draft</option>
                            <option value="archived">Archived</option>
                          </select>
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
                              title="View Deck"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              onClick={() => setDeletingResource(ppt)}
                              title="Delete Deck"
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
        </TabsContent>

        {/* Tab 2: Topics & Subtopics Management */}
        <TabsContent value="categories" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold font-display text-foreground">Topic & Subtopic Structure</h3>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSubtopicParentId(topics[0]?.id || "");
                  setShowAddSubtopicModal(true);
                }}
                className="gap-2 text-xs"
                disabled={topics.length === 0}
              >
                <Plus className="w-4 h-4" />
                Add Subtopic
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEditingTopic(null);
                  setTopicName("");
                  setTopicDesc("");
                  setShowAddTopicModal(true);
                }}
                className="gap-2 text-xs"
              >
                <FolderPlus className="w-4 h-4" />
                Add Topic
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {topics.map((topic) => (
              <Card key={topic.id} className="border-border bg-card shadow-xs rounded-2xl overflow-hidden">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-border/40 pb-3">
                    <div>
                      <h4 className="font-bold text-base text-foreground flex items-center gap-2">
                        {topic.name}
                        {topic.resourceCount !== undefined && (
                          <Badge variant="secondary" className="text-[10px]">
                            {topic.resourceCount} PPTs
                          </Badge>
                        )}
                      </h4>
                      {topic.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{topic.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditingTopic(topic);
                          setTopicName(topic.name);
                          setTopicDesc(topic.description || "");
                          setShowAddTopicModal(true);
                        }}
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteTopic(topic)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Subtopics List */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                      Subtopics ({topic.subtopics.length})
                    </span>
                    {topic.subtopics.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-2">No subtopics defined yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {topic.subtopics.map((sub) => (
                          <div
                            key={sub.id}
                            className="flex items-center justify-between p-2 rounded-lg bg-muted/40 text-xs"
                          >
                            <span className="font-medium text-foreground">
                              {sub.name}
                              {sub.resourceCount !== undefined && sub.resourceCount > 0 && (
                                <span className="ml-2 text-[10px] text-muted-foreground">
                                  ({sub.resourceCount} PPTs)
                                </span>
                              )}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteSubtopic(sub.id, sub.name)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Add / Edit Topic Modal */}
      <Dialog open={showAddTopicModal} onOpenChange={setShowAddTopicModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTopic ? "Edit Topic" : "Create New Topic"}</DialogTitle>
            <DialogDescription>Top-level category for organizing presentations.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTopic} className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Topic Name *</Label>
              <Input
                value={topicName}
                onChange={(e) => setTopicName(e.target.value)}
                placeholder="e.g. Artificial Intelligence"
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Description</Label>
              <Input
                value={topicDesc}
                onChange={(e) => setTopicDesc(e.target.value)}
                placeholder="e.g. Machine learning, deep learning, NLP"
                className="mt-1"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowAddTopicModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!topicName.trim()}>
                {editingTopic ? "Update Topic" : "Create Topic"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Subtopic Modal */}
      <Dialog open={showAddSubtopicModal} onOpenChange={setShowAddSubtopicModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Subtopic</DialogTitle>
            <DialogDescription>Create a specialized subject area under a topic.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubtopic} className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Parent Topic *</Label>
              <select
                value={subtopicParentId}
                onChange={(e) => setSubtopicParentId(e.target.value)}
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
                value={subtopicName}
                onChange={(e) => setSubtopicName(e.target.value)}
                placeholder="e.g. Deep Learning"
                className="mt-1"
                required
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Description</Label>
              <Input
                value={subtopicDesc}
                onChange={(e) => setSubtopicDesc(e.target.value)}
                placeholder="Optional description"
                className="mt-1"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowAddSubtopicModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!subtopicName.trim() || !subtopicParentId}>
                Create Subtopic
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Deck Modal */}
      <Dialog open={Boolean(deletingResource)} onOpenChange={(open) => !open && setDeletingResource(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete Presentation?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete &ldquo;{deletingResource?.title}&rdquo;?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setDeletingResource(null)} disabled={deletingActionLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteResource} disabled={deletingActionLoading}>
              {deletingActionLoading ? "Deleting..." : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

