import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { CourseCard } from "@/components/common/CourseCard";
import { WishlistHeartButton } from "@/components/common/WishlistHeartButton";
import { LandingCatalogSkeleton } from "@/components/landing/LandingCatalogSkeleton";
import { ShimmerHeading } from "@/components/landing/ShimmerHeading";
import { landingCoursesQueryOptions, type LandingCoursesResponse } from "@/lib/landingQueries";

export function LandingFeaturedCoursesSection() {
  const navigate = useNavigate();
  const { data: coursesData, isLoading: coursesLoading, isError: coursesError } = useQuery<LandingCoursesResponse>(
    landingCoursesQueryOptions
  );

  return (
    <section id="courses" className="landing-section bg-transparent dark:bg-background relative overflow-hidden transition-colors scroll-mt-16">
      <div className="absolute top-1/2 left-1/2 w-[800px] h-[400px] -translate-x-1/2 -translate-y-1/2 bg-brand-indigo/[0.04] dark:bg-brand-blue/[0.06] rounded-full blur-[150px] pointer-events-none" />

      <div className="landing-shell landing-shell--catalog relative z-10">
        <div className="landing-section-header landing-section-heading-wrap text-center">
          <ShimmerHeading className="landing-section-heading font-display">Featured Courses</ShimmerHeading>
          <p className="landing-subheading mx-auto">
            Expert-led programs built for depth, practice, and career outcomes.
          </p>
          <Link to="/login" className="landing-btn landing-btn--ghost mt-8 group">
            View all courses <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        <div className="landing-cards-grid">
          {coursesLoading ? (
            <LandingCatalogSkeleton />
          ) : coursesError ? (
            <div className="col-span-full text-center py-12">
              <div className="text-destructive mb-2">Unable to load courses</div>
              <p className="text-muted-foreground dark:text-muted-foreground text-sm">
                The course catalog is temporarily unavailable. Please check back later.
              </p>
            </div>
          ) : coursesData?.courses?.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <div className="text-muted-foreground dark:text-muted-foreground mb-2">No courses available yet</div>
              <p className="text-muted-foreground/70 dark:text-muted-foreground/70 text-sm">
                Check back soon for new courses!
              </p>
            </div>
          ) : (
            Array.isArray(coursesData!.courses) &&
            coursesData!.courses.map((c) => (
              <CourseCard
                key={c.id}
                course={{
                  id: c.id,
                  title: c.title || "Untitled Course",
                  instructor: c.instructor
                    ? `${c.instructor.firstName || ""} ${c.instructor.lastName || ""}`.trim() || "Unknown Instructor"
                    : "Unknown Instructor",
                  thumbnail: c.thumbnail,
                  bannerUrl: c.bannerUrl || c.thumbnail,
                  price: c.price,
                  rating: c.averageRating || 0,
                  reviewCount: c.reviewCount || 0,
                  category: c.categoryRel?.name || c.category || "Uncategorized",
                  subtitle: c.subtitle,
                }}
                onClick={() => navigate(`/course/${c.id}`)}
                topRightOverlay={<WishlistHeartButton courseId={c.id} />}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
