import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Clock } from "lucide-react";
import { CourseCard } from "@/components/common/CourseCard";
import { WishlistHeartButton } from "@/components/common/WishlistHeartButton";
import { Button } from "@/components/ui/button";
import { LandingCatalogSkeleton } from "@/components/landing/LandingCatalogSkeleton";
import { ShimmerHeading } from "@/components/landing/ShimmerHeading";
import {
  landingCoursesQueryOptions,
  landingUniversesQueryOptions,
  mergeLandingExploreItems,
  type LandingCoursesResponse,
  type LandingUniversesResponse,
} from "@/lib/landingQueries";

export function LandingExploreCoursesSection() {
  const navigate = useNavigate();
  const universesQuery = useQuery<LandingUniversesResponse>(landingUniversesQueryOptions);
  const coursesQuery = useQuery<LandingCoursesResponse>(landingCoursesQueryOptions);

  const items = mergeLandingExploreItems(universesQuery.data, coursesQuery.data?.courses);
  const isLoading = universesQuery.isLoading || coursesQuery.isLoading;
  const isError = universesQuery.isError && coursesQuery.isError;

  return (
    <section
      id="courses"
      className="landing-section landing-section--paths border-y border-border/60 bg-white/40 dark:bg-secondary/20 backdrop-blur-sm transition-colors scroll-mt-16"
    >
      <div className="landing-shell landing-shell--catalog">
        <div className="landing-section-header landing-section-heading-wrap text-center">
          <ShimmerHeading className="landing-section-heading font-display">Explore Courses</ShimmerHeading>
          <p className="landing-subheading mx-auto">
            Structured learning paths and expert-led programs — all in one place.
          </p>
          <Link to="/login" className="landing-btn landing-btn--ghost mt-8 group">
            View all courses <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {isLoading ? (
          <LandingCatalogSkeleton />
        ) : isError ? (
          <div className="text-center py-12 text-muted-foreground">
            Unable to load courses. Please refresh the page.
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">No published courses yet.</p>
          </div>
        ) : (
          <div className="landing-cards-grid">
            {items.map((item) =>
              item.kind === "universe" ? (
                <CourseCard
                  key={`universe-${item.id}`}
                  course={{
                    id: item.universe.id,
                    title: item.universe.title,
                    subtitle: item.universe.subtitle || item.universe.description,
                    thumbnail: item.universe.thumbnail,
                    bannerUrl: item.universe.bannerUrl || item.universe.thumbnail,
                    category: item.universe.categoryRel?.name,
                    difficulty: item.universe.difficulty,
                    instructor: item.universe.instructor
                      ? `${item.universe.instructor.firstName} ${item.universe.instructor.lastName}`
                      : "Unknown Instructor",
                    price: item.universe.price,
                  }}
                  onClick={() => navigate(`/learning-universe/${item.universe.id}/course`)}
                  headerBadge={
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
                        Learning Universe
                      </span>
                      {(item.universe.price ?? 0) > 0 ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
                          Premium
                        </span>
                      ) : (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
                          Free
                        </span>
                      )}
                    </div>
                  }
                  stats={
                    <div className="flex items-center gap-2">
                      <Clock className="w-3 h-3" />
                      <span className="text-xs font-medium">{item.universe.estimatedHours ?? 0}h</span>
                      <BookOpen className="w-3 h-3" />
                      <span className="text-xs font-medium">{item.universe.lessonCount ?? 0} lessons</span>
                    </div>
                  }
                  topRightOverlay={<WishlistHeartButton learningUniverseId={item.universe.id} />}
                  actions={
                    <Button
                      size="sm"
                      className="course-card__cta gap-1.5"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate(`/learning-universe/${item.universe.id}/course`);
                      }}
                    >
                      Start Learning
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  }
                />
              ) : (
                <CourseCard
                  key={`course-${item.id}`}
                  course={{
                    id: item.course.id,
                    title: item.course.title || "Untitled Course",
                    instructor: item.course.instructor
                      ? `${item.course.instructor.firstName || ""} ${item.course.instructor.lastName || ""}`.trim() ||
                        "Unknown Instructor"
                      : "Unknown Instructor",
                    thumbnail: item.course.thumbnail,
                    bannerUrl: item.course.bannerUrl || item.course.thumbnail,
                    price: item.course.price,
                    rating: item.course.averageRating || 0,
                    reviewCount: item.course.reviewCount || 0,
                    category: item.course.categoryRel?.name || item.course.category || "Uncategorized",
                    subtitle: item.course.subtitle,
                  }}
                  headerBadge={
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
                        Course
                      </span>
                      {(item.course.price ?? 0) > 0 ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
                          Premium
                        </span>
                      ) : (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
                          Free
                        </span>
                      )}
                    </div>
                  }
                  onClick={() => navigate(`/course/${item.course.id}`)}
                  topRightOverlay={<WishlistHeartButton courseId={item.course.id} />}
                />
              )
            )}
          </div>
        )}
      </div>
    </section>
  );
}
