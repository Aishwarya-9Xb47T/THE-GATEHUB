import { useState, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { resolveCourseBannerUrl } from "@/lib/courseBanner";
import {
  resolveQuizBannerUrl,
  resolveQuizCoverSeed,
  resolveQuizCoverStyle,
  resolveQuizTailwindGradient,
  type QuizCoverFields,
} from "@/lib/quizBranding/resolveQuizCover";
import { resolveIconEmoji, inferSubjectEmoji, type QuizBrandingData } from "@/lib/quizBranding/types";

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
 * Dedicated quiz cover renderer — displays user/configured image if valid,
 * and gracefully falls back to the quiz's intentional theme gradient + subject badge.
 * Never shows a plain gray placeholder, never accepts error SVGs, and never mixes course fallbacks.
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
  const [imageFailed, setImageFailed] = useState(false);
  const rawBannerUrl = resolveQuizBannerUrl(fields);
  const resolvedImage = rawBannerUrl ? resolveCourseBannerUrl(rawBannerUrl) : null;

  useEffect(() => {
    setImageFailed(false);
  }, [resolvedImage]);

  const gradient = resolveQuizTailwindGradient(fields, resolveQuizCoverSeed(fields));
  const coverStyle = resolveQuizCoverStyle(fields);
  const emoji = icon ? resolveIconEmoji(icon) : inferSubjectEmoji(alt || fields.subject);

  if (resolvedImage && !imageFailed) {
    return (
      <div className={cn("relative overflow-hidden bg-slate-900", zoomOnHover && "group", className)}>
        <img
          src={resolvedImage}
          alt={alt}
          className={cn(
            "w-full h-full object-cover",
            zoomOnHover && "transition-transform duration-500 group-hover:scale-105",
            imageClassName
          )}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
        {overlay && <div className="absolute inset-0 bg-black/25 pointer-events-none" aria-hidden />}
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn("relative overflow-hidden bg-gradient-to-br flex items-center justify-center", gradient, className)}
      style={coverStyle}
    >
      {showIconFallback && emoji && (
        <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-20 select-none pointer-events-none transition-transform duration-300 hover:scale-110">
          {emoji}
        </div>
      )}
      {overlay && <div className="absolute inset-0 bg-black/15 pointer-events-none" aria-hidden />}
      {children}
    </div>
  );
}
