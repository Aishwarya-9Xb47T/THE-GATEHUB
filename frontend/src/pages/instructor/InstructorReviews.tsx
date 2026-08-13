import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Star, GraduationCap, BookOpen } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface Review {
  id: string;
  rating: number;
  reviewText: string | null;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
    profileImage: string | null;
  };
  course: {
    id: string;
    title: string;
    thumbnail?: string | null;
    status: string;
    averageRating: number;
    reviewCount: number;
  };
}

interface CourseReviewGroup {
  courseId: string;
  courseTitle: string;
  courseThumbnail?: string | null;
  courseStatus: string;
  courseRating: number;
  courseReviewCount: number;
  reviews: Review[];
}

export function InstructorReviews() {
  const { data, isLoading } = useQuery({
    queryKey: ["instructor", "reviews"],
    queryFn: async () => {
      const res = await api<{ reviews: Review[] }>("/reviews/instructor");
      if (res.error) throw new Error(res.error);
      return res.data!.reviews;
    },
  });

  const reviews = data ?? [];

  // Group reviews by course
  const groupedReviews: CourseReviewGroup[] = reviews.reduce((acc: CourseReviewGroup[], review) => {
    const existingGroup = acc.find(group => group.courseId === review.course.id);
    
    if (existingGroup) {
      existingGroup.reviews.push(review);
    } else {
      acc.push({
        courseId: review.course.id,
        courseTitle: review.course.title,
        courseThumbnail: review.course.thumbnail,
        courseStatus: review.course.status,
        courseRating: review.course.averageRating,
        courseReviewCount: review.course.reviewCount,
        reviews: [review]
      });
    }
    
    return acc;
  }, []);

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="page-title">Student Reviews</h1>
        <p className="mt-1 text-muted-foreground">Monitor feedback across all your published courses</p>
      </div>

      {isLoading ? (
        <div className="grid gap-6">
          {[1, 2].map(i => (
            <Card key={i} className="animate-pulse h-48 bg-card/30" />
          ))}
        </div>
      ) : groupedReviews.length === 0 ? (
        <Card className="border-dashed border-2 bg-transparent">
          <CardContent className="p-20 text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center">
              <Star className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-xl font-bold text-foreground">No reviews yet</p>
              <p className="text-muted-foreground max-w-xs mx-auto">
                Once students start reviewing your courses, they will appear here grouped by course.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-8">
          {groupedReviews.map((group, groupIdx) => (
            <div key={groupIdx} className="space-y-6">
              {/* Course Card Header */}
              <Card className="border-border/40 shadow-md overflow-hidden bg-card/50 backdrop-blur-sm">
                <div className="flex flex-col md:flex-row">
                  {/* Course Thumbnail */}
                  <div className="h-32 md:h-auto md:w-48 bg-gray-100 flex items-center justify-center relative overflow-hidden">
                    <img
                      src={group.courseThumbnail || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=60"}
                      alt={group.courseTitle}
                      className="max-h-full max-w-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=60";
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    
                    {/* Status Badge */}
                    <div className="absolute top-3 right-3">
                      <span className={cn(
                        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border backdrop-blur-sm",
                        group.courseStatus === "published" 
                          ? "bg-green-500/20 text-green-400 border-green-500/30" 
                          : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                      )}>
                        {group.courseStatus === "published" ? "Published" : "Draft"}
                      </span>
                    </div>
                  </div>

                  {/* Course Info */}
                  <div className="flex-1 p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <GraduationCap className="w-6 h-6 text-primary" />
                          <h2 className="text-2xl font-bold text-foreground tracking-tight">
                            {group.courseTitle}
                          </h2>
                        </div>
                        
                        {/* Stats */}
                        <div className="flex items-center gap-6 text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Star className="w-4 h-4 text-amber-500" />
                            <span className="text-sm font-medium text-amber-400">
                              {group.courseRating.toFixed(1)} ({group.courseReviewCount})
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            <span className="text-sm font-medium capitalize">
                              {group.courseReviewCount} {group.courseReviewCount === 1 ? 'Review' : 'Reviews'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Reviews List */}
              <div className="grid gap-4">
                {group.reviews.map((review) => (
                  <Card key={review.id} className="border-border/40 shadow-sm bg-card/50 backdrop-blur-sm">
                    <CardContent className="p-6">
                      <div className="flex gap-4">
                        <Avatar className="h-10 w-10 shrink-0 border border-border/50 shadow-sm">
                          <AvatarImage src={review.user.profileImage || review.user.avatar || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary font-bold">
                            {review.user?.firstName?.[0] || "U"}{review.user?.lastName?.[0] || ""}
                          </AvatarFallback>
                        </Avatar>
                        <div className="space-y-3 flex-grow">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-bold text-foreground">{review.user?.firstName || "Unknown"} {review.user?.lastName || "User"}</p>
                              <div className="flex items-center gap-1 mt-1">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <Star key={i} className={`w-3.5 h-3.5 ${i < review.rating ? "fill-current text-amber-500" : "text-slate-200"}`} />
                                ))}
                              </div>
                            </div>
                            <span className="text-sm text-muted-foreground">{format(new Date(review.createdAt), "MMM d, yyyy")}</span>
                          </div>
                          {review.reviewText && (
                            <p className="text-muted-foreground italic border-l-2 border-primary/20 pl-3">"{review.reviewText}"</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
