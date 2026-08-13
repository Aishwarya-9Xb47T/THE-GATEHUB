import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWishlist } from "@/hooks/useWishlist";

interface WishlistHeartButtonProps {
  courseId?: string;
  learningUniverseId?: string;
  className?: string;
  size?: "sm" | "md";
}

export function WishlistHeartButton({
  courseId,
  learningUniverseId,
  className,
  size = "md",
}: WishlistHeartButtonProps) {
  const { isWishlisted, toggle } = useWishlist();
  const active = isWishlisted({ courseId, learningUniverseId });
  const iconSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  const padding = size === "sm" ? "p-2" : "p-2.5";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void toggle({ courseId, learningUniverseId });
      }}
      className={cn(
        "rounded-full bg-background/80 backdrop-blur shadow-sm hover:bg-background hover:scale-110 transition-all",
        padding,
        className
      )}
      aria-label={active ? "Remove from wishlist" : "Add to wishlist"}
      title={active ? "Remove from wishlist" : "Save to wishlist"}
    >
      <Heart
        className={cn(
          iconSize,
          "transition-colors",
          active ? "fill-red-500 text-red-500" : "text-muted-foreground"
        )}
      />
    </button>
  );
}
