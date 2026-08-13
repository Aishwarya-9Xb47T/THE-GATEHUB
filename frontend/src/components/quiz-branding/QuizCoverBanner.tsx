import type { ReactNode } from "react";
import { CourseCardBanner } from "@/components/common/CourseCardBanner";
import { cn } from "@/lib/utils";
import {
  resolveQuizBannerUrl,
  resolveQuizCoverSeed,
  resolveQuizCoverStyle,
  resolveQuizTailwindGradient,
  type QuizCoverFields,
} from "@/lib/quizBranding/resolveQuizCover";
import { resolveIconEmoji, type QuizBrandingData } from "@/lib/quizBranding/types";

interface QuizCoverBannerProps extends QuizCoverFields {
  alt: string;
  className?: string;
  imageClassName?: string;
  overlay?: boolean;
  zoomOnHover?: boolean;
  showIconFallback?: boolean;
  icon?: Pick<QuizBrandingData, "icon" | "customIcon">;
  children?: ReactNode;
}

/**
 * Single quiz cover renderer — image when persisted, theme gradient as fallback.
 * Never shows a plain gray placeholder.
 */
export function QuizCoverBanner({
  alt,
  className,
  imageClassName,
  overlay = true,
  zoomOnHover = false,
  showIconFallback = true,
  icon,
  children,
  ...fields
}: QuizCoverBannerProps) {
  const bannerUrl = resolveQuizBannerUrl(fields);
  const gradient = resolveQuizTailwindGradient(fields, resolveQuizCoverSeed(fields));
  const coverStyle = resolveQuizCoverStyle(fields);
  const emoji = icon ? resolveIconEmoji(icon) : null;

  if (bannerUrl) {
    return (
      <CourseCardBanner
        bannerUrl={bannerUrl}
        thumbnailUrl={fields.thumbnailUrl}
        alt={alt}
        placeholderSeed={resolveQuizCoverSeed(fields)}
        className={className}
        imageClassName={imageClassName}
        overlay={overlay}
        zoomOnHover={zoomOnHover}
      >
        {children}
      </CourseCardBanner>
    );
  }

  return (
    <div
      className={cn("relative overflow-hidden bg-gradient-to-br", gradient, className)}
      style={coverStyle}
    >
      {showIconFallback && emoji && (
        <div className="absolute inset-0 flex items-center justify-center text-4xl opacity-30">{emoji}</div>
      )}
      {overlay && <div className="absolute inset-0 bg-black/20" aria-hidden />}
      {children}
    </div>
  );
}
