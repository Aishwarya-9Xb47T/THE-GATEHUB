import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Pixels per second — lower = calmer, more premium */
const DEFAULT_SPEED_PX_PER_SEC = 28;
const MAX_TILE_REPEATS = 40;

interface InfiniteMarqueeRowProps<T> {
  items: readonly T[];
  renderItem: (item: T, index: number) => ReactNode;
  direction?: "left" | "right";
  speed?: number;
  className?: string;
}

function tileItems<T>(items: readonly T[], repeats: number): T[] {
  if (items.length === 0) return [];
  const out: T[] = [];
  for (let r = 0; r < repeats; r += 1) out.push(...items);
  return out;
}

function MarqueeGroup<T>({
  items,
  renderItem,
  idPrefix,
}: {
  items: readonly T[];
  renderItem: (item: T, index: number) => ReactNode;
  idPrefix: string;
}) {
  return (
    <>
      {items.map((item, index) => (
        <div key={`${idPrefix}-${index}`} className="infinite-marquee__item">
          {renderItem(item, index)}
        </div>
      ))}
    </>
  );
}

/**
 * Seamless infinite marquee.
 * Tiles items until one cycle is wider than the viewport (no empty bands),
 * then duplicates that cycle for a pixel-perfect loop.
 */
export function InfiniteMarqueeRow<T>({
  items,
  renderItem,
  direction = "left",
  speed = DEFAULT_SPEED_PX_PER_SEC,
  className,
}: InfiniteMarqueeRowProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  const [tileRepeats, setTileRepeats] = useState(() =>
    Math.max(3, Math.ceil(typeof window !== "undefined" ? window.innerWidth / 320 : 4))
  );
  const cycleItems = useMemo(() => tileItems(items, tileRepeats), [items, tileRepeats]);

  useEffect(() => {
    setTileRepeats(Math.max(3, Math.ceil(window.innerWidth / 320)));
  }, [items]);

  useLayoutEffect(() => {
    if (reducedMotion || items.length === 0) return;

    const container = containerRef.current;
    const group = groupRef.current;
    const track = trackRef.current;
    if (!container || !group || !track) return;

    const viewportWidth = container.clientWidth;
    const cycleWidth = group.scrollWidth;

    if (cycleWidth < viewportWidth + 8 && tileRepeats < MAX_TILE_REPEATS) {
      setTileRepeats((n) => n + 1);
      return;
    }

    if (cycleWidth <= 0) return;

    track.style.setProperty("--loop-distance", `${cycleWidth}px`);
    track.style.setProperty("--marquee-duration", `${cycleWidth / speed}s`);
  }, [cycleItems, tileRepeats, items.length, speed, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;

    const container = containerRef.current;
    const group = groupRef.current;
    const track = trackRef.current;
    if (!container || !group || !track) return;

    const apply = () => {
      const cycleWidth = group.scrollWidth;
      if (cycleWidth <= 0) return;
      track.style.setProperty("--loop-distance", `${cycleWidth}px`);
      track.style.setProperty("--marquee-duration", `${cycleWidth / speed}s`);
    };

    const ro = new ResizeObserver(apply);
    ro.observe(container);
    ro.observe(group);
    window.addEventListener("resize", apply);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [cycleItems, speed, reducedMotion]);

  if (reducedMotion) {
    return (
      <div className={cn("infinite-marquee infinite-marquee--static", className)}>
        <div className="infinite-marquee__static-grid">
          {items.map((item, index) => (
            <div key={index}>{renderItem(item, index)}</div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("infinite-marquee", className)}>
      <div
        ref={trackRef}
        className={cn(
          "infinite-marquee__track",
          direction === "right" && "infinite-marquee__track--reverse"
        )}
        style={
          {
            "--marquee-duration": "120s",
            "--loop-distance": "100vw",
          } as CSSProperties
        }
      >
        <div ref={groupRef} className="infinite-marquee__group">
          <MarqueeGroup items={cycleItems} renderItem={renderItem} idPrefix="a" />
        </div>
        <div className="infinite-marquee__group" aria-hidden="true">
          <MarqueeGroup items={cycleItems} renderItem={renderItem} idPrefix="b" />
        </div>
      </div>
    </div>
  );
}
