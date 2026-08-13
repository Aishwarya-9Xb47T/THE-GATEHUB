import { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ShimmerHeadingProps {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  id?: string;
}

export function ShimmerHeading({
  as: Tag = "h2",
  className,
  children,
  id,
  ...props
}: ShimmerHeadingProps & Record<string, unknown>) {
  return (
    <Tag id={id} className={cn("landing-shimmer-heading", className)} {...props}>
      <span className="landing-shimmer-heading__inner">
        <span className="landing-shimmer-heading__text">{children}</span>
        <span className="landing-shimmer-heading__shine" aria-hidden="true">
          {children}
        </span>
      </span>
    </Tag>
  );
}
