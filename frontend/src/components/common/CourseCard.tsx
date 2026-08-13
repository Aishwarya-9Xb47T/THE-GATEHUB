import { ReactNode } from "react";
import { Star, Users, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/paymentUtils";
import { CourseCardBanner } from "@/components/common/CourseCardBanner";

interface CourseCardProps {
  course: {
    id: string;
    title: string;
    instructor?: string;
    thumbnail?: string | null;
    bannerUrl?: string | null;
    price?: number;
    rating?: number;
    reviewCount?: number;
    category?: string | { name?: string };
    subtitle?: string | null;
    difficulty?: string;
    studentCount?: number;
    isEnrolled?: boolean;
    progress?: number;
  };
  onClick?: () => void;
  actions?: ReactNode;
  topRightOverlay?: ReactNode;
  headerBadge?: ReactNode;
  /** Compact meta row (ratings / counts) — kept beside the category badge */
  stats?: ReactNode;
  /** Full-width enrollment detail (modules, progress, dates) below description */
  detail?: ReactNode;
  /** When true, hide the built-in progress bar (use detail instead) */
  hideDefaultProgress?: boolean;
}

export function CourseCard({
  course,
  onClick,
  actions,
  topRightOverlay,
  headerBadge,
  stats,
  detail,
  hideDefaultProgress,
}: CourseCardProps) {
  const categoryLabel =
    typeof course.category === "string" ? course.category : course.category?.name || "Uncategorized";

  return (
    <article
      onClick={onClick}
      className={cn("course-card group", onClick && "cursor-pointer")}
    >
      <CourseCardBanner
        bannerUrl={course.bannerUrl}
        thumbnailUrl={course.thumbnail}
        alt={course.title}
        placeholderSeed={categoryLabel}
      >
        {topRightOverlay && (
          <div className="absolute top-2.5 right-2.5 z-10" onClick={(e) => e.stopPropagation()}>
            {topRightOverlay}
          </div>
        )}
      </CourseCardBanner>

      <div className="course-card__body">
        <div className="course-card__content">
          <div className="course-card__meta">
            {headerBadge ? (
              headerBadge
            ) : (
              <p className="type-section-label text-primary truncate">{categoryLabel}</p>
            )}
            {stats ? (
              stats
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                {course.reviewCount ? (
                  <div className="flex items-center gap-1 text-primary">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span className="text-caption font-medium text-foreground">
                      {typeof course.rating === "number" && Number.isFinite(course.rating)
                        ? course.rating.toFixed(1)
                        : "—"}
                    </span>
                  </div>
                ) : null}
                {course.studentCount ? (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Users className="w-3.5 h-3.5" />
                    <span className="text-caption font-medium">{course.studentCount}</span>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <h3 className="course-card__title type-course-title group-hover:text-primary transition-colors">
            {course.title || "Untitled Course"}
          </h3>

          <p className="course-card__instructor text-caption text-text-muted">
            By {course.instructor || "Unknown Instructor"}
          </p>

          {course.difficulty && (
            <span
              className={cn(
                "course-card__difficulty inline-flex items-center self-start px-2 py-0.5 rounded-full text-caption font-medium border",
                course.difficulty.toLowerCase() === "beginner" &&
                  "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30",
                course.difficulty.toLowerCase() === "intermediate" && "bg-primary/10 text-primary border-primary/30",
                course.difficulty.toLowerCase() === "advanced" &&
                  "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30"
              )}
            >
              <BookOpen className="w-3 h-3 mr-1 shrink-0" />
              {course.difficulty}
            </span>
          )}

          {course.subtitle ? (
            <p className="course-card__description text-body-sm text-text-muted">{course.subtitle}</p>
          ) : null}

          {detail ? <div className="course-card__detail w-full space-y-2 mt-1">{detail}</div> : null}

          {!hideDefaultProgress && course.isEnrolled && course.progress !== undefined && (
            <div className="course-card__progress">
              <div className="flex justify-between text-caption text-muted-foreground mb-1">
                <span>Progress</span>
                <span>{course.progress}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-500 rounded-full",
                    course.progress === 100 ? "bg-green-500" : "bg-primary"
                  )}
                  style={{ width: `${course.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {(course.price !== undefined || actions) && (
          <div className="course-card__footer">
            {course.price !== undefined ? (
              <span className="course-card__price type-stat text-base">
                {course.price > 0 ? formatINR(Number(course.price)) : "Free"}
              </span>
            ) : (
              <span className="course-card__price-spacer" aria-hidden />
            )}
            {actions ? (
              <div className="course-card__actions" onClick={(e) => e.stopPropagation()}>
                {actions}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}
