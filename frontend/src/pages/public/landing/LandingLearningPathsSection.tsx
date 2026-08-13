import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ArrowRight, Clock } from "lucide-react";
import { CourseCard } from "@/components/common/CourseCard";
import { WishlistHeartButton } from "@/components/common/WishlistHeartButton";
import { Button } from "@/components/ui/button";
import { LandingCatalogSkeleton } from "@/components/landing/LandingCatalogSkeleton";
import { ShimmerHeading } from "@/components/landing/ShimmerHeading";
import {
  landingUniversesQueryOptions,
  type LandingUniversesResponse,
} from "@/lib/landingQueries";

export function LandingLearningPathsSection() {
  const navigate = useNavigate();
  const { data: universes = [], isLoading, isError } = useQuery<LandingUniversesResponse>(
    landingUniversesQueryOptions
  );

  return (
    <section
      id="learning-paths"
      className="landing-section landing-section--paths border-y border-border/60 bg-white/40 dark:bg-secondary/20 backdrop-blur-sm transition-colors"
    >
      <div className="landing-shell landing-shell--catalog">
        <div className="landing-paths-header landing-section-heading-wrap">
          <ShimmerHeading className="landing-section-heading font-display">Explore Learning Paths</ShimmerHeading>
          <p className="landing-subheading">
            Structured journeys designed to take you from fundamentals to job-ready expertise.
          </p>
        </div>

        {isLoading ? (
          <LandingCatalogSkeleton />
        ) : isError ? (
          <div className="text-center py-12 text-muted-foreground">
            Unable to load learning paths. Please refresh the page.
          </div>
        ) : universes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground dark:text-muted-foreground text-lg">
              No published learning universes yet.
            </p>
          </div>
        ) : (
          <div className="landing-cards-grid">
            {universes.map((universe: any) => (
              <CourseCard
                key={universe.id}
                course={{
                  id: universe.id,
                  title: universe.title,
                  subtitle: universe.subtitle || universe.description,
                  thumbnail: universe.thumbnail,
                  bannerUrl: universe.bannerUrl || universe.thumbnail,
                  category: universe.categoryRel?.name,
                  difficulty: universe.difficulty,
                  instructor: universe.instructor
                    ? `${universe.instructor.firstName} ${universe.instructor.lastName}`
                    : "Unknown Instructor",
                }}
                stats={
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    <span className="text-xs font-medium">{universe.estimatedHours ?? 0}h</span>
                    <BookOpen className="w-3 h-3" />
                    <span className="text-xs font-medium">{universe.lessonCount ?? 0} lessons</span>
                  </div>
                }
                topRightOverlay={<WishlistHeartButton learningUniverseId={universe.id} />}
                actions={
                  <Button
                    size="sm"
                    className="course-card__cta gap-1.5"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(`/learning-universe/${universe.id}/course`);
                    }}
                  >
                    Start Learning
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
