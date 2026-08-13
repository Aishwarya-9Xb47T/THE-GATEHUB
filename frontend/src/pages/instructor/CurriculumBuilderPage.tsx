import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, GripVertical, Video, FileText, ArrowLeft, LayoutList, Sparkles, Loader2, Trash2, X, Check, Edit2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileUpload } from "@/components/common/FileUpload";
import { VideoCaptionUploader } from "@/components/video/VideoCaptionUploader";
import { parseVideoCaptions, type VideoCaptionTrack } from "@/lib/videoCaptions";
import { invalidateCourseContentCaches } from "@/lib/courseContentCache";
import { useToastStore } from "@/store/toastStore";
import { cn } from "@/lib/utils";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Lecture { id: string; title: string; type: string; order: number; videoUrl?: string; videoType?: string; videoCaptions?: unknown; content?: string; }
interface Section { id: string; title: string; order: number; lectures: Lecture[]; }

interface InlineLectureFormProps {
  title: string;
  setTitle: (v: string) => void;
  type: string;
  setType: (v: string) => void;
  videoUrl: string;
  setVideoUrl: (v: string) => void;
  videoType: string;
  setVideoType: (v: string) => void;
  videoCaptions: VideoCaptionTrack[];
  setVideoCaptions: (v: VideoCaptionTrack[]) => void;
  fileUrl: string;
  setFileUrl: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSaving: boolean;
  isEdit?: boolean;
}

function InlineLectureForm({ 
  title, setTitle, type, setType, videoUrl, setVideoUrl, videoType, setVideoType, videoCaptions, setVideoCaptions, fileUrl, setFileUrl, 
  onSubmit, onCancel, isSaving, isEdit 
}: InlineLectureFormProps) {
  return (
    <Card className="border-primary/20 shadow-lg bg-primary/5 mb-4 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
      <CardContent className="p-5 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-primary/60 ml-1">Lecture Title</label>
            <Input 
              autoFocus
              placeholder="E.g. Introduction to the topic" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary/20 text-base font-medium"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={onCancel} className="mt-6 rounded-full h-8 w-8 p-0 hover:bg-primary/10">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Tabs value={type} onValueChange={setType} className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-10 p-1 bg-background/50 rounded-lg border border-primary/5">
            <TabsTrigger value="video" className="text-xs font-bold rounded-md data-[state=active]:bg-primary data-[state=active]:text-white">Video</TabsTrigger>
            <TabsTrigger value="file" className="text-xs font-bold rounded-md data-[state=active]:bg-primary data-[state=active]:text-white">File</TabsTrigger>
            <TabsTrigger value="quiz" className="text-xs font-bold rounded-md data-[state=active]:bg-primary data-[state=active]:text-white">Quiz</TabsTrigger>
            <TabsTrigger value="notes" className="text-xs font-bold rounded-md data-[state=active]:bg-primary data-[state=active]:text-white">Notes</TabsTrigger>
          </TabsList>
          
          <div className="mt-4 p-4 border border-primary/10 rounded-xl bg-background/40">
            <TabsContent value="video" className="mt-0 space-y-4">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Video Type</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={videoType === "youtube" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setVideoType("youtube")}
                  className="h-9 text-xs font-bold"
                >
                  YouTube Link
                </Button>
                <Button
                  type="button"
                  variant={videoType === "upload" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setVideoType("upload")}
                  className="h-9 text-xs font-bold"
                >
                  Upload Video
                </Button>
              </div>

              {videoType === "youtube" && (
                <div className="space-y-3">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">YouTube URL</p>
                  <Input 
                    placeholder="https://www.youtube.com/watch?v=..." 
                    value={videoUrl} 
                    onChange={(e) => setVideoUrl(e.target.value)} 
                    className="h-10 text-sm" 
                  />
                </div>
              )}

              {videoType === "upload" && (
                <div className="space-y-3">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Upload Video File</p>
                  <FileUpload 
                    value={videoUrl} 
                    onUploadSuccess={(url) => {
                      setVideoUrl(url);
                      setVideoType("upload");
                    }}
                    accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.webm,.mov,.avi,.mkv,.m4v" 
                    maxSize={5 * 1024 * 1024 * 1024} 
                  />
                  <VideoCaptionUploader captions={videoCaptions} onChange={setVideoCaptions} />
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="file" className="mt-0 space-y-4">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Downloadable Resource</p>
              <FileUpload value={fileUrl} onUploadSuccess={setFileUrl} maxSize={100 * 1024 * 1024} />
            </TabsContent>
            
            <TabsContent value="quiz" className="mt-0 space-y-2">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
                  Interactive quizzes are managed in a separate builder. Save this lecture first, then click "Edit Quiz" to add questions.
                </p>
              </div>
            </TabsContent>
            
            <TabsContent value="notes" className="mt-0 space-y-2">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
                <FileText className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700/80 dark:text-blue-400/80 leading-relaxed">
                  Advanced LaTeX notes use our specialized editor. Save this lecture first, then click "Edit Notes" to start writing formulas.
                </p>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" size="sm" onClick={onCancel} className="font-semibold">Cancel</Button>
          <Button size="sm" onClick={onSubmit} disabled={!title.trim() || isSaving} className="font-semibold px-6 shadow-md shadow-primary/10">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : isEdit ? <Check className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            {isSaving ? "Saving..." : isEdit ? "Update Lecture" : "Add Lecture"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SortableLectureItem({ 
  lecture, 
  onEdit, 
  onDelete,
  isEditingInline,
  inlineFormProps
}: { 
  lecture: Lecture, 
  onEdit: (id: string, type: string) => void,
  onDelete: (id: string) => void,
  isEditingInline: boolean,
  inlineFormProps?: any
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ 
    id: lecture.id, 
    data: { type: "Lecture", lecture } 
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  if (isEditingInline && inlineFormProps) {
    return (
      <li ref={setNodeRef} style={style}>
        <InlineLectureForm {...inlineFormProps} isEdit />
      </li>
    );
  }
  
  return (
    <li ref={setNodeRef} style={style} className="flex items-center justify-between gap-4 text-sm text-foreground bg-background p-4 rounded-xl border border-border/40 shadow-sm group hover:border-primary/20 hover:shadow-md transition-all">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div {...attributes} {...listeners} className="cursor-grab hover:bg-secondary p-2 rounded text-muted-foreground transition-colors opacity-30 group-hover:opacity-100">
          <GripVertical className="h-4 w-4" />
        </div>
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
          lecture.type === "video" ? "bg-primary/10 text-primary" : 
          lecture.type === "quiz" ? "bg-amber-500/10 text-amber-600" :
          lecture.type === "notes" ? "bg-blue-500/10 text-blue-600" : "bg-orange-500/10 text-orange-600"
        )}>
          {lecture.type === "video" ? <Video className="h-5 w-5" /> : 
           lecture.type === "quiz" ? <LayoutList className="h-5 w-5" /> :
           lecture.type === "notes" ? <FileText className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <span className="font-bold text-base truncate block">{lecture.title}</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{lecture.type}</span>
        </div>
      </div>
      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="sm" className="h-9 px-3 rounded-lg font-semibold text-muted-foreground hover:text-primary hover:bg-primary/5" onClick={() => onEdit(lecture.id, lecture.type)}>
          <Edit2 className="h-3.5 w-3.5 mr-2" />
          {lecture.type === "quiz" || lecture.type === "notes" ? "Builder" : "Edit"}
        </Button>
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5" onClick={() => onDelete(lecture.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

function SortableSectionItem({ 
  section, 
  onAddLecture, 
  onEditLecture, 
  onDeleteLecture,
  isAddingLecture,
  editLectureId,
  inlineFormProps
}: { 
  section: Section, 
  onAddLecture: (id: string) => void, 
  onEditLecture: (id: string, type: string) => void,
  onDeleteLecture: (id: string) => void,
  isAddingLecture: boolean,
  editLectureId: string | null,
  inlineFormProps: any
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ 
    id: section.id, 
    data: { type: "Section", section } 
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="rounded-2xl border border-border/40 bg-card text-card-foreground shadow-sm mb-8 overflow-hidden">
      <div className="flex items-center bg-muted/30 p-5 border-b border-border/40">
        <div {...attributes} {...listeners} className="cursor-grab hover:bg-secondary p-2 rounded mr-4 text-muted-foreground opacity-50">
          <GripVertical className="h-5 w-5" />
        </div>
        <h3 className="font-bold text-xl tracking-tight">{section.title}</h3>
      </div>
      <div className="p-6 space-y-4">
        {section.lectures.length > 0 || isAddingLecture ? (
          <ul className="space-y-4">
            <SortableContext items={section.lectures.map((l) => l.id)} strategy={verticalListSortingStrategy}>
              {section.lectures.map((lec) => (
                <SortableLectureItem 
                  key={lec.id} 
                  lecture={lec} 
                  onEdit={onEditLecture} 
                  onDelete={onDeleteLecture}
                  isEditingInline={editLectureId === lec.id}
                  inlineFormProps={editLectureId === lec.id ? inlineFormProps : undefined}
                />
              ))}
            </SortableContext>
            {isAddingLecture && (
              <li>
                <InlineLectureForm {...inlineFormProps} />
              </li>
            )}
          </ul>
        ) : (
          <div className="text-center py-12 border-2 border-dashed rounded-2xl text-muted-foreground bg-muted/10 border-border/40">
            <LayoutList className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">This section is empty.</p>
          </div>
        )}
        
        {!isAddingLecture && (
          <Button variant="outline" className="w-full mt-2 h-12 border-dashed border-primary/20 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all font-semibold rounded-xl" onClick={() => onAddLecture(section.id)}>
            <Plus className="h-5 w-5 mr-2" /> Add Lecture
          </Button>
        )}
      </div>
    </div>
  );
}

export function CurriculumBuilderPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.add);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [addingSection, setAddingSection] = useState(false);
  const [sectionsState, setSectionsState] = useState<Section[]>([]);

  const [activeDialogSection, setActiveDialogSection] = useState<string | null>(null);
  const [editLectureId, setEditLectureId] = useState<string | null>(null);
  const [lectureTitle, setLectureTitle] = useState("");
  const [lectureType, setLectureType] = useState<Lecture["type"]>("video");
  const [lectureVideoUrl, setLectureVideoUrl] = useState("");
  const [lectureVideoType, setLectureVideoType] = useState("youtube");
  const [lectureVideoCaptions, setLectureVideoCaptions] = useState<VideoCaptionTrack[]>([]);
  const [lectureFileUrl, setLectureFileUrl] = useState("");

  const { data: course } = useQuery({
    queryKey: ["courses", courseId],
    queryFn: async () => {
      const res = await api<{ course: { id: string; title: string } }>(`/courses/${courseId}`);
      if (res.error) throw new Error(res.error);
      return res.data!.course;
    },
    enabled: !!courseId,
  });

  const { data: sections, isLoading } = useQuery({
    queryKey: ["sections", courseId],
    queryFn: async () => {
      const res = await api<{ sections: Section[] }>(`/courses/${courseId}/sections`);
      if (res.error) throw new Error(res.error);
      return res.data!.sections;
    },
    enabled: !!courseId,
  });

  useEffect(() => {
    if (sections) setSectionsState(sections);
  }, [sections]);

  const addSection = useMutation({
    mutationFn: async (title: string) => {
      const res = await api<{ section: Section }>(`/courses/${courseId}/sections`, { method: "POST", body: { title } });
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
    onSuccess: () => {
      invalidateCourseContentCaches(queryClient, courseId);
      setNewSectionTitle("");
      setAddingSection(false);
      toast({ title: "Section added", variant: "success" });
    },
  });

  const addLecture = useMutation({
    mutationFn: async ({ sectionId, title, type, videoUrl, videoType, videoCaptions, content }: { sectionId: string; title: string; type: string; videoUrl?: string, videoType?: string, videoCaptions?: VideoCaptionTrack[], content?: string }) => {
      const res = await api<{ lecture: Lecture }>(`/sections/${sectionId}/lectures`, { 
        method: "POST", 
        body: { title, type, videoUrl, videoType, videoCaptions, content } 
      });
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
    onSuccess: () => {
      invalidateCourseContentCaches(queryClient, courseId);
      toast({ title: "Lecture added", variant: "success" });
      handleCancelInline();
    },
  });

  const editLectureMut = useMutation({
    mutationFn: async ({ id, title, type, videoUrl, videoType, videoCaptions, content }: { id: string; title: string; type: string; videoUrl?: string, videoType?: string, videoCaptions?: VideoCaptionTrack[], content?: string }) => {
      const res = await api<{ lecture: Lecture }>(`/lectures/${id}`, { 
        method: "PATCH", 
        body: { title, type, videoUrl, videoType, videoCaptions, content } 
      });
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
    onSuccess: () => {
      invalidateCourseContentCaches(queryClient, courseId);
      toast({ title: "Lecture updated", variant: "success" });
      handleCancelInline();
    },
  });

  const deleteLectureMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await api<{ success: boolean }>(`/lectures/${id}`, { method: "DELETE" });
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
    onSuccess: () => {
      invalidateCourseContentCaches(queryClient, courseId);
      toast({ title: "Lecture deleted", variant: "success" });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  });

  const reorderSectionsMut = useMutation({
    mutationFn: async (sectionIds: string[]) => {
      await api(`/courses/${courseId}/sections/reorder`, { method: "POST", body: { sectionIds } });
    },
    onSuccess: () => invalidateCourseContentCaches(queryClient, courseId),
  });

  const reorderLecturesMut = useMutation({
    mutationFn: async ({ sectionId, lectureIds }: { sectionId: string; lectureIds: string[] }) => {
      await api(`/sections/${sectionId}/lectures/reorder`, { method: "PATCH", body: { lectureIds } });
    },
    onSuccess: () => invalidateCourseContentCaches(queryClient, courseId),
  });

  const generateAILanding = useMutation({
    mutationFn: async () => {
      const res = await api<any>(`/courses/${courseId}/generate-landing`, { method: "POST" });
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: "Landing page generated!", description: "AI has created a professional description for your course.", variant: "success" });
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    }
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id === over.id) return;

    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;

    if (activeType === "Section" && overType === "Section") {
      setSectionsState(prev => {
        const oldIndex = prev.findIndex(s => s.id === active.id);
        const newIndex = prev.findIndex(s => s.id === over.id);
        const newArray = arrayMove(prev, oldIndex, newIndex);
        reorderSectionsMut.mutate(newArray.map(s => s.id));
        return newArray;
      });
    } else if (activeType === "Lecture" && overType === "Lecture") {
      const sourceSection = sectionsState.find(s => s.lectures.some(l => l.id === active.id));
      const destSection = sectionsState.find(s => s.lectures.some(l => l.id === over.id));
      
      if (sourceSection && destSection && sourceSection.id === destSection.id) {
        setSectionsState(prev => prev.map(s => {
          if (s.id === sourceSection.id) {
            const oldIndex = s.lectures.findIndex(l => l.id === active.id);
            const newIndex = s.lectures.findIndex(l => l.id === over.id);
            const newLectures = arrayMove(s.lectures, oldIndex, newIndex);
            reorderLecturesMut.mutate({ sectionId: s.id, lectureIds: newLectures.map(l => l.id) });
            return { ...s, lectures: newLectures };
          }
          return s;
        }));
      }
    }
  };

  const handleAddLecture = (sectionId: string) => {
    setActiveDialogSection(sectionId);
    setEditLectureId(null);
    setLectureTitle("");
    setLectureType("video");
    setLectureVideoUrl("");
    setLectureVideoCaptions([]);
    setLectureFileUrl("");
  };

  const handleEditLecture = (id: string, type: string) => {
    if (type === "quiz") navigate(`/instructor/course/${courseId}/lectures/${id}/quiz`);
    else if (type === "notes") navigate(`/instructor/course/${courseId}/lectures/${id}/notes`);
    else {
      const foundLecture = sectionsState.flatMap(s => s.lectures).find(l => l.id === id);
      if (foundLecture) {
        setLectureTitle(foundLecture.title);
        setLectureType(foundLecture.type as Lecture["type"]);
        setLectureVideoUrl(foundLecture.videoUrl || "");
        setLectureVideoType(foundLecture.videoType || (foundLecture.videoUrl?.includes("youtu") ? "youtube" : "upload"));
        setLectureVideoCaptions(parseVideoCaptions(foundLecture.videoCaptions));
        setLectureFileUrl(foundLecture.content || "");
        setEditLectureId(foundLecture.id);
        setActiveDialogSection(null);
      }
    }
  };

  const handleDeleteLecture = (id: string) => {
    if (confirm("Are you sure you want to delete this lecture?")) {
      deleteLectureMut.mutate(id);
    }
  };

  const handleCancelInline = () => {
    setActiveDialogSection(null);
    setEditLectureId(null);
    setLectureTitle("");
    setLectureVideoUrl("");
    setLectureVideoCaptions([]);
    setLectureFileUrl("");
  };

  const handleLectureSubmit = () => {
    if (!lectureTitle.trim()) return;
    if (editLectureId) {
      editLectureMut.mutate({
        id: editLectureId,
        title: lectureTitle.trim(),
        type: lectureType,
        videoUrl: lectureType === "video" ? lectureVideoUrl : undefined,
        videoType: lectureType === "video" ? lectureVideoType : undefined,
        videoCaptions: lectureType === "video" && lectureVideoType === "upload" ? lectureVideoCaptions : undefined,
        content: (lectureType === "file" || lectureType === "notes") ? lectureFileUrl : undefined,
      });
    } else if (activeDialogSection) {
      addLecture.mutate({
        sectionId: activeDialogSection,
        title: lectureTitle.trim(),
        type: lectureType,
        videoUrl: lectureType === "video" ? lectureVideoUrl : undefined,
        videoType: lectureType === "video" ? lectureVideoType : undefined,
        videoCaptions: lectureType === "video" && lectureVideoType === "upload" ? lectureVideoCaptions : undefined,
        content: (lectureType === "file" || lectureType === "notes") ? lectureFileUrl : undefined,
      });
    }
  };

  if (!courseId || !course) return <div className="p-8 animate-pulse text-muted-foreground flex items-center gap-3"><GripVertical className="animate-spin" /> Loading curriculum...</div>;

  const inlineFormProps = {
    title: lectureTitle,
    setTitle: setLectureTitle,
    type: lectureType,
    setType: setLectureType,
    videoUrl: lectureVideoUrl,
    setVideoUrl: setLectureVideoUrl,
    videoType: lectureVideoType,
    setVideoType: setLectureVideoType,
    videoCaptions: lectureVideoCaptions,
    setVideoCaptions: setLectureVideoCaptions,
    fileUrl: lectureFileUrl,
    setFileUrl: setLectureFileUrl,
    onSubmit: handleLectureSubmit,
    onCancel: handleCancelInline,
    isSaving: addLecture.isPending || editLectureMut.isPending,
  };

  return (
    <div className="w-full min-w-0 space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <Button variant="ghost" size="sm" className="mb-2 -ml-3 text-muted-foreground" onClick={() => navigate("/instructor/courses")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to courses
          </Button>
          <h1 className="page-title tracking-tight text-foreground">Curriculum Builder</h1>
          <p className="mt-2 text-lg text-muted-foreground">Manage sections and lectures for <span className="font-semibold text-foreground">{course.title}</span></p>
        </div>
        <div className="flex gap-3 items-end">
          <Button 
            variant="outline" 
            className="h-12 px-6 border-primary/20 text-primary hover:bg-primary/5 font-bold flex gap-2"
            onClick={() => generateAILanding.mutate()}
            disabled={generateAILanding.isPending || isLoading}
          >
            {generateAILanding.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Generate AI Description
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-48 bg-muted/50 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <SortableContext items={sectionsState.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-6">
              {sectionsState.map((section) => (
                <SortableSectionItem 
                  key={section.id} 
                  section={section} 
                  onAddLecture={handleAddLecture} 
                  onEditLecture={handleEditLecture} 
                  onDeleteLecture={handleDeleteLecture}
                  isAddingLecture={activeDialogSection === section.id && !editLectureId}
                  editLectureId={editLectureId}
                  inlineFormProps={inlineFormProps}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </DndContext>

      <Card className="border-dashed bg-primary/5 border-primary/20">
        <CardContent className="pt-6">
          {addingSection ? (
            <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2">
              <Input 
                autoFocus
                placeholder="E.g. Introduction to Course" 
                value={newSectionTitle} 
                onChange={(e) => setNewSectionTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newSectionTitle.trim()) addSection.mutate(newSectionTitle.trim()); }}
                className="h-12 text-lg font-bold rounded-xl"
              />
              <Button size="lg" className="rounded-xl px-8" onClick={() => addSection.mutate(newSectionTitle.trim())} disabled={!newSectionTitle.trim() || addSection.isPending}>
                Create Section
              </Button>
              <Button variant="ghost" size="lg" className="rounded-xl" onClick={() => { setAddingSection(false); setNewSectionTitle(""); }}>Cancel</Button>
            </div>
          ) : (
            <Button variant="ghost" size="lg" className="w-full h-16 text-lg font-semibold border-2 border-dashed border-primary/20 hover:bg-primary/5 text-primary/70 hover:text-primary rounded-2xl transition-all" onClick={() => setAddingSection(true)}>
              <Plus className="h-6 w-6 mr-2" /> Add New Section
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
