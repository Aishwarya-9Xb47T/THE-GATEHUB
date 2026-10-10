import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  resolveCourseBannerUrl,
  deriveCourseThumbnailCandidate,
  placeholderHueFromSeed,
  courseImageLoadedSet,
} from "@/lib/courseBanner";
import { matchTemplateToCategory, getCategoryDurableBanner } from "@/lib/courseBranding/templates";

export interface CourseCardBannerProps {
  src?: string | null;
  bannerUrl?: string | null;
  thumbnailUrl?: string | null;
  category?: string | null;
  alt: string;
  placeholderSeed?: string;
  className?: string;
  imageClassName?: string;
  overlay?: boolean;
  zoomOnHover?: boolean;
  /** When true, loads eagerly with high fetchPriority (for above-the-fold / viewport cards) */
  priority?: boolean;
  /** When true, prefers high-resolution original banner (for hero / course detail headers) */
  preferOriginal?: boolean;
  children?: ReactNode;
}

export function CourseCardBannerPlaceholder({
  seed,
  category,
}: {
  seed: string;
  category?: string | null;
}) {
  const catQuery = category || seed;
  const durableSvg = catQuery ? getCategoryDurableBanner(catQuery) : null;
  const hue = placeholderHueFromSeed(seed);

  return (
    <div
      className="course-card__placeholder absolute inset-0"
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 42% 26%), hsl(${(hue + 42) % 360} 36% 16%))`,
      }}
      aria-hidden
    >
      {durableSvg ? (
        <img
          src={durableSvg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-luminosity pointer-events-none"
          loading="eager"
          decoding="async"
        />
      ) : null}
      <div className="course-card__placeholder-brand relative z-10">
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
  category,
  alt,
  placeholderSeed,
  className,
  imageClassName,
  overlay = true,
  zoomOnHover = false,
  priority = false,
  preferOriginal = false,
  children,
}: CourseCardBannerProps) {
  const sourceKey = `${bannerUrl ?? ""}|${thumbnailUrl ?? ""}|${src ?? ""}|${category ?? ""}|${preferOriginal ? "orig" : "thumb"}`;

  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];

    const addCandidate = (raw?: string | null) => {
      if (!raw) return;
      const resolved = resolveCourseBannerUrl(raw);
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        out.push(resolved);
      }
    };

    if (preferOriginal) {
      // 1. Full original banner first for detail/hero views
      addCandidate(bannerUrl ?? src);
      addCandidate(thumbnailUrl);
      addCandidate(src);
    } else {
      // 1. Fast, optimized thumbnail candidate first for card displays
      addCandidate(thumbnailUrl);
      const derivedThumb = deriveCourseThumbnailCandidate(thumbnailUrl || bannerUrl || src);
      if (derivedThumb) {
        addCandidate(derivedThumb);
      }
      addCandidate(bannerUrl ?? src);
      addCandidate(src);
    }

    // 2. Guaranteed durable locally-stored category SVG artwork (loads instantly < 10ms from public/)
    const catQuery = category || placeholderSeed || alt;
    if (catQuery) {
      const localDurable = getCategoryDurableBanner(catQuery);
      if (localDurable && !seen.has(localDurable)) {
        seen.add(localDurable);
        out.push(localDurable);
      }

      // 3. Deliberate, curated category template fallback
      const template = matchTemplateToCategory(catQuery);
      const fallbackUrl = template?.thumbnailUrl || template?.previewUrl;
      if (fallbackUrl && !seen.has(fallbackUrl)) {
        seen.add(fallbackUrl);
        out.push(fallbackUrl);
      }
    }

    return out;
  }, [bannerUrl, thumbnailUrl, src, category, placeholderSeed, alt, preferOriginal]);

  const [candidateIndex, setCandidateIndex] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);

  const currentSrc = candidates[Math.min(candidateIndex, Math.max(0, candidates.length - 1))] || null;
  const isWarm = currentSrc ? courseImageLoadedSet.has(currentSrc) : false;
  const [isLoaded, setIsLoaded] = useState(isWarm);

  useEffect(() => {
    setCandidateIndex(0);
    setGaveUp(false);
    setIsLoaded(currentSrc ? courseImageLoadedSet.has(currentSrc) : false);
  }, [sourceKey]);

  const seed = placeholderSeed || category || alt || "course";

  const handleImageLoad = () => {
    if (currentSrc) {
      courseImageLoadedSet.add(currentSrc);
    }
    setIsLoaded(true);
  };

  const handleImageError = () => {
    if (gaveUp) return;
    if (candidateIndex + 1 < candidates.length) {
      setCandidateIndex((prev) => prev + 1);
      setIsLoaded(false);
      return;
    }
    setGaveUp(true);
  };

  return (
    <div
      className={cn("course-card__banner", zoomOnHover && "course-card__banner--zoom", className)}
    >
      {/* Visual background placeholder while image loads or if permanently unavailable */}
      {(!isLoaded || gaveUp || !currentSrc) && (
        <CourseCardBannerPlaceholder seed={seed} category={category} />
      )}

      {currentSrc && !gaveUp && (
        <img
          key={currentSrc}
          src={currentSrc}
          alt={alt}
          width={640}
          height={360}
          className={cn(
            "course-card__image absolute inset-0 w-full h-full object-cover",
            imageClassName,
            !isLoaded && "opacity-0",
            isLoaded && "opacity-100 transition-opacity duration-300 ease-out"
          )}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
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
  priority = false,
  ...props
}: CourseCardBannerProps) {
  return (
    <CourseCardBanner
      {...props}
      overlay={overlay}
      zoomOnHover={false}
      priority={priority}
      className={cn("course-banner-thumb", className)}
    />
  );
}
