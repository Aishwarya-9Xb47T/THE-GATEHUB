import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Search, Play, Award } from "lucide-react";
import { api, getPublishedLearningUniverses } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CourseCard } from "@/components/common/CourseCard";
import { WishlistHeartButton } from "@/components/common/WishlistHeartButton";
import { useUserStore } from "@/store/userStore";
import { useToastStore } from "@/store/toastStore";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useRazorpayCheckout } from "@/hooks/useRazorpayCheckout";
import { studentCourseCta } from "@/lib/paymentUtils";

interface Course {
  id: string;
  title: string;
  subtitle?: string | null;
  price: number;
  thumbnail?: string | null;
  bannerUrl?: string | null;
  difficulty?: string | null;
  category?: { name: string } | null;
  instructor?: { firstName: string; lastName: string } | null;
  averageRating?: number;
  reviewCount?: number;
  _count?: { enrollments: number; reviews: number };
}

export function BrowseCourses() {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const navigate = useNavigate();
  
  const token = useUserStore((s) => s.token);
  const user = useUserStore((s) => s.user);
  const toast = useToastStore((s) => s.add);

  const { checkout, isProcessing } = useRazorpayCheckout({
    user,
    onSuccess: () => {
      toast({ title: "Payment successful!", variant: "success" });
    },
    onError: (msg) => toast({ title: "Payment error", description: msg, variant: "destructive" }),
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await api<{ categories: Array<{ id: string; name: string }> }>("/categories");
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["courses", "browse", search, categoryId, difficulty, price],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (categoryId) params.set("categoryId", categoryId);
      if (difficulty) params.set("difficulty", difficulty);
      if (price) params.set("price", price);
      const res = await api<{ courses: Course[] }>(`/courses?catalog=premium&${params}`);
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
  });

  const { data: luData, isLoading: luLoading } = useQuery({
    queryKey: ["learning-universes", "browse", search, categoryId, difficulty, price],
    queryFn: async () => {
      const res = await getPublishedLearningUniverses();
      if (!res?.data) return [];
      let items = (res.data || []) as any[];
      if (search) {
        const q = search.toLowerCase();
        items = items.filter((lu: any) =>
          lu.title?.toLowerCase().includes(q) || lu.description?.toLowerCase().includes(q)
        );
      }
      if (categoryId) {
        items = items.filter((lu: any) => lu.categoryRel?.id === categoryId || lu.categoryId === categoryId);
      }
      if (difficulty) {
        items = items.filter((lu: any) => lu.difficulty?.toLowerCase() === difficulty.toLowerCase());
      }
      if (price === "free") items = items.filter((lu: any) => (lu.price ?? 0) === 0);
      if (price === "paid") items = items.filter((lu: any) => (lu.price ?? 0) > 0);
      return items;
    },
  });

  const { data: luEnrollmentsData } = useQuery({
    queryKey: ["lu-enrollments"],
    queryFn: async () => {
      if (!token) return { enrollments: [] };
      const res = await api<{ enrollments: any[] }>("/learning-universes/my-enrollments");
      if (res.error) return { enrollments: [] };
      return res.data!;
    },
    enabled: !!token,
  });

  const { data: enrollmentsData, refetch: refetchEnrollments } = useQuery({
    queryKey: ["my-enrollments"],
    queryFn: async () => {
      if (!token) return { enrollments: [] };
      const res = await api<{ enrollments: any[] }>("/enrollments/my");
      if (res.error) return { enrollments: [] };
      return res.data!;
    },
    enabled: !!token,
  });

  const courses = data?.courses ?? [];
  const learningUniverses = luData ?? [];
  const enrollments = enrollmentsData?.enrollments ?? [];
  const luEnrollments = luEnrollmentsData?.enrollments ?? [];

  const getLuEnrollmentStatus = (luId: string) => {
    const enrollment = luEnrollments.find((e: any) => e.learningUniverseId === luId || e.learningUniverse?.id === luId);
    return {
      isEnrolled: !!enrollment,
      progress: enrollment?.progress?.percentComplete || 0,
      continueUrl: enrollment?.continueUrl as string | undefined,
      isCompleted: Boolean(enrollment?.isCompleted || (enrollment?.progress?.percentComplete ?? 0) === 100),
    };
  };

  const handleLuOpen = (luId: string) => {
    const status = getLuEnrollmentStatus(luId);
    if (status.isEnrolled) {
      navigate(status.continueUrl || `/student/learning-universe/${luId}/learn`);
    } else {
      navigate(`/learning-universe/${luId}/course`);
    }
  };

  const getEnrollmentStatus = (courseId: string) => {
    const enrollment = enrollments.find((e: any) => e.courseId === courseId || e.course?.id === courseId);
    return {
      isEnrolled: !!enrollment,
      progress: enrollment?.progress?.percent || 0,
      continueUrl: enrollment?.continueUrl as string | undefined,
      isCompleted: Boolean(enrollment?.isCompleted || (enrollment?.progress?.percent ?? 0) === 100),
      hasCertificate: Boolean(enrollment?.hasCertificate),
    };
  };

  const handleEnroll = async (courseId: string, price: number, title: string) => {
    if (!token) {
      toast({ title: "Sign in required", variant: "destructive" });
      return;
    }

    if (price > 0) {
      navigate(`/checkout?courseId=${courseId}`);
      return;
    }

    const res = await api<{ enrollment: unknown }>(`/enrollments/${courseId}`, { method: "POST" });
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else {
      toast({ title: "Enrolled successfully!", variant: "success" });
      void refetch();
      void refetchEnrollments();
    }
  };

  const handleContinueLearning = (courseId: string) => {
    const status = getEnrollmentStatus(courseId);
    if (status.continueUrl) {
      navigate(status.continueUrl);
      return;
    }
    navigate(`/student/course/${courseId}/learn`);
  };

  return (
    <div className="catalog-layout space-y-8">
      <div>
        <h1 className="page-title tracking-tight text-foreground">Browse Learning</h1>
        <p className="mt-1 text-lg text-muted-foreground">Courses, learning universes, and more — all in one place</p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search courses and learning universes..." className="pl-12 h-12 rounded-xl bg-background/50 border-border/50 text-base shadow-sm focus-visible:ring-primary/20" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-primary/20"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">All categories</option>
          {categories?.categories?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-primary/20"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
        >
          <option value="">All difficulties</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
        <select
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-primary/20"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        >
          <option value="">All prices</option>
          <option value="free">Free</option>
          <option value="paid">Paid</option>
        </select>
      </div>
      {isLoading ? (
        <div className="course-cards-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="course-card-skeleton border border-border/50 bg-card/50 animate-pulse">
              <div className="course-card-skeleton__banner" />
              <div className="p-4 space-y-3">
                <div className="h-3 w-20 bg-muted/50 rounded" />
                <div className="h-4 w-full bg-muted/50 rounded" />
                <div className="h-3 w-2/3 bg-muted/50 rounded" />
                <div className="h-8 w-28 bg-muted/50 rounded-lg ml-auto" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-12 text-center flex flex-col items-center gap-4">
            <div className="text-red-500 font-bold text-lg">Failed to load courses.</div>
            <p className="text-sm text-muted-foreground">There was a problem reaching the server.</p>
            <Button onClick={() => refetch()} variant="outline" className="border-red-500/20 text-red-500 hover:bg-red-500/10 hover:text-red-600">Try Again</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="course-cards-grid">
          {courses.map((c, i) => {
            const enrollmentStatus = getEnrollmentStatus(c.id);
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="h-full">
                <CourseCard
                  course={{
                    id: c.id,
                    title: c.title,
                    subtitle: c.subtitle,
                    thumbnail: c.thumbnail,
                    bannerUrl: c.bannerUrl || c.thumbnail,
                    price: c.price,
                    category: c.category?.name,
                    instructor: c.instructor ? `${c.instructor.firstName} ${c.instructor.lastName}` : undefined,
                    rating: c.averageRating,
                    reviewCount: c.reviewCount,
                    difficulty: c.difficulty || undefined,
                    studentCount: c._count?.enrollments,
                    isEnrolled: enrollmentStatus.isEnrolled,
                    progress: enrollmentStatus.progress,
                  }}
                  onClick={() => navigate(`/course/${c.id}`)}
                  topRightOverlay={<WishlistHeartButton courseId={c.id} />}
                  headerBadge={
                    enrollmentStatus.isEnrolled && (
                      <span className="bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-1 rounded-full text-xs font-bold">
                        {enrollmentStatus.progress === 100 ? (
                          <>
                            <Award className="w-3 h-3 mr-1 inline" />
                            Completed
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 mr-1 inline" />
                            Enrolled
                          </>
                        )}
                      </span>
                    )
                  }
                  actions={
                    enrollmentStatus.isEnrolled ? (
                      <Button 
                        size="sm" 
                        className="course-card__cta rounded-lg shadow-sm hover:-translate-y-0.5 transition-all ml-auto bg-green-600 hover:bg-green-700"
                        onClick={(e) => { e.stopPropagation(); handleContinueLearning(c.id); }}
                      >
                        {enrollmentStatus.isCompleted || enrollmentStatus.progress === 100
                          ? "Review Course"
                          : enrollmentStatus.progress > 0
                            ? "Continue Learning"
                            : "Start Learning"}
                      </Button>
                    ) : (
                      <Button 
                        size="sm" 
                        className={cn(
                          "course-card__cta rounded-lg shadow-sm hover:-translate-y-0.5 transition-all ml-auto",
                          c.price > 0 ? "bg-amber-600 hover:bg-amber-700" : "bg-primary"
                        )} 
                        onClick={(e) => { e.stopPropagation(); handleEnroll(c.id, c.price, c.title); }}
                        disabled={isProcessing}
                      >
                        {studentCourseCta(c.price, enrollmentStatus.isEnrolled)}
                      </Button>
                    )
                  }
                />
              </motion.div>
            );
          })}
        </div>
      )}
      {!isLoading && !isError && courses.length === 0 && learningUniverses.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <p className="text-lg font-semibold text-foreground">No courses to browse yet</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Published courses and Learning Universes will appear here. Check back soon or refine your filters.
            </p>
          </CardContent>
        </Card>
      )}

      {learningUniverses.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Learning Universes</h2>
          <div className="course-cards-grid">
            {learningUniverses.map((lu: any, i: number) => {
              const status = getLuEnrollmentStatus(lu.id);
              return (
                <motion.div key={lu.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="h-full">
                  <CourseCard
                    course={{
                      id: lu.id,
                      title: lu.title,
                      subtitle: lu.description,
                      thumbnail: lu.thumbnail,
                      bannerUrl: lu.bannerUrl || lu.thumbnail,
                      category: "Learning Universe",
                      difficulty: lu.difficulty,
                      price: lu.price ?? 0,
                      isEnrolled: status.isEnrolled,
                      progress: status.progress,
                    }}
                    onClick={() => handleLuOpen(lu.id)}
                    topRightOverlay={<WishlistHeartButton learningUniverseId={lu.id} />}
                    headerBadge={
                      status.isEnrolled ? (
                        <span className="bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-1 rounded-full text-xs font-bold">
                          Enrolled
                        </span>
                      ) : (
                        <p className="type-section-label text-primary truncate">Learning Universe</p>
                      )
                    }
                    actions={
                      <Button
                        size="sm"
                        className="course-card__cta rounded-lg shadow-sm hover:-translate-y-0.5 transition-all ml-auto"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLuOpen(lu.id);
                        }}
                      >
                        {status.isEnrolled ? "Continue Learning" : "View & Enroll"}
                      </Button>
                    }
                  />
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
