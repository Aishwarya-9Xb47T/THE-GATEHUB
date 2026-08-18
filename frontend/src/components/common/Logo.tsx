import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { BRAND_NAME } from "@/lib/brand";
import { navigateToLanding } from "@/lib/navigation";
import { prefetchLandingData } from "@/lib/landingQueries";

interface BrandMarkProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onFocus?: () => void;
}

/** Text wordmark only — visual logo mark is not rendered in the product UI. */
export function BrandMark({ className, onClick, onMouseEnter, onFocus }: BrandMarkProps) {
  if (!onClick) return null;
  return (
    <button
      type="button"
      className={cn("brand-wordmark font-display border-0 bg-transparent p-0 cursor-pointer", className)}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      aria-label={`${BRAND_NAME} home`}
    >
      {BRAND_NAME}
    </button>
  );
}

interface BrandAvatarProps {
  size?: number;
  className?: string;
}

/** Neutral assistant glyph — not the product logo. */
export function BrandAvatar({ size = 36, className }: BrandAvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0",
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Sparkles style={{ width: Math.round(size * 0.48), height: Math.round(size * 0.48) }} />
    </span>
  );
}

interface LogoProps {
  className?: string;
  hideText?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}

export function Logo({ className, hideText = false }: LogoProps) {
  if (hideText) return null;
  return <span className={cn("brand-wordmark font-display", className)}>{BRAND_NAME}</span>;
}

interface BrandHomeButtonProps {
  hideText?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  children?: ReactNode;
  markOnly?: boolean;
}

/** Brand home control — wordmark text, no logo image. */
export function BrandHomeButton({
  hideText,
  className,
  children,
  markOnly = false,
}: BrandHomeButtonProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const prefetchHome = () => prefetchLandingData(queryClient);

  const goHome = () => {
    navigateToLanding(navigate, location);
  };

  const homeHandlers = {
    onClick: goHome,
    onMouseEnter: prefetchHome,
    onFocus: prefetchHome,
  };

  if (children) {
    return (
      <button
        type="button"
        {...homeHandlers}
        className={cn("inline-flex items-center border-0 bg-transparent p-0 cursor-pointer", className)}
        aria-label={`${BRAND_NAME} home`}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      type="button"
      {...homeHandlers}
      className={cn(
        "inline-flex items-center border-0 bg-transparent p-0 cursor-pointer hover:opacity-90 transition-opacity",
        className
      )}
      aria-label={`${BRAND_NAME} home`}
    >
      {hideText || markOnly ? (
        <span className="brand-wordmark font-display text-sm">{BRAND_NAME}</span>
      ) : (
        <Logo />
      )}
    </button>
  );
}
