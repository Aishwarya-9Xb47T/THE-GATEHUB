import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWishlist } from "@/hooks/useWishlist";

interface WishlistSaveButtonProps {
  courseId?: string;
  learningUniverseId?: string;
  className?: string;
  fullWidth?: boolean;
}

export function WishlistSaveButton({
  courseId,
  learningUniverseId,
  className,
  fullWidth,
}: WishlistSaveButtonProps) {
  const { isWishlisted, toggle } = useWishlist();
  const active = isWishlisted({ courseId, learningUniverseId });

  return (
    <Button
      type="button"
      variant="outline"
      className={cn(fullWidth && "w-full", className)}
      onClick={() => void toggle({ courseId, learningUniverseId })}
    >
      <Heart
        className={cn(
          "w-4 h-4 mr-2",
          active ? "fill-red-500 text-red-500" : "text-muted-foreground"
        )}
      />
      {active ? "Saved to wishlist" : "Save to wishlist"}
    </Button>
  );
}
