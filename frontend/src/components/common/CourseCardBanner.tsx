import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveCourseBannerUrl, placeholderHueFromSeed } from "@/lib/courseBanner";

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
  const sourceKey = `${bannerUrl ?? ""}|${thumbnailUrl ?? ""}|${src ?? ""}`;
  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const candidate of [bannerUrl ?? src, thumbnailUrl, src]) {
      if (!candidate) continue;
      const resolved = resolveCourseBannerUrl(candidate);
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        out.push(resolved);
      }
    }
    return out;
  }, [bannerUrl, thumbnailUrl, src]);

  const [candidateIndex, setCandidateIndex] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setGaveUp(false);
  }, [sourceKey]);

  const currentSrc = candidates[Math.min(candidateIndex, Math.max(0, candidates.length - 1))] || null;
  const seed = placeholderSeed || alt || "course";

  const handleImageError = () => {
    if (gaveUp) return;
    if (candidateIndex + 1 < candidates.length) {
      setCandidateIndex((prev) => prev + 1);
      return;
    }
    setGaveUp(true);
  };

  return (
    <div
      className={cn("course-card__banner", zoomOnHover && "course-card__banner--zoom", className)}
    >
      {currentSrc ? (
        <img
          key={currentSrc}
          src={currentSrc}
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
