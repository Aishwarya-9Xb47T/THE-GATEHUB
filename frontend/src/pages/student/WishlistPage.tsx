import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toastStore";
import { CourseCard } from "@/components/common/CourseCard";
import { CourseCardBanner } from "@/components/common/CourseCardBanner";
import { Loader2, ShoppingCart } from "lucide-react";
import { formatINR } from "@/lib/paymentUtils";

interface WishlistItem {
  id: string;
  course?: {
    id: string;
    title: string;
    subtitle?: string | null;
    thumbnail?: string | null;
    price?: number;
    instructor?: { firstName: string; lastName: string };
    _count?: { enrollments: number };
  } | null;
  learningUniverse?: {
    id: string;
    title: string;
    subtitle?: string | null;
    thumbnail?: string | null;
    price?: number;
    instructor?: { firstName: string; lastName: string };
  } | null;
  product?: { id: string; displayName: string; price: number } | null;
}

export function WishlistPage() {
  const toast = useToastStore((s) => s.add);
  const { data, refetch, isLoading } = useQuery({
    queryKey: ["wishlist"],
    queryFn: async () => {
      const res = await api<{ items: WishlistItem[] }>("/wishlist");
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
  });

  const items = data?.items ?? [];

  const removeCourse = async (courseId: string) => {
    const res = await api(`/wishlist/${courseId}`, { method: "DELETE" });
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else { toast({ title: "Removed from wishlist" }); refetch(); }
  };

  const removeLu = async (luId: string) => {
    const res = await api(`/wishlist/learning-universe/${luId}`, { method: "DELETE" });
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else { toast({ title: "Removed from wishlist" }); refetch(); }
  };

  const moveToCart = async (itemId: string) => {
    const res = await api(`/wishlist/items/${itemId}/cart`, { method: "POST" });
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else { toast({ title: "Added to cart" }); refetch(); }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="catalog-layout space-y-8">
      <div>
        <h1 className="page-title">Wishlist</h1>
        <p className="mt-1 text-muted-foreground">Courses and learning universes you saved for later</p>
      </div>
      {items.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">You haven't saved anything yet.</CardContent></Card>
      ) : (
        <div className="course-cards-grid">
          {items.map((item) => {
            if (item.course) {
              return (
                <CourseCard
                  key={item.id}
                  course={{
                    id: item.course.id,
                    title: item.course.title,
                    subtitle: item.course.subtitle,
                    thumbnail: item.course.thumbnail,
                    price: item.course.price,
                    instructor: item.course.instructor
                      ? `${item.course.instructor.firstName} ${item.course.instructor.lastName}`
                      : undefined,
                  }}
                  actions={
                    <div className="flex flex-col gap-2 w-full lg:w-auto mt-2 lg:mt-0 ml-auto">
                      <Button variant="outline" size="sm" onClick={() => moveToCart(item.id)}>
                        <ShoppingCart className="w-4 h-4 mr-1" /> Move to cart
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => removeCourse(item.course!.id)} className="text-red-400">
                        Remove
                      </Button>
                    </div>
                  }
                />
              );
            }
            if (item.learningUniverse) {
              const lu = item.learningUniverse;
              return (
                <Card key={item.id} className="overflow-hidden">
                  <CardContent className="p-4 space-y-3">
                    <CourseCardBanner
                      bannerUrl={lu.thumbnail}
                      thumbnailUrl={lu.thumbnail}
                      alt={lu.title}
                      className="h-32 rounded"
                      imageClassName="h-full w-full object-cover rounded"
                      overlay={false}
                    />
                    <p className="font-semibold">{lu.title}</p>
                    <p className="text-sm text-muted-foreground">Learning Universe</p>
                    {lu.price != null && <p className="text-primary font-bold">{formatINR(lu.price)}</p>}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => moveToCart(item.id)}>
                        <ShoppingCart className="w-4 h-4 mr-1" /> Cart
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => removeLu(lu.id)}>Remove</Button>
                    </div>
                  </CardContent>
                </Card>
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}
