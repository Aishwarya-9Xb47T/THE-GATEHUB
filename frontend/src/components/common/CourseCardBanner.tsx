import { useState, type ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveCourseBannerUrl, pickCourseBannerSrc, placeholderHueFromSeed } from "@/lib/courseBanner";

export interface CourseCardBannerProps {
  src?: string | null;
  bannerUrl?: string | null;
  thumbnailUrl?: string | null;
  alt: string;
  placeholderSeed?: string;
  className?: string;
  imageClassName?: string;
  overlay?: boolean;
  zoomOnHover?: boolean;
  children?: ReactNode;
}

export function CourseCardBannerPlaceholder({ seed }: { seed: string }) {
  const hue = placeholderHueFromSeed(seed);

  return (
    <div
      className="course-card__placeholder"
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 45% 28%), hsl(${(hue + 42) % 360} 38% 18%))`,
      }}
      aria-hidden
    >
      <div className="course-card__placeholder-brand">
        <BookOpen className="course-card__placeholder-icon" strokeWidth={1.25} />
        <span className="course-card__placeholder-label">THE GATEHUB</span>
      </div>
    </div>
  );
}

export function CourseCardBanner({
  src,
  bannerUrl,
  thumbnailUrl,
  alt,
  placeholderSeed,
  className,
  imageClassName,
  overlay = true,
  zoomOnHover = false,
  children,
}: CourseCardBannerProps) {
  const candidates = [
    bannerUrl ?? src,
    thumbnailUrl,
    thumbnailUrl !== src ? src : null,
  ]
    .map((c) => (c ? resolveCourseBannerUrl(c) : null))
    .filter((c): c is string => Boolean(c));

  const [candidateIndex, setCandidateIndex] = useState(0);

  const currentSrc = candidates[candidateIndex] || null;
  const showImage = Boolean(currentSrc);
  const seed = placeholderSeed || alt || "course";

  const handleImageError = () => {
    if (candidateIndex + 1 < candidates.length) {
      setCandidateIndex((prev) => prev + 1);
    } else {
      setCandidateIndex(candidates.length);
    }
  };

  return (
    <div
      className={cn("course-card__banner", zoomOnHover && "course-card__banner--zoom", className)}
    >
      {showImage ? (
        <img
          key={currentSrc!}
          src={currentSrc!}
          alt={alt}
          className={cn("course-card__image", imageClassName)}
          loading="lazy"
          decoding="async"
          onError={handleImageError}
        />
      ) : (
        <CourseCardBannerPlaceholder seed={seed} />
      )}
      {overlay && <div className="course-card__banner-overlay" aria-hidden />}
      {children}
    </div>
  );
}

/** Compact 16:9 thumb for list rows (e.g. continue-learning). */
export function CourseBannerThumb({
  className,
  overlay = false,
  ...props
}: CourseCardBannerProps) {
  return (
    <CourseCardBanner
      {...props}
      overlay={overlay}
      zoomOnHover={false}
      className={cn("course-banner-thumb", className)}
    />
  );
}
