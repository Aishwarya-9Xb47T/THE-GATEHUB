import { Component, type ReactNode } from "react";
import { resolveCourseBannerUrl } from "@/lib/courseBanner";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class BannerErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Banner preview failed to load. Try selecting a different image.
          </div>
        )
      );
    }
    return this.props.children;
  }
}

interface BannerImageProps {
  src: string;
  alt: string;
  className?: string;
  onLoad?: () => void;
}

export function BannerImage({ src, alt, className, onLoad }: BannerImageProps) {
  const resolved = resolveCourseBannerUrl(src);
  if (!resolved) {
    return <div className={`bg-muted animate-pulse ${className || ""}`} />;
  }
  return (
    <img
      src={resolved}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onLoad={onLoad}
      onError={(e) => {
        (e.target as HTMLImageElement).style.opacity = "0.3";
      }}
    />
  );
}

export function BannerSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="aspect-video rounded-lg bg-muted animate-pulse" />
      ))}
    </div>
  );
}
