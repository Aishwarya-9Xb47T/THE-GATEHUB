import { useEffect, useState } from "react";

const SCROLL_CONTAINER = ".help-center-scroll";

export function useDocsReadingProgress(enabled = true): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setProgress(0);
      return;
    }

    const el = document.querySelector(SCROLL_CONTAINER);
    if (!el) return;

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const max = scrollHeight - clientHeight;
      setProgress(max > 0 ? Math.min(100, Math.max(0, (scrollTop / max) * 100)) : 0);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [enabled]);

  return progress;
}
