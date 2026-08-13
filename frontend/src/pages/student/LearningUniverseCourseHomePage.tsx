
import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Clock,
  Trophy,
  User,
  Play,
  ChevronRight,
  Loader2,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getLearningUniverseById, api } from "@/lib/api";
import { useUserStore } from "@/store/userStore";
import { useToastStore } from "@/store/toastStore";
import { Edit2, Trash2, Copy, Eye, Power } from "lucide-react";
import { useRazorpayCheckout } from "@/hooks/useRazorpayCheckout";
import { formatINR, studentCourseCta } from "@/lib/paymentUtils";
import { buildInstructorLuPreviewPath, instructorPreviewState } from "@/lib/instructorPreview";
import { WishlistSaveButton } from "@/components/common/WishlistSaveButton";
import { resolveCourseBannerUrl } from "@/lib/courseBanner";
import { MarkdownContent } from "@/components/learning/MarkdownContent";
import { StudentLearningAnalyticsPanel } from "@/components/learning/StudentLearningAnalyticsPanel";

// Interfaces (mirror backend)
interface Video {
  id: string;
  type: string;
  url: string;
  title: string;
}
interface Practice {
  id: string;
  title: string;
  language: string;
  initialCode: string;
  expectedOutput: string;
}
interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
}
interface QuizQuestion {
  id: string;
  text: string;
  type: string;
  explanation: string;
  options: QuizOption[];
}
interface Quiz {
  id: string;
  questions: QuizQuestion[];
}
interface Project {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  instructions: string;
  expectedOutput: string;
  colabUrl: string;
  githubUrl: string;
}
interface Resource {
  id: string;
  type: string;
  title: string;
  url: string;
  fileUrl: string;
}
interface Lesson {
  id: string;
  title: string;
  overviewMarkdown: string;
  overviewHtml: string;
  videos: Video[];
  practice: Practice | null;
  quiz: Quiz | null;
  project: Project | null;
  resources: Resource[];
}
interface Module {
  id: string;
  title: string;
  description: string;
  prerequisites: string;
  learningOutcomes: string;
  estimatedHours: number;
  lessons: Lesson[];
}
interface Track {
  id: string;
  title: string;
  description: string;
  learningOutcomes: string;
  careerOutcomes: string;
  difficulty: string;
  modules: Module[];
}
interface LearningUniverseData {
  id: string;
  title: string;
  description: string;
  thumbnail?: string;
  difficulty?: string;
  price?: number;
  status?: string;
  instructor?: any;
  tracks: Track[];
}

export function LearningUniverseCourseHomePage() {
  console.log("HOME PAGE RENDERED");
  console.log("window.location.pathname:", window.location.pathname);
  console.log("window.location.search:", window.location.search);

  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token } = useUserStore();
  const toast = useToastStore((s) => s.add);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [universe, setUniverse] = useState<LearningUniverseData | null>(null);
  const [isManaging, setIsManaging] = useState(false);

  const { data: enrollmentStatus, refetch: refetchEnrollment } = useQuery({
    queryKey: ["lu-enrollment-check", id],
    queryFn: async () => {
      const res = await api<{ enrolled: boolean; paid: boolean }>(
        `/learning-universes/${id}/enrollment-check`
      );
      if (res.error) return { enrolled: false, paid: false };
      return res.data!;
    },
    enabled: !!id && !!token,
  });

  const { checkout, isProcessing } = useRazorpayCheckout({
    user,
    onSuccess: () => {
      toast({ title: "Purchase successful!", variant: "success" });
      refetchEnrollment();
    },
    onError: (msg) => toast({ title: "Payment error", description: msg, variant: "destructive" }),
  });

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getLearningUniverseById<{ data: LearningUniverseData }>(id);
        console.log("COURSE_PAGE_DATA", res.data);
        const actualUniverse = res.data?.data;
        console.log("ACTUAL_UNIVERSE", actualUniverse);
        console.log("TRACKS", actualUniverse?.tracks);
        console.log("TRACK_COUNT", actualUniverse?.tracks?.length);
        if (res.error) {
          const msg = res.error;
          if (/not found/i.test(msg)) {
            throw new Error("Learning Universe not found");
          }
          if (/unauthorized|authentication|401/i.test(msg)) {
            throw new Error("Please sign in to view this course.");
          }
          if (/forbidden|access|403/i.test(msg)) {
            throw new Error("You don't have access to this course.");
          }
          throw new Error(msg);
        }
        if (!actualUniverse) throw new Error("Unable to load course. Please retry.");
        setUniverse(actualUniverse);
        // Canonicalize URL when a Course/listing id resolved to a LearningUniverse id
        if (actualUniverse.id && actualUniverse.id !== id) {
          navigate(`/learning-universe/${actualUniverse.id}/course`, { replace: true });
        }
      } catch (err: any) {
        setError((err as Error).message);
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, navigate]);

  // Calculate totals
  let totalLessons = 0;
  let totalHours = 0;
  let totalProjects = 0;
  const allLessons: Lesson[] = [];

  if (universe) {
    (universe.tracks || []).forEach((track) => {
      (track.modules || []).forEach((mod) => {
        totalLessons += (mod.lessons || []).length;
        totalHours += mod.estimatedHours || 0;
        (mod.lessons || []).forEach((l) => {
          allLessons.push(l);
          if (l.project) totalProjects++;
        });
      });
    });

    console.log("HOME PAGE DATA");
    console.log("Lesson Count:", totalLessons);
    console.log("Module Count:", universe.tracks?.reduce((sum, t) => sum + t.modules?.length, 0) || 0);
    console.log("Track Count:", universe.tracks?.length || 0);
    console.log("Current Lesson:", allLessons[0]?.id || "none");
  }

  const handleDuplicate = async () => {
    if (!id) return;
    setIsManaging(true);
    try {
      const res = await api<{ data: { id: string } }>(`/learning-universes/${id}/duplicate`, { method: "POST" });
      if (res.error) throw new Error(res.error);
      const newId = res.data?.data?.id;
      toast({ title: "Duplicated", description: "A copy was created with a new project.", variant: "success" });
      if (newId) navigate(`/learning-universe/${newId}/course`);
    } catch (err: any) {
      toast({ title: "Duplicate failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsManaging(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!id || !universe) return;
    setIsManaging(true);
    try {
      const res = await api<{ data: { status: string } }>(`/learning-universes/${id}/toggle-publish`, { method: "POST" });
      if (res.error) throw new Error(res.error);
      const next = res.data?.data?.status ?? (universe.status === "published" ? "draft" : "published");
      setUniverse({ ...universe, status: next });
      toast({ title: next === "published" ? "Published" : "Unpublished", variant: "success" });
    } catch (err: any) {
      toast({ title: "Update failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsManaging(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    if (
      !window.confirm(
        "Archive this Learning Universe? If students are enrolled or certificates were issued, it will be archived (not permanently deleted) so history is preserved."
      )
    ) {
      return;
    }
    setIsManaging(true);
    try {
      const res = await api<{ action?: string; message?: string }>(`/learning-universes/${id}`, {
        method: "DELETE",
      });
      if (res.error) throw new Error(res.error);
      toast({
        title: res.data?.action === "archived" ? "Archived" : "Deleted",
        description: res.data?.message,
        variant: "success",
      });
      navigate("/instructor");
    } catch (err: any) {
      toast({ title: "Archive failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsManaging(false);
    }
  };

  const handleInstructorPreview = () => {
    if (!id) return;
    navigate(buildInstructorLuPreviewPath(id), { state: instructorPreviewState(location) });
  };

  const handleStartLearning = async () => {
    if (!id || !universe) return;

    if (!user) {
      navigate("/login");
      return;
    }

    if (allLessons.length === 0) {
      toast({
        title: "No lessons yet",
        description: "Add lessons in Academic Studio, then publish to LU.",
        variant: "destructive",
      });
      return;
    }

    const price = universe.price ?? 0;
    const isEnrolled = enrollmentStatus?.enrolled;
    const isPaid = price === 0 || enrollmentStatus?.paid;

    if (price > 0 && !isPaid) {
      navigate(`/checkout?learningUniverseId=${universe.id}`);
      return;
    }

    if (!isEnrolled) {
      const res = await api(`/learning-universes/${universe.id}/enroll`, { method: "POST" });
      if (res.error) {
        toast({ title: "Enrollment failed", description: res.error, variant: "destructive" });
        return;
      }
      refetchEnrollment();
    }

    navigate(`/student/learning-universe/${universe.id}/learn`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !universe) {
    const isNotFound = /not found/i.test(error || "");
    const isAccess = /access|sign in|forbidden/i.test(error || "");
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-red-500 text-xl font-medium">
          {isNotFound
            ? "Course not found"
            : isAccess
              ? "Access required"
              : "Unable to load course"}
        </div>
        <p className="text-muted-foreground max-w-md text-sm">
          {error || "This course could not be loaded. It may be unpublished, removed, or the link may be outdated."}
        </p>
        <Button variant="secondary" onClick={() => navigate("/student/browse")}>
          Browse courses
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Hero Banner */}
      <section className="border-b border-border py-12">
        <div className="app-workspace w-full max-w-none px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-full bg-secondary text-sm">
                  {universe.difficulty || "Beginner"}
                </span>
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">
                {universe.title}
              </h1>
              <div className="text-xl text-muted-foreground leading-relaxed">
                <MarkdownContent className="prose-lg">{universe.description}</MarkdownContent>
              </div>

              <div className="flex flex-wrap gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-primary" />
                  <span>{totalLessons} Lessons</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  <span>{totalHours} Hours</span>
                </div>
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-primary" />
                  <span>{totalProjects} Projects</span>
                </div>
              </div>

              {universe.instructor && (
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <div className="font-semibold">
                      {universe.instructor.firstName} {universe.instructor.lastName}
                    </div>
                    <div className="text-sm text-muted-foreground">Instructor</div>
                  </div>
                </div>
              )}

              {user && universe.instructor?.id === user.id ? (
                <div className="flex flex-wrap gap-3">
                  <Button
                    size="lg"
                    onClick={() => navigate(
                      (universe as any).authoringMode === "visual"
                        ? `/instructor/learning-universe/new/visual?edit=${universe.id}`
                        : `/instructor/learning-universe/new/academic?edit=${universe.id}`
                    )}
                    className="bg-primary hover:opacity-90"
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <Button size="lg" variant="outline" onClick={handleInstructorPreview}>
                    <Eye className="w-4 h-4 mr-2" />
                    Preview
                  </Button>
                  <Button size="lg" variant="secondary" onClick={handleDuplicate} disabled={isManaging}>
                    <Copy className="w-4 h-4 mr-2" />
                    Duplicate
                  </Button>
                  <Button size="lg" variant="outline" className="text-amber-500 border-amber-500 hover:bg-amber-500/10" onClick={handleTogglePublish} disabled={isManaging}>
                    <Power className="w-4 h-4 mr-2" />
                    {universe.status === "published" ? "Unpublish" : "Publish"}
                  </Button>
                  <Button size="lg" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={handleDelete} disabled={isManaging}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Archive
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {(universe.price ?? 0) > 0 && (
                    <p className="text-3xl font-bold text-primary">{formatINR(universe.price!)}</p>
                  )}
                  <Button
                    size="lg"
                    onClick={handleStartLearning}
                    disabled={isProcessing}
                    className="w-full md:w-auto bg-primary hover:opacity-90"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    ) : (
                      <Play className="w-5 h-5 mr-2" />
                    )}
                    {enrollmentStatus?.enrolled
                      ? "Continue Learning"
                      : studentCourseCta(universe.price ?? 0, false)}
                  </Button>
                  {id && !enrollmentStatus?.enrolled && (
                    <WishlistSaveButton learningUniverseId={id} />
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-center">
              <div className="w-full aspect-video rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
                {universe.thumbnail ? (
                  <img
                    src={resolveCourseBannerUrl(universe.thumbnail) || universe.thumbnail}
                    alt={universe.title}
                    className="w-full h-full object-cover rounded-2xl"
                  />
                ) : (
                  <BookOpen className="w-24 h-24 text-primary/50" />
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {id && enrollmentStatus?.enrolled && token && (
        <section className="py-8 border-b border-border">
          <div className="app-workspace w-full max-w-none px-4">
            <StudentLearningAnalyticsPanel universeId={id} />
          </div>
        </section>
      )}

      {/* Curriculum Section */}
      <section className="py-12">
        <div className="app-workspace w-full max-w-none px-4">
          <h2 className="text-3xl font-bold mb-8">Curriculum</h2>
          <div className="space-y-6">
            {(universe.tracks || []).map((track) => (
              <div key={track.id} className="space-y-4">
                <h3 className="text-2xl font-semibold">{track.title}</h3>
                <div className="grid gap-4">
                  {(track.modules || []).map((mod) => (
                    <Card key={mod.id} className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold">{mod.title}</h4>
                          <p className="text-muted-foreground text-sm">
                            {(mod.lessons || []).length} lessons • {mod.estimatedHours || 0}h
                          </p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
