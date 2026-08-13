import { type ReactNode, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CourseOutlineSidebarProps {
  children: ReactNode;
  open: boolean;
  onClose: () => void;
  className?: string;
}

/** Mobile-only drawer — never used inline on desktop/tablet grid. */
export function CourseOutlineMobileDrawer({ children, open, onClose, className }: CourseOutlineSidebarProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close course outline"
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] animate-in fade-in duration-200"
        onClick={onClose}
      />
      <aside
        data-floating-obstacle="learn-sidebar"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[min(88vw,300px)] border-r border-border bg-background shadow-2xl flex flex-col",
          "animate-in slide-in-from-left duration-200",
          className
        )}
      >
        <div className="flex items-center justify-between p-3 border-b shrink-0">
          <span id={titleId} className="text-sm font-semibold">
            Course outline
          </span>
          <Button
            ref={closeRef}
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={onClose}
            aria-label="Close course outline"
          >
            <X className="w-4 h-4" aria-hidden />
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">{children}</div>
      </aside>
    </>
  );
}
