import { Link, useNavigate } from "react-router-dom";
import { Eye, Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildInstructorLuPreviewPath,
  type InstructorPreviewReturnState,
} from "@/lib/instructorPreview";
import { CourseCardBanner } from "@/components/common/CourseCardBanner";

interface InstructorLuCardProps {
  universe: {
    id: string;
    title: string;
    status: string;
    thumbnail?: string | null;
    bannerUrl?: string | null;
    _count?: { enrollments: number };
  };
  returnState: InstructorPreviewReturnState;
  onDelete?: (universe: InstructorLuCardProps["universe"]) => void;
}

export function InstructorLuCard({ universe, returnState, onDelete }: InstructorLuCardProps) {
  const navigate = useNavigate();

  return (
    <article className="course-card group">
      <CourseCardBanner
        bannerUrl={universe.bannerUrl}
        thumbnailUrl={universe.thumbnail}
        alt={universe.title}
        placeholderSeed={universe.title}
      >
        <span
          className={cn(
            "absolute top-3 right-3 z-10 inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border backdrop-blur-sm",
            universe.status === "published"
              ? "bg-green-500/20 text-green-600 border-green-500/30"
              : "bg-amber-500/15 text-amber-600 border-amber-500/30"
          )}
        >
          {universe.status}
        </span>
      </CourseCardBanner>

      <div className="course-card__body">
        <div className="course-card__content">
          <h3 className="course-card__title type-course-title group-hover:text-primary transition-colors">
            {universe.title}
          </h3>
          {universe._count != null && (
            <p className="text-xs text-muted-foreground">
              {universe._count.enrollments} students enrolled
            </p>
          )}
        </div>

        <div className="course-card__footer course-card__footer--dual">
          <div className="course-card__actions course-card__actions--dual flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="flex-1 rounded-lg">
              <Link to={`/learning-universe/${universe.id}/course`}>
                <Edit2 className="w-3.5 h-3.5 mr-1" /> Manage
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 rounded-lg"
              onClick={() => {
                navigate(buildInstructorLuPreviewPath(universe.id), { state: returnState });
              }}
            >
              <Eye className="w-3.5 h-3.5 mr-1" /> Preview
            </Button>
            {onDelete && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10 rounded-lg"
                onClick={() => onDelete(universe)}
                aria-label="Delete learning universe"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
