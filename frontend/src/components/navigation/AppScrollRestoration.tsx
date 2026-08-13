import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import {
  getScrollContainer,
  readScrollY,
  readStoredScroll,
  scrollStorageKey,
  writeScrollY,
  writeStoredScroll,
} from "@/lib/navigation";

/**
 * Restores scroll on browser back/forward; scrolls to top on new page navigation.
 * Preserves scroll when only search params change on the same pathname (replace).
 */
export function AppScrollRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const prevPathRef = useRef<string | null>(null);
  const prevSearchRef = useRef<string>("");

  useEffect(() => {
    const key = scrollStorageKey(location.pathname, location.search);
    const prevPath = prevPathRef.current;
    const prevSearch = prevSearchRef.current;

    if (prevPath !== null) {
      const prevKey = scrollStorageKey(prevPath, prevSearch);
      writeStoredScroll(prevKey, readScrollY(getScrollContainer()));
    }

    const container = getScrollContainer();
    const samePage = prevPath === location.pathname;

    if (navigationType === "POP") {
      requestAnimationFrame(() => writeScrollY(container, readStoredScroll(key)));
    } else if (navigationType === "REPLACE" && samePage) {
      /* in-page URL sync — keep scroll position */
    } else {
      requestAnimationFrame(() => writeScrollY(container, 0));
    }

    prevPathRef.current = location.pathname;
    prevSearchRef.current = location.search;
  }, [location.pathname, location.search, navigationType]);

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  return null;
}
