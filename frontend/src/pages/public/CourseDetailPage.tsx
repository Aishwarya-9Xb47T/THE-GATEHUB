import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, PlayCircle, Globe, User, ShieldCheck, ArrowLeft, Loader2, Star, FileText, Target, Zap, ListChecks, Users, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useUserStore } from "@/store/userStore";
import { useToastStore } from "@/store/toastStore";
import ReactMarkdown from 'react-markdown';
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { AuthModal } from "@/components/auth/AuthModal";
import { Lock, AlertCircle } from "lucide-react";
import { NotesPreview } from "@/components/course/NotesPreview";
import { useRazorpayCheckout } from "@/hooks/useRazorpayCheckout";
import { formatINR, studentCourseCta } from "@/lib/paymentUtils";
import { WishlistSaveButton } from "@/components/common/WishlistSaveButton";

export function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, token } = useUserStore();
  const toast = useToastStore((s) => s.add);
  const queryClient = useQueryClient();
  const [isDownloadingCertificate, setIsDownloadingCertificate] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const { data: courseResponse, isLoading, refetch } = useQuery({
    queryKey: ["course", courseId],
    queryFn: async () => {
      const endpoint = user ? `/courses/${courseId}/learn` : `/courses/${courseId}`;
      const res = await api<any>(endpoint);
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    enabled: !!courseId,
  });

  const { checkout, isProcessing: isProcessingPayment } = useRazorpayCheckout({
    user,
    onSuccess: () => {
      toast({ title: "Payment Successful!", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["enrollment-check", courseId] });
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
    },
    onError: (msg) => toast({ title: "Payment Error", description: msg, variant: "destructive" }),
  });

  const handleLockedContentClick = () => {
    setShowAuthModal(true);
  };

  // Fetch PDF for notes when lecture is selected
  const fetchPdfForLecture = async (lecture: any) => {
    if (lecture?.type === "notes" && lecture?.content) {
      setIsPdfLoading(true);
      setPdfError(null);
      
      try {
        const res = await fetch(`/api/latex/compile`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            latex: lecture.content,
            format: "pdf"
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || errData.logs || "Failed to load PDF notes");
        }

        const data = await res.json();
        setPdfUrl(data.pdfUrl);
      } catch (err: any) {
        setPdfError(err.message || "Failed to load PDF");
      } finally {
        setIsPdfLoading(false);
      }
    }
  };

  const courseData = courseResponse?.course;
  const lecturesFromAPI = courseResponse?.lectures || [];

  const { data: aiDetails } = useQuery({
    queryKey: ["course-ai-details", courseId],
    queryFn: async () => {
      const res = await api<any>(`/courses/${courseId}/ai-details`);
      if (res.error) return null;
      return res.data.details;
    },
    enabled: !!courseId,
  });

  const { data: enrollmentStatus, refetch: refetchEnrollment } = useQuery({
    queryKey: ["enrollment-check", courseId],
    queryFn: async () => {
      const res = await api<any>(`/enrollments/${courseId}/check`);
      if (res.error) return { enrolled: false, paid: false };
      
      // Also fetch progress if enrolled (includes canonical continueUrl for LU-backed courses)
      if (res.data.enrolled) {
        const progressRes = await api<any>(`/enrollments/${courseId}/progress`);
        if (!progressRes.error) {
          return {
            ...res.data,
            progress: progressRes.data.progress,
            continueUrl: progressRes.data.continueUrl,
          };
        }
      }
      return res.data;
    },
    enabled: !!courseId && !!token,
  });

  const handleDownloadCertificate = async () => {
    if (!courseId) return;
    setIsDownloadingCertificate(true);
    try {
      const response = await fetch(`/api/certificates/course/${courseId}/generate`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to download certificate");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Certificate_${courseData?.title.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: "Certificate downloaded!", variant: "success" });
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    } finally {
      setIsDownloadingCertificate(false);
    }
  };

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast({ title: "Payment Successful!", description: "You are now enrolled in the course.", variant: "success" });
      refetch();
      refetchEnrollment();
      const next = new URLSearchParams(searchParams);
      next.delete("success");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, toast, refetch, refetchEnrollment, setSearchParams]);

  const handleEnroll = async () => {
    if (!token) {
      toast({ title: "Sign in required", variant: "destructive" });
      navigate("/login");
      return;
    }

    const isPaid = courseData.price === 0 || enrollmentStatus?.paid;
    const isEnrolled = enrollmentStatus?.enrolled;

    if (courseData.price > 0 && !isPaid) {
      navigate(`/checkout?courseId=${courseId}`);
      return;
    }

    if (isEnrolled) {
      const continueUrl =
        enrollmentStatus?.progress?.continueUrl ||
        enrollmentStatus?.continueUrl ||
        `/student/course/${courseId}/learn`;
      navigate(continueUrl);
      return;
    }

    const res = await api<{ enrollment: unknown }>(`/enrollments/${courseId}`, { method: "POST" });
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else {
      toast({ title: "Enrolled successfully!", variant: "success" });
      refetchEnrollment();
      navigate(`/student/course/${courseId}/learn`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!courseData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <AlertCircle className="w-10 h-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Course not found</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          This course may have been removed or the link is incorrect.
        </p>
        <Button onClick={() => navigate("/student/browse")}>Browse courses</Button>
      </div>
    );
  }

  const isEnrolled = enrollmentStatus?.enrolled;
  const isPaid = courseData.price === 0 || enrollmentStatus?.paid;
  const progressPercent =
    typeof enrollmentStatus?.progress?.percent === "number"
      ? enrollmentStatus.progress.percent
      : undefined;
  const aiContent = courseData.aiContent ? JSON.parse(courseData.aiContent) : aiDetails;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Hero Section */}
      <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
                
        <div className="relative w-full min-w-0 px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <div className="flex flex-col lg:flex-row gap-12 lg:gap-16 items-center">
            <div className="flex-1 space-y-8">
              {/* Back Button */}
              <Button 
                variant="ghost" 
                className="text-white/60 hover:text-white hover:bg-white/10 p-0 flex items-center gap-2 mb-2 transition-all duration-200"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="w-4 h-4" /> Back to Courses
              </Button>
              
              {/* Category Badge */}
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="bg-primary/20 text-primary border-none uppercase tracking-widest text-[11px] font-bold py-2 px-4 rounded-full">
                  {courseData.category?.name || "Premium Course"}
                </Badge>
                {courseData.level && (
                  <Badge variant="outline" className="border-white/20 text-white/80 text-[11px] font-medium py-2 px-4 rounded-full">
                    {courseData.level}
                  </Badge>
                )}
              </div>
              
              {/* Course Title */}
              <div className="space-y-4">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight bg-gradient-to-r from-white to-white/90 bg-clip-text text-transparent">
                  {courseData.title}
                </h1>
                <p className="text-xl sm:text-2xl text-slate-300 font-normal max-w-3xl leading-relaxed">
                  {courseData.subtitle}
                </p>
              </div>
              
              {/* Course Meta Information */}
              <div className="flex flex-wrap gap-6 text-sm font-medium text-slate-400">
                <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-lg">
                  <Star className="w-4 h-4 text-yellow-500 fill-current" />
                  <span className="text-white">{courseData.averageRating?.toFixed(1) || "4.8"}</span>
                  <span className="text-slate-400">({courseData.reviewCount || 0} reviews)</span>
                </div>
                <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-lg">
                  <User className="w-4 h-4" />
                  <span>By {courseData.instructor?.firstName} {courseData.instructor?.lastName}</span>
                </div>
                <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-lg">
                  <Globe className="w-4 h-4" />
                  <span>English</span>
                </div>
                <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-lg">
                  <ListChecks className="w-4 h-4" />
                  <span>{courseData.sections?.length || 0} sections</span>
                </div>
              </div>
            </div>
          
          <Card className="w-full lg:w-[420px] shrink-0 overflow-hidden border-none shadow-2xl shadow-primary/30 bg-slate-800/95 backdrop-blur-sm lg:-mb-32 z-10 ring-1 ring-white/10">
            <div className="aspect-video relative group bg-gray-100 flex items-center justify-center overflow-hidden">
              <img 
                src={courseData.thumbnail || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=60"} 
                className="max-h-full max-w-full object-contain transition-transform duration-700 group-hover:scale-105"
                alt={courseData.title}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=60";
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-80 group-hover:opacity-60 transition-all duration-300" />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-95 group-hover:scale-100">
                <div className="w-16 h-16 bg-primary/95 backdrop-blur-sm rounded-full flex items-center justify-center shadow-2xl border border-white/20">
                  <PlayCircle className="w-8 h-8 text-white fill-current" />
                </div>
              </div>
            </div>
            <CardContent className="p-8 space-y-6">
              {/* Pricing Section */}
              <div className="space-y-4">
                <div className="flex items-baseline gap-3">
                  <span className="text-5xl font-bold text-white">
                    {courseData.price > 0 ? formatINR(courseData.price) : "Free"}
                  </span>
                </div>

                {typeof courseData.enrollmentCount === "number" && (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Users className="w-4 h-4" />
                    <span>
                      {courseData.enrollmentCount.toLocaleString()} student
                      {courseData.enrollmentCount === 1 ? "" : "s"} enrolled
                    </span>
                  </div>
                )}
              </div>
              
              {/* Enroll Button */}
              <Button 
                className={cn(
                  "w-full h-16 text-lg font-bold rounded-2xl shadow-xl transition-all duration-200 active:scale-95 border-2",
                  isEnrolled 
                    ? "bg-gradient-to-r from-secondary to-secondary/80 hover:from-secondary/90 hover:to-secondary/70 text-secondary-foreground border-secondary/50" 
                    : "bg-gradient-to-r from-primary to-primary/90 hover:from-primary/95 hover:to-primary/85 shadow-primary/30 border-primary/50"
                )}
                onClick={handleEnroll}
                disabled={isProcessingPayment}
              >
                {isProcessingPayment ? (
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </div>
                ) : isEnrolled && progressPercent === 100 ? (
                  "Review Course"
                ) : isEnrolled ? (
                  (progressPercent ?? 0) > 0 ? "Continue Learning" : "Start Learning"
                ) : (
                  studentCourseCta(courseData.price, false)
                )}
              </Button>

              {courseId && !isEnrolled && (
                <WishlistSaveButton courseId={courseId} fullWidth className="border-white/20 text-white hover:bg-white/10" />
              )}

              {/* Progress Section */}
              {isEnrolled && enrollmentStatus?.progress && (
                <div className="space-y-4 p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-300 uppercase tracking-wider">Your Progress</span>
                    <span className="text-lg font-bold text-primary">{enrollmentStatus.progress.percent}%</span>
                  </div>
                  <Progress value={enrollmentStatus.progress.percent} className="h-3 bg-slate-700" />

                  {enrollmentStatus.progress.percent === 100 && (
                    <div className="space-y-2">
                      <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                        Completed · Certificate available
                      </Badge>
                      <Button 
                        variant="outline" 
                        className="w-full border-amber-500/50 text-amber-500 hover:bg-amber-500/10 gap-2 font-bold"
                        onClick={handleDownloadCertificate}
                        disabled={isDownloadingCertificate}
                      >
                        {isDownloadingCertificate ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trophy className="w-4 h-4" />
                        )}
                        {isDownloadingCertificate ? "Generating PDF..." : "Download Certificate"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
              
              {/* Course Features */}
              <div className="space-y-4 pt-6 border-t border-white/10">
                <p className="text-sm font-bold text-white uppercase tracking-wider opacity-70">This course includes:</p>
                <div className="grid gap-4 text-sm text-slate-300">
                  {courseData.duration ? (
                    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                      <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
                        <PlayCircle className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-medium">{courseData.duration} hours on-demand video</span>
                    </div>
                  ) : null}
                  {courseData.resources ? (
                    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                      <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
                        <FileText className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-medium">{courseData.resources} downloadable resources</span>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                    <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-primary" />
                    </div>
                    <span className="font-medium">Full lifetime access</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                    <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4 text-primary" />
                    </div>
                    <span className="font-medium">Certificate of completion</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full min-w-0 px-4 mt-12 lg:mt-40 flex flex-col lg:flex-row gap-16">
        <div className="flex-1 space-y-12">
          {aiContent?.whatYouWillLearn && (
            <section className="space-y-8 bg-gradient-to-br from-card via-card to-card/50 border border-border/40 p-8 lg:p-10 rounded-3xl shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl flex items-center justify-center">
                  <Target className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-3xl font-bold tracking-tight">What You Will Learn</h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-6">
                {aiContent.whatYouWillLearn.map((outcome: string, idx: number) => (
                  <div 
                    key={idx} 
                    className="flex gap-4 text-muted-foreground leading-relaxed p-4 rounded-xl hover:bg-muted/20 transition-all duration-200 group"
                  >
                    <div className="w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center shrink-0 mt-1 group-hover:bg-green-500/30 transition-colors">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    </div>
                    <span className="text-sm font-medium">{outcome}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-1 h-12 bg-gradient-to-b from-primary to-primary/50 rounded-full" />
              <h2 className="text-3xl font-bold tracking-tight">Course Description</h2>
            </div>
            <div className="prose prose-slate dark:prose-invert max-w-none text-muted-foreground leading-relaxed text-lg bg-card/30 p-8 rounded-2xl border border-border/20">
              {aiContent?.description ? (
                <ReactMarkdown>{aiContent.description}</ReactMarkdown>
              ) : (
                courseData.description
              )}
            </div>
          </section>

          {aiContent?.skills && (
            <section className="space-y-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-amber-500/20 to-orange-500/10 rounded-xl flex items-center justify-center">
                  <Zap className="w-6 h-6 text-amber-500" />
                </div>
                <h2 className="text-3xl font-bold tracking-tight">Skills You Will Gain</h2>
              </div>
              <div className="flex flex-wrap gap-3">
                {aiContent.skills.map((skill: string, idx: number) => (
                  <div key={idx}>
                    <Badge variant="secondary" className="px-5 py-3 rounded-xl text-sm font-medium bg-gradient-to-r from-secondary/50 to-secondary/30 border border-border/30 hover:border-primary/50 transition-all duration-200">
                      {skill}
                    </Badge>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-cyan-500/10 rounded-xl flex items-center justify-center">
                <ListChecks className="w-6 h-6 text-blue-500" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight">Curriculum</h2>
            </div>
            <div className="space-y-6">
              {courseData.sections?.map((section: any, idx: number) => (
                <div key={section.id}>
                  <Card className="border-border/40 overflow-hidden hover:border-primary/30 transition-all duration-300 hover:shadow-lg group">
                    <div className="bg-gradient-to-r from-muted/40 to-muted/20 p-6 flex items-center justify-between group-hover:from-muted/50 group-hover:to-muted/30 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/30 flex items-center justify-center font-bold text-primary text-lg group-hover:scale-110 transition-transform">
                          {idx + 1}
                        </div>
                        <div>
                          <h3 className="font-bold text-xl text-foreground">{section.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1">{section.lectures?.length || 0} lectures</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-primary uppercase tracking-wider bg-primary/10 px-3 py-1 rounded-full">
                          Section {idx + 1}
                        </span>
                      </div>
                    </div>
                    <div className="divide-y divide-border/20">
                      {section.lectures?.map((lecture: any, lectureIdx: number) => {
                        const isNotes = lecture.type === "notes";
                        const isCourseCompleted = enrollmentStatus?.progress?.percent === 100;
                        const shouldShowGuestAuthPrompt = !user;
                        const shouldShowEnrollPrompt = user && !isEnrolled && !isCourseCompleted;

                        if (isNotes) {
                          const selectedLecture =
                            lecturesFromAPI?.find((l: any) => l.id === lecture.id) ||
                            courseData?.sections
                              ?.flatMap((s: any) => s.lectures)
                              ?.find((l: any) => l.id === lecture.id);
                          
                          return (
                            <NotesPreview
                              key={lecture.id}
                              lecture={selectedLecture}
                              user={user}
                              isEnrolled={isEnrolled}
                              isCourseCompleted={isCourseCompleted}
                              onRegisterClick={handleLockedContentClick}
                              onEnrollClick={handleEnroll}
                            />
                          );
                        }

                        return (
                          <div 
                            key={lecture.id} 
                            className={cn(
                              "p-4 flex items-center justify-between transition-colors group relative",
                              shouldShowGuestAuthPrompt && "blur-sm opacity-60 pointer-events-none",
                              !shouldShowGuestAuthPrompt && "hover:bg-muted/10"
                            )}
                            onClick={shouldShowGuestAuthPrompt ? handleLockedContentClick : undefined}
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                                {lectureIdx + 1}
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{lecture.title}</p>
                                <p className="text-sm text-muted-foreground">{lecture.duration || "5 min"}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {shouldShowGuestAuthPrompt && (
                                <div className="text-center">
                                  <Lock className="w-8 h-8 text-primary mx-auto mb-2" />
                                  <p className="text-xs font-medium text-primary">Click to unlock</p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          </section>

          {/* Guest CTA */}
          {!user && courseData.sections && courseData.sections.length > 0 && (
            <div className="mt-8 text-center">
              <Button 
                onClick={handleLockedContentClick}
                size="lg"
                className="bg-primary hover:bg-primary/90 text-white font-bold px-8 py-3"
              >
                View full curriculum
              </Button>
              <p className="mt-3 text-sm text-muted-foreground">
                Get instant access to {courseData.sections.reduce((acc: number, section: any) => acc + (section.lectures?.length || 0), 0)} lectures, 
                progress tracking, and certificate upon completion.
              </p>
            </div>
          )}
        </div>

        <div className="lg:w-80 space-y-8">
          {aiContent?.requirements && (
            <section className="space-y-4">
              <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-primary" />
                Requirements
              </h2>
              <ul className="space-y-2">
                {aiContent.requirements.map((req: string, idx: number) => (
                  <li key={idx} className="text-sm text-muted-foreground flex gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    {req}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {aiContent?.targetAudience && (
            <section className="space-y-4">
              <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Who is this for?
              </h2>
              <ul className="space-y-2">
                {aiContent.targetAudience.map((target: string, idx: number) => (
                  <li key={idx} className="text-sm text-muted-foreground flex gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    {target}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-4">
            <h2 className="text-xl font-bold tracking-tight">Instructor</h2>
            <Card className="border-border/40 bg-card/50">
              <CardContent className="p-6 text-center space-y-4">
                <div className="w-24 h-24 rounded-full bg-primary/10 mx-auto border-4 border-background flex items-center justify-center text-3xl font-bold text-primary">
                  {courseData.instructor?.firstName?.[0]}{courseData.instructor?.lastName?.[0]}
                </div>
                <div>
                  <h4 className="font-bold text-lg">{courseData.instructor?.firstName} {courseData.instructor?.lastName}</h4>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest mt-1">Lead Instructor</p>
                </div>
                <p className="text-sm text-muted-foreground font-normal leading-relaxed">
                  Expert educator with 10+ years of experience in specialized learning environments.
                </p>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
    </div>
  );
}
