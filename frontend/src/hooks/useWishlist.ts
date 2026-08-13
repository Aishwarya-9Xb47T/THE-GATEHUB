import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useUserStore } from "@/store/userStore";
import { useToastStore } from "@/store/toastStore";

interface WishlistItem {
  id: string;
  courseId?: string | null;
  learningUniverseId?: string | null;
  course?: { id: string } | null;
  learningUniverse?: { id: string } | null;
}

export function useWishlist() {
  const token = useUserStore((s) => s.token);
  const toast = useToastStore((s) => s.add);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["wishlist"],
    queryFn: async () => {
      if (!token) return { items: [] as WishlistItem[] };
      const res = await api<{ items: WishlistItem[] }>("/wishlist");
      if (res.error) return { items: [] as WishlistItem[] };
      return res.data!;
    },
    enabled: !!token,
  });

  const items = data?.items ?? [];

  const isWishlisted = (opts: { courseId?: string; learningUniverseId?: string }) => {
    if (opts.courseId) {
      return items.some((w) => w.course?.id === opts.courseId || w.courseId === opts.courseId);
    }
    if (opts.learningUniverseId) {
      return items.some(
        (w) =>
          w.learningUniverse?.id === opts.learningUniverseId ||
          w.learningUniverseId === opts.learningUniverseId
      );
    }
    return false;
  };

  const toggle = async (opts: { courseId?: string; learningUniverseId?: string }) => {
    if (!token) {
      toast({
        title: "Sign in required",
        description: "Log in to save courses and learning universes to your wishlist.",
        variant: "destructive",
      });
      return;
    }

    const { courseId, learningUniverseId } = opts;
    if (!courseId && !learningUniverseId) return;

    if (courseId) {
      const active = isWishlisted({ courseId });
      const res = await api(`/wishlist/${courseId}`, { method: active ? "DELETE" : "POST" });
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
        return;
      }
      toast({
        title: active ? "Removed from wishlist" : "Added to wishlist",
        variant: "success",
      });
    } else if (learningUniverseId) {
      const active = isWishlisted({ learningUniverseId });
      const res = await api(`/wishlist/learning-universe/${learningUniverseId}`, {
        method: active ? "DELETE" : "POST",
      });
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
        return;
      }
      toast({
        title: active ? "Removed from wishlist" : "Added to wishlist",
        variant: "success",
      });
    }

    await queryClient.invalidateQueries({ queryKey: ["wishlist"] });
  };

  return { items, isLoading, isWishlisted, toggle };
}
