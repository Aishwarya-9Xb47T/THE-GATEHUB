import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toastStore";

interface Review {
  id: string;
  rating: number;
  reviewText?: string | null;
  hidden?: boolean;
  user?: { firstName: string; lastName: string };
  course?: { title: string };
}

export function AdminReviews() {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.add);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "reviews"],
    queryFn: async () => {
      const res = await api<{ reviews: Review[] }>("/admin/reviews");
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
    refetchInterval: 60_000,
  });

  const hideReview = useMutation({
    mutationFn: async (id: string) => {
      const res = await api(`/admin/reviews/${id}/hide`, { method: "PATCH" });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
      toast({ title: "Review hidden", variant: "success" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const unhideReview = useMutation({
    mutationFn: async (id: string) => {
      const res = await api(`/admin/reviews/${id}/unhide`, { method: "PATCH" });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
      toast({ title: "Review visible again", variant: "success" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const reviews = data?.reviews ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Reviews</h1>
        <p className="mt-1 text-muted-foreground">Moderate course reviews (Visible / Hidden)</p>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="p-6 animate-pulse h-48" /> : (
            <div className="divide-y">
              {reviews.map((r) => (
                <div key={r.id} className={`p-4 ${r.hidden ? "opacity-50" : ""}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-medium">{r.course?.title}</span>
                      <p className="text-sm text-muted-foreground mt-1">{r.user ? `${r.user.firstName} ${r.user.lastName}` : "—"}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Status: {r.hidden ? "Hidden" : "Visible"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-amber-600">{r.rating} ★</span>
                      {!r.hidden ? (
                        <Button variant="destructive" size="sm" onClick={() => hideReview.mutate(r.id)}>
                          Hide
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => unhideReview.mutate(r.id)}>
                          Unhide
                        </Button>
                      )}
                    </div>
                  </div>
                  {r.reviewText && <p className="text-sm text-muted-foreground mt-2">{r.reviewText}</p>}
                </div>
              ))}
              {reviews.length === 0 && (
                <p className="p-12 text-center text-muted-foreground">No reviews yet.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
