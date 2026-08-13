import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen, Award, Loader2, Calendar, Download, Eye, CheckCircle2, Clock, Layers } from "lucide-react";
import { motion } from "framer-motion";
import { api, apiUrl } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { CourseCard } from "@/components/common/CourseCard";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toastStore";
import { cn } from "@/lib/utils";

interface Enrollment {
  id: string;
  isCompleted: boolean;
  completedAt?: string | null;
  enrolledAt: string;
  lastAccessed?: string | null;
  continueUrl?: string;
  canDownload?: boolean;
  hasCertificate?: boolean;
  downloadTarget?: "course" | "learning-universe";
  downloadId?: string;
  course: {
    id: string;
    title: string;
    subtitle?: string | null;
    thumbnail?: string | null;
    bannerUrl?: string | null;
    difficulty?: string | null;
    price?: number;
    category?: { name: string } | null;
    categoryRel?: { name: string } | null;
    instructor?: { firstName: string; lastName: string } | null;
    averageRating?: number;
    reviewCount?: number;
    moduleCount?: number;
    lessonCount?: number;
    completedLessons?: number;
    estimatedHours?: number | null;
    productType?: string;
    learningUniverseId?: string | null;
    _count?: { sections: number; enrollments: number };
  };
  progress: {
    percent: number;
    lastAccessed?: string | null;
    completedLessons?: number;
    totalLessons?: number;
  } | null;
}

interface LuEnrollment {
  id: string;
  isCompleted: boolean;
  completedAt?: string | null;
  continueUrl?: string;
  canDownload?: boolean;
  learningUniverse: {
    id: string;
    title: string;
    subtitle?: string | null;
    description?: string | null;
    thumbnail?: string | null;
    bannerUrl?: string | null;
    difficulty?: string | null;
    price?: number;
    category?: { name: string } | null;
    instructor?: { firstName: string; lastName: string } | null;
    moduleCount?: number;
    lessonCount?: number;
    completedLessons?: number;
    estimatedHours?: number;
    productType?: string;
  };
  progress: {
    percentComplete: number;
    lastAccessed?: string | null;
    completedLessons?: number;
    totalLessons?: number;
  } | null;
}

function formatHours(hours?: number | null): string | null {
  if (hours == null || hours <= 0) return null;
  return Number.isInteger(hours) ? `${hours}h` : `${hours}h`;
}

function structureLine(opts: {
  moduleCount?: number;
  lessonCount?: number;
  estimatedHours?: number | null;
  completedLessons?: number;
  showCompletedFraction?: boolean;
}): string {
  const parts: string[] = [];
  if (opts.moduleCount != null) parts.push(`${opts.moduleCount} Module${opts.moduleCount === 1 ? "" : "s"}`);
  if (opts.lessonCount != null) parts.push(`${opts.lessonCount} Lesson${opts.lessonCount === 1 ? "" : "s"}`);
  const hrs = formatHours(opts.estimatedHours);
  if (hrs) parts.push(hrs);
  if (
    opts.showCompletedFraction &&
    opts.completedLessons != null &&
    opts.lessonCount != null &&
    opts.lessonCount > 0
  ) {
    parts.push(`${opts.completedLessons}/${opts.lessonCount} done`);
  }
  return parts.join(" · ");
}

function productBadge(price?: number, productType?: string) {
  if (price != null && price > 0) return "Premium";
  if (productType === "premium-course") return "Premium";
  if (productType === "free-course" || productType === "free-learning-resource") return "Free";
  return "Learning Universe";
}

export function MyCourses() {
  const toast = useToastStore((s) => s.add);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadingCourseId, setDownloadingCourseId] = useState<string | null>(null);

  const { data, isLoading, isError: coursesError, refetch: refetchCourses } = useQuery({
    queryKey: ["enrollments", "my"],
    queryFn: async () => {
      const res = await api<{ enrollments: Enrollment[] }>("/enrollments/my");
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
  });

  const {
    data: luData,
    isLoading: luLoading,
    isError: luError,
    refetch: refetchLu,
  } = useQuery({
    queryKey: ["lu-enrollments", "my"],
    queryFn: async () => {
      const res = await api<{ enrollments: LuEnrollment[] }>("/learning-universes/my-enrollments");
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
  });

  const enrollments = data?.enrollments ?? [];
  // Prefer Course cards when the same Learning Universe is also listed via Course enrollment.
  const luEnrollments = (luData?.enrollments ?? []).filter((e) => {
    if (enrollments.some((ce) => ce.course.learningUniverseId === e.learningUniverse.id)) return false;
    if (enrollments.some((ce) => ce.downloadId === e.learningUniverse.id)) return false;
    return true;
  });
  const totalEnrollments = enrollments.length + luEnrollments.length;
  const completedCount =
    enrollments.filter((e) => e.isCompleted || (e.progress?.percent ?? 0) === 100).length +
    luEnrollments.filter((e) => e.isCompleted || (e.progress?.percentComplete ?? 0) === 100).length;
  const inProgressCount = totalEnrollments - completedCount;

  const { data: certificatesData } = useQuery({
    queryKey: ["my-certificates"],
    queryFn: async () => {
      const res = await api<{ certificates: any[] }>("/certificates/my");
      if (res.error) return { certificates: [] };
      return res.data!;
    },
  });

  const certificates = certificatesData?.certificates ?? [];
  const getCertificateForCourse = (courseId: string, learningUniverseId?: string | null) => {
    if (learningUniverseId) {
      const luCert = certificates.find(
        (c) => c.type === "learning_universe" && c.contentId === learningUniverseId
      );
      if (luCert) return { ...luCert, downloadKind: "lu" as const };
    }
    const courseCert = certificates.find(
      (c) => c.type === "course" && (c.contentId === courseId || c.id === courseId)
    );
    return courseCert ? { ...courseCert, downloadKind: "course" as const } : undefined;
  };
  const getCertificateForLu = (luId: string) =>
    certificates.find((c) => c.type === "learning_universe" && c.contentId === luId);

  const downloadLuCertificate = async (
    cert: { id: string; certificateId: string; downloadUrl?: string },
    title: string
  ) => {
    setDownloadingId(cert.certificateId);
    try {
      const token = localStorage.getItem("lms_token");
      if (!token) throw new Error("Authentication required");
      const raw = cert.downloadUrl || `/api/certificates/lu/${cert.id}/download`;
      const url = raw.startsWith("http") ? raw : apiUrl(raw);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      const blob = await response.blob();
      if (blob.size === 0) throw new Error("Downloaded file is empty");
      const urlBlob = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlBlob;
      a.download = `THE_GATE_HUB_Certificate_${title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(urlBlob);
      }, 100);
      toast({ title: "Certificate downloaded successfully!", variant: "success" });
    } catch (err: unknown) {
      toast({
        title: "Download failed",
        description: err instanceof Error ? err.message : "Please try again later",
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const triggerZipDownload = async (url: string, key: string, label: string) => {
    setDownloadingCourseId(key);
    try {
      const token = localStorage.getItem("lms_token");
      if (!token) throw new Error("Authentication required");
      toast({
        title: "Preparing download…",
        description: `Packaging ${label}. This may take a moment for large courses.`,
        variant: "default",
      });
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 403) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error || body?.message || "Complete the course to unlock the downloadable course package."
        );
      }
      if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
      }
      const blob = await response.blob();
      if (blob.size === 0) throw new Error("Downloaded package is empty");
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = /filename="?([^"]+)"?/i.exec(disposition);
      const filename = match?.[1] || `${label.replace(/[^a-zA-Z0-9]+/g, "_")}.zip`;
      const urlBlob = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlBlob;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(urlBlob);
      }, 100);
      toast({
        title: "Download ready",
        description: `${filename} is downloading.`,
        variant: "success",
      });
    } catch (err: unknown) {
      toast({
        title: "Download failed",
        description: err instanceof Error ? err.message : "Please try again later",
        variant: "destructive",
      });
    } finally {
      setDownloadingCourseId(null);
    }
  };

  const handleDownloadCourse = (
    enrollment: Enrollment,
    title: string
  ) => {
    const canDownload = Boolean(enrollment.canDownload);
    if (!canDownload) {
      toast({
        title: "Download locked",
        description: "Complete the course to unlock the downloadable course package.",
        variant: "destructive",
      });
      return;
    }
    const downloadId = enrollment.downloadId || enrollment.course.id;
    const url =
      enrollment.downloadTarget === "learning-universe"
        ? apiUrl(`/api/learning-universes/${downloadId}/download-complete`)
        : apiUrl(`/api/courses/${downloadId}/download-complete`);
    void triggerZipDownload(url, downloadId, title);
  };

  const handleDownloadLearningUniverse = (luId: string, title: string, canDownload: boolean) => {
    if (!canDownload) {
      toast({
        title: "Download locked",
        description: "Complete the course to unlock the downloadable course package.",
        variant: "destructive",
      });
      return;
    }
    void triggerZipDownload(apiUrl(`/api/learning-universes/${luId}/download-complete`), luId, title);
  };

  const loading = isLoading || luLoading;
  const loadError = coursesError || luError;

  return (
    <div className="catalog-layout space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="page-title tracking-tight">My Learning</h1>
          <p className="mt-2 text-muted-foreground">
            {loading
              ? "Loading your library…"
              : `You have ${totalEnrollments} enrollment${totalEnrollments === 1 ? "" : "s"} across courses and learning universes.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="bg-card/50 backdrop-blur-sm border border-border/50 px-4 py-2 rounded-xl">
            <div className="text-xs text-muted-foreground">In Progress</div>
            <div className="text-xl font-bold text-foreground">{loading ? "—" : inProgressCount}</div>
          </div>
          <div className="bg-card/50 backdrop-blur-sm border border-border/50 px-4 py-2 rounded-xl">
            <div className="text-xs text-muted-foreground">Completed</div>
            <div className="text-xl font-bold text-green-500">{loading ? "—" : completedCount}</div>
          </div>
          <Button asChild variant="outline" className="w-fit">
            <Link to="/student/browse">Explore More</Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="overflow-hidden border-border/40">
              <div className="animate-pulse">
                <div className="aspect-video bg-muted" />
                <div className="p-4 space-y-3">
                  <div className="h-3 bg-muted rounded w-1/3" />
                  <div className="h-5 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                  <div className="h-2 bg-muted rounded w-full" />
                  <div className="h-9 bg-muted rounded w-full" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : loadError ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-10 text-center space-y-4">
            <p className="text-lg font-semibold text-foreground">Unable to load your courses</p>
            <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
            <Button
              onClick={() => {
                void refetchCourses();
                void refetchLu();
              }}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : totalEnrollments === 0 ? (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="p-16 md:p-20 text-center space-y-4">
            <BookOpen className="w-16 h-16 mx-auto text-muted-foreground/30" />
            <div className="space-y-2">
              <p className="text-xl font-bold text-foreground">No courses yet</p>
              <p className="text-muted-foreground max-w-sm mx-auto">
                Explore available courses and start learning with THE GATEHUB.
              </p>
            </div>
            <Button asChild size="lg" className="rounded-full px-8">
              <Link to="/student/browse">Browse Courses</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {enrollments.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">My Courses</h2>
              <div className="course-cards-grid">
                {enrollments.map((e, i) => {
                  const isCompleted = e.isCompleted || (e.progress?.percent ?? 0) === 100;
                  const progress = e.progress?.percent ?? 0;
                  const certificate = getCertificateForCourse(
                    e.course.id,
                    e.course.learningUniverseId
                  );
                  const lastAccessed = e.progress?.lastAccessed || e.lastAccessed;
                  const lessonCount = e.course.lessonCount ?? e.progress?.totalLessons ?? 0;
                  const completedLessons = e.course.completedLessons ?? e.progress?.completedLessons ?? 0;
                  const moduleCount = e.course.moduleCount ?? e.course._count?.sections ?? 0;
                  const canDownload = Boolean(e.canDownload ?? isCompleted);
                  const continueUrl = e.continueUrl || `/student/course/${e.course.id}/learn`;
                  const meta = structureLine({
                    moduleCount,
                    lessonCount,
                    estimatedHours: e.course.estimatedHours,
                  });
                  const badge = productBadge(e.course.price, e.course.productType);

                  return (
                    <motion.div
                      key={e.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.4 }}
                      className="h-full"
                    >
                      <CourseCard
                        course={{
                          id: e.course.id,
                          title: e.course.title,
                          subtitle: e.course.subtitle,
                          thumbnail: e.course.thumbnail,
                          bannerUrl: e.course.bannerUrl,
                          instructor: e.course.instructor
                            ? `${e.course.instructor.firstName} ${e.course.instructor.lastName}`.trim()
                            : undefined,
                          rating: e.course.averageRating,
                          reviewCount: e.course.reviewCount,
                          difficulty: e.course.difficulty || undefined,
                          category: e.course.category?.name || e.course.categoryRel?.name,
                          studentCount: e.course._count?.enrollments,
                          isEnrolled: true,
                          progress,
                        }}
                        hideDefaultProgress
                        topRightOverlay={
                          <span className="rounded-full bg-black/60 text-white text-[10px] font-bold uppercase tracking-wide px-2 py-1 backdrop-blur-sm">
                            {badge}
                          </span>
                        }
                        headerBadge={
                          isCompleted ? (
                            <span className="bg-green-500/20 text-green-500 border border-green-500/30 px-2 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Completed
                            </span>
                          ) : (
                            <p className="type-section-label text-primary truncate">
                              {e.course.category?.name || e.course.categoryRel?.name || "Course"}
                            </p>
                          )
                        }
                        detail={
                          <div className="w-full space-y-2">
                            {meta && (
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                                <Layers className="w-3 h-3 shrink-0" />
                                <span>{meta}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{isCompleted ? "Course completed" : "Progress"}</span>
                              <span className="font-bold text-foreground">{progress}%</span>
                            </div>
                            <Progress value={progress} className="h-2" />
                            {!isCompleted && lessonCount > 0 && (
                              <p className="text-[11px] text-muted-foreground">
                                {completedLessons} / {lessonCount} lessons completed
                              </p>
                            )}
                            {isCompleted && e.completedAt && (
                              <p className="text-[11px] text-green-600 dark:text-green-400 flex items-center gap-1">
                                <Award className="w-3 h-3" />
                                Completed on {new Date(e.completedAt).toLocaleDateString()}
                              </p>
                            )}
                            {certificate ? (
                              <p className="text-[11px] text-green-600 dark:text-green-400 flex items-center gap-1">
                                <Award className="w-3 h-3" />
                                Certificate issued
                              </p>
                            ) : progress > 0 && !isCompleted ? (
                              <p className="text-[11px] text-muted-foreground">
                                Complete the course to unlock your certificate.
                              </p>
                            ) : null}
                            {lastAccessed && !isCompleted && (
                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Calendar className="w-3 h-3" />
                                Last accessed {new Date(lastAccessed).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        }
                        actions={
                          <div className="flex flex-wrap gap-2 w-full">
                            <Button
                              asChild
                              size="sm"
                              className={cn(
                                "rounded-lg font-bold shadow-sm flex-1 min-w-[8rem]",
                                isCompleted ? "bg-green-600 hover:bg-green-700" : "bg-primary"
                              )}
                            >
                              <Link to={continueUrl}>{isCompleted ? "Review Course" : "Continue Learning"}</Link>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn(
                                "rounded-lg flex gap-2",
                                canDownload
                                  ? "border-primary/30 text-primary hover:bg-primary/10"
                                  : "opacity-60"
                              )}
                              title={
                                canDownload
                                  ? "Download Course ZIP"
                                  : "Complete the course to unlock the downloadable course package."
                              }
                              onClick={() => handleDownloadCourse(e, e.course.title)}
                              disabled={
                                downloadingCourseId === (e.downloadId || e.course.id) || !canDownload
                              }
                            >
                              {downloadingCourseId === (e.downloadId || e.course.id) ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                              <span className="hidden sm:inline text-xs">
                                {canDownload ? "ZIP" : "Locked"}
                              </span>
                            </Button>
                            {isCompleted && certificate && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-lg border-green-500/30 text-green-600 hover:bg-green-500/10"
                                  onClick={async () => {
                                    if (!certificate) return;
                                    if (certificate.downloadKind === "lu" || certificate.type === "learning_universe") {
                                      await downloadLuCertificate(certificate, e.course.title);
                                      return;
                                    }
                                    setDownloadingId(certificate.certificateId);
                                    try {
                                      const token = localStorage.getItem("lms_token");
                                      if (!token) throw new Error("Authentication required");
                                      const response = await fetch(
                                        apiUrl(`/api/certificates/course/${certificate.id}/download`),
                                        { headers: { Authorization: `Bearer ${token}` } }
                                      );
                                      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
                                      const blob = await response.blob();
                                      if (blob.size === 0) throw new Error("Downloaded file is empty");
                                      const urlBlob = window.URL.createObjectURL(blob);
                                      const a = document.createElement("a");
                                      a.href = urlBlob;
                                      a.download = `THE_GATE_HUB_Certificate_${e.course.title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
                                      document.body.appendChild(a);
                                      a.click();
                                      setTimeout(() => {
                                        document.body.removeChild(a);
                                        window.URL.revokeObjectURL(urlBlob);
                                      }, 100);
                                      toast({ title: "Certificate downloaded successfully!", variant: "success" });
                                    } catch (err: unknown) {
                                      toast({
                                        title: "Download failed",
                                        description: err instanceof Error ? err.message : "Please try again later",
                                        variant: "destructive",
                                      });
                                    } finally {
                                      setDownloadingId(null);
                                    }
                                  }}
                                  disabled={downloadingId === certificate.certificateId}
                                >
                                  {downloadingId === certificate.certificateId ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Award className="w-4 h-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-lg border-blue-500/30 text-blue-600 hover:bg-blue-500/10"
                                  onClick={() => {
                                    const previewUrl = apiUrl(`/api/certificates/preview/${certificate.certificateId}`);
                                    const previewWindow = window.open(
                                      previewUrl,
                                      "_blank",
                                      "width=900,height=700,scrollbars=yes"
                                    );
                                    if (!previewWindow) {
                                      toast({
                                        title: "Preview failed",
                                        description: "Popup blocked. Please allow popups for this site.",
                                        variant: "destructive",
                                      });
                                    }
                                  }}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        }
                      />
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {luEnrollments.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Learning Universes</h2>
              <div className="course-cards-grid">
                {luEnrollments.map((e, i) => {
                  const lu = e.learningUniverse;
                  const progress = e.progress?.percentComplete ?? 0;
                  const isCompleted = e.isCompleted || progress === 100;
                  const certificate = getCertificateForLu(lu.id);
                  const continueUrl =
                    e.continueUrl || `/student/learning-universe/${lu.id}/learn`;
                  const lastAccessed = e.progress?.lastAccessed;
                  const lessonCount = lu.lessonCount ?? e.progress?.totalLessons ?? 0;
                  const completedLessons = lu.completedLessons ?? e.progress?.completedLessons ?? 0;
                  const moduleCount = lu.moduleCount ?? 0;
                  const canDownload = Boolean(e.canDownload ?? isCompleted);
                  const meta = structureLine({
                    moduleCount,
                    lessonCount,
                    estimatedHours: lu.estimatedHours,
                  });
                  const instructor = lu.instructor
                    ? `${lu.instructor.firstName} ${lu.instructor.lastName}`.trim()
                    : undefined;
                  const badge = productBadge(lu.price, lu.productType);

                  return (
                    <motion.div
                      key={e.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="h-full"
                    >
                      <CourseCard
                        course={{
                          id: lu.id,
                          title: lu.title,
                          subtitle: lu.subtitle || lu.description,
                          thumbnail: lu.thumbnail,
                          bannerUrl: lu.bannerUrl,
                          instructor,
                          difficulty: lu.difficulty || undefined,
                          category: lu.category?.name,
                          isEnrolled: true,
                          progress,
                        }}
                        hideDefaultProgress
                        topRightOverlay={
                          <span className="rounded-full bg-black/60 text-white text-[10px] font-bold uppercase tracking-wide px-2 py-1 backdrop-blur-sm">
                            {badge}
                          </span>
                        }
                        headerBadge={
                          isCompleted ? (
                            <span className="bg-green-500/20 text-green-500 border border-green-500/30 px-2 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Completed
                            </span>
                          ) : (
                            <p className="type-section-label text-primary truncate">
                              {lu.category?.name || "Learning Universe"}
                            </p>
                          )
                        }
                        detail={
                          <div className="w-full space-y-2">
                            {meta && (
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                                <Clock className="w-3 h-3 shrink-0" />
                                <span>{meta}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{isCompleted ? "Course completed" : "Progress"}</span>
                              <span className="font-bold text-foreground">{progress}%</span>
                            </div>
                            <Progress value={progress} className="h-2" />
                            {!isCompleted && lessonCount > 0 && (
                              <p className="text-[11px] text-muted-foreground">
                                {completedLessons} / {lessonCount} lessons completed
                              </p>
                            )}
                            {isCompleted && e.completedAt && (
                              <p className="text-[11px] text-green-600 dark:text-green-400 flex items-center gap-1">
                                <Award className="w-3 h-3" />
                                Completed on {new Date(e.completedAt).toLocaleDateString()}
                              </p>
                            )}
                            {lastAccessed && !isCompleted && (
                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Calendar className="w-3 h-3" />
                                Last accessed {new Date(lastAccessed).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        }
                        actions={
                          <div className="flex flex-wrap gap-2 w-full">
                            <Button
                              asChild
                              size="sm"
                              className={cn(
                                "rounded-lg font-bold shadow-sm flex-1 min-w-[8rem]",
                                isCompleted ? "bg-green-600 hover:bg-green-700" : "bg-primary"
                              )}
                            >
                              <Link to={continueUrl}>{isCompleted ? "Review Course" : "Continue Learning"}</Link>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn(
                                "rounded-lg flex gap-2",
                                canDownload
                                  ? "border-primary/30 text-primary hover:bg-primary/10"
                                  : "opacity-60"
                              )}
                              title={
                                canDownload
                                  ? "Download Course ZIP"
                                  : "Complete the course to unlock the downloadable course package."
                              }
                              onClick={() =>
                                handleDownloadLearningUniverse(lu.id, lu.title, canDownload)
                              }
                              disabled={downloadingCourseId === lu.id || !canDownload}
                            >
                              {downloadingCourseId === lu.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                              <span className="hidden sm:inline text-xs">
                                {canDownload ? "ZIP" : "Locked"}
                              </span>
                            </Button>
                            {isCompleted && certificate && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="border-green-500/30 text-green-600 hover:bg-green-500/10"
                                  onClick={() => downloadLuCertificate(certificate, lu.title)}
                                  disabled={downloadingId === certificate.certificateId}
                                >
                                  {downloadingId === certificate.certificateId ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Award className="w-4 h-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="border-blue-500/30 text-blue-600 hover:bg-blue-500/10"
                                  onClick={async () => {
                                    try {
                                      const token = localStorage.getItem("lms_token");
                                      if (!token) throw new Error("Authentication required");
                                      const raw =
                                        certificate.downloadUrl ||
                                        `/api/certificates/lu/${certificate.id}/download`;
                                      const url = raw.startsWith("http") ? raw : apiUrl(raw);
                                      const response = await fetch(url, {
                                        headers: { Authorization: `Bearer ${token}` },
                                      });
                                      if (!response.ok) throw new Error("Preview failed");
                                      const blob = await response.blob();
                                      const blobUrl = window.URL.createObjectURL(blob);
                                      window.open(blobUrl, "_blank");
                                      toast({ title: "Certificate preview opened", variant: "success" });
                                    } catch (err: unknown) {
                                      toast({
                                        title: "Preview failed",
                                        description:
                                          err instanceof Error ? err.message : "Please try again",
                                        variant: "destructive",
                                      });
                                    }
                                  }}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        }
                      />
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
