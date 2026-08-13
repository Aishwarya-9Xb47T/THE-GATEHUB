import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { BRAND_LOGO_HEIGHT, BRAND_LOGO_SRC, BRAND_NAME, type BrandLogoSize } from "@/lib/brand";
import { navigateToLanding } from "@/lib/navigation";
import { prefetchLandingData } from "@/lib/landingQueries";

interface BrandMarkProps {
  size?: BrandLogoSize;
  className?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onFocus?: () => void;
}

/** Official logo mark only — use beside custom titles or in compact headers */
export function BrandMark({ size = "lg", className, onClick, onMouseEnter, onFocus }: BrandMarkProps) {
  const height = BRAND_LOGO_HEIGHT[size];
  return (
    <img
      src={BRAND_LOGO_SRC}
      alt={`${BRAND_NAME} Logo`}
      className={cn("object-contain w-auto shrink-0", onClick && "cursor-pointer", className)}
      style={{ height, width: "auto" }}
      height={height}
      width={height}
      decoding="async"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    />
  );
}

interface BrandAvatarProps {
  /** Diameter in pixels */
  size?: number;
  className?: string;
}

/** Circular black avatar — logo clipped to circle (assistant, compact UI) */
export function BrandAvatar({ size = 36, className }: BrandAvatarProps) {
  return (
    <span
      className={cn("brand-avatar", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <img src={BRAND_LOGO_SRC} alt="" className="brand-avatar__img" decoding="async" />
    </span>
  );
}

interface LogoProps {
  className?: string;
  hideText?: boolean;
  size?: BrandLogoSize;
}

export function Logo({ className, hideText = false, size = "lg" }: LogoProps) {
  return (
    <div className="flex items-center gap-3">
      <motion.div
        animate={{ y: [0, -2, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="relative"
      >
        <motion.div
          className="absolute inset-0 rounded-full blur-xl opacity-25 dark:opacity-35 bg-gradient-to-tr from-brand-blue/40 via-brand-indigo/30 to-primary/40"
          animate={{
            rotate: 360,
            scale: [1, 1.06, 1],
            opacity: [0.15, 0.3, 0.15],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
        />
        <BrandMark
          size={size}
          className={cn(
            "relative z-10 rounded-full bg-background/80 dark:bg-background/50 shadow-sm transition-all duration-500",
            className
          )}
        />
      </motion.div>
      {!hideText && (
        <span className="brand-wordmark font-display">{BRAND_NAME}</span>
      )}
    </div>
  );
}

interface BrandHomeButtonProps {
  hideText?: boolean;
  size?: BrandLogoSize;
  className?: string;
  children?: ReactNode;
  markOnly?: boolean;
}

/** Logo / brand mark that always navigates to the public landing page */
export function BrandHomeButton({
  hideText,
  size = "lg",
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

  if (markOnly) {
    return (
      <BrandMark
        size={size}
        className={className}
        onClick={goHome}
        onMouseEnter={prefetchHome}
        onFocus={prefetchHome}
      />
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
      <Logo hideText={hideText} size={size} />
    </button>
  );
}
