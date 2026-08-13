import { Link, useLocation, useNavigate } from "react-router-dom";
import { Users, Star, Eye, BookOpen, Trash2, PlayCircle, StopCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildInstructorCoursePreviewPath, instructorPreviewState } from "@/lib/instructorPreview";
import { getInstructorCourseEditPath, type CourseAcademicStudioEdit } from "@/lib/instructorCourseEdit";
import { CourseCardBanner } from "@/components/common/CourseCardBanner";

interface InstructorCourseCardProps {
  course: {
    id: string;
    title: string;
    subtitle?: string | null;
    description?: string | null;
    thumbnail?: string | null;
    averageRating?: number;
    reviewCount?: number;
    _count: { enrollments: number; sections: number; reviews?: number };
    status: string;
    academicStudioEdit?: CourseAcademicStudioEdit | null;
  };
  variant?: "dashboard" | "catalog";
  onTogglePublish?: (courseId: string, status: string) => void;
  onDelete?: (course: InstructorCourseCardProps["course"]) => void;
}

export function InstructorCourseCard({
  course,
  variant = "dashboard",
  onTogglePublish,
  onDelete,
}: InstructorCourseCardProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const description = course.description || course.subtitle || "No description available";
  const reviewCount = course.reviewCount ?? course._count.reviews ?? 0;
  const averageRating = course.averageRating ?? 0;
  const returnPath = location.pathname + location.search;
  const editPath = getInstructorCourseEditPath(course);

  const openPreview = () => {
    const previewState = instructorPreviewState(location);
    const luId = course.academicStudioEdit?.learningUniverseId;
    navigate(buildInstructorCoursePreviewPath(course.id, returnPath, luId), {
      state: previewState,
    });
  };

  return (
    <article className="course-card group">
      <CourseCardBanner
        thumbnailUrl={course.thumbnail}
        alt={course.title}
        placeholderSeed={course.title}
      >
        <div className="absolute top-3 right-3 z-10">
          <span
            className={cn(
              "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border backdrop-blur-sm",
              course.status === "published"
                ? "bg-green-500/20 text-green-400 border-green-500/30"
                : "bg-primary/15 text-primary border-primary/30"
            )}
          >
            {course.status === "published" ? "Published" : "Draft"}
          </span>
        </div>

        <div className="absolute top-3 left-3 z-10">
          <div className="flex items-center gap-1 bg-background/70 backdrop-blur-sm px-2.5 py-1 rounded-full border border-border/60">
            <Users className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">
              {course._count.enrollments} {course._count.enrollments === 1 ? "Student" : "Students"}
            </span>
          </div>
        </div>
      </CourseCardBanner>

      <div className="course-card__body">
        <div className="course-card__content">
          {reviewCount > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="flex items-center gap-1 text-primary">
                <Star className="w-4 h-4 fill-current" />
                <span className="text-sm font-semibold">{averageRating.toFixed(1)}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                ({reviewCount} {reviewCount === 1 ? "review" : "reviews"})
              </span>
            </div>
          )}

          <h3 className="course-card__title type-course-title group-hover:text-primary transition-colors">
            {course.title}
          </h3>

          <p className="course-card__description text-body-sm text-muted-foreground">{description}</p>

          <div className="flex items-center gap-4 text-muted-foreground flex-shrink-0 pt-1">
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">{course._count.enrollments}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium capitalize">{course.status}</span>
            </div>
          </div>
        </div>

        <div className="course-card__footer course-card__footer--dual">
          <div className="course-card__actions course-card__actions--dual flex-wrap gap-2">
            <Link
              to={editPath}
              className="course-card__cta course-card__cta--secondary inline-flex flex-1 items-center justify-center rounded-lg font-medium text-sm px-4 transition-colors min-w-[5rem]"
            >
              Edit
            </Link>
            <button
              type="button"
              onClick={openPreview}
              className="course-card__cta course-card__cta--secondary inline-flex flex-1 items-center justify-center gap-2 rounded-lg font-medium text-sm px-4 transition-colors min-w-[5rem]"
            >
              <Eye className="w-4 h-4 shrink-0" />
              Preview
            </button>
            {variant === "dashboard" ? (
              <Link
                to={`/instructor/students#course-${course.id}`}
                className="course-card__cta course-card__cta--primary inline-flex flex-1 items-center justify-center gap-2 rounded-lg font-medium text-sm transition-all min-w-[5rem]"
              >
                <Users className="w-4 h-4 shrink-0" />
                Students
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onTogglePublish?.(course.id, course.status)}
                  className="course-card__cta course-card__cta--secondary inline-flex flex-1 items-center justify-center gap-2 rounded-lg font-medium text-sm px-4 transition-colors min-w-[5rem]"
                >
                  {course.status === "published" ? (
                    <>
                      <StopCircle className="w-4 h-4 shrink-0" />
                      Unpublish
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-4 h-4 shrink-0" />
                      Publish
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete?.(course)}
                  className="course-card__cta course-card__cta--secondary inline-flex items-center justify-center rounded-lg font-medium text-sm px-3 transition-colors text-destructive hover:bg-destructive/10"
                  aria-label="Delete course"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
