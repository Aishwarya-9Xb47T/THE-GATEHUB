import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";

interface Category {
  id: string;
  name: string;
  slug: string;
  _count?: { courses: number; learningUniverses: number };
}

export function AdminCategories() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: async () => {
      const res = await api<{ categories: Category[] }>("/admin/categories");
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
  });

  const categories = data?.categories ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Categories</h1>
        <p className="mt-1 text-muted-foreground">Manage course categories</p>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 animate-pulse h-48" />
          ) : isError ? (
            <div className="p-6 space-y-3">
              <p className="text-destructive">{error instanceof Error ? error.message : "Failed to load categories"}</p>
              <button type="button" className="text-sm underline" onClick={() => void refetch()}>
                Retry
              </button>
            </div>
          ) : categories.length === 0 ? (
            <div className="p-6 text-muted-foreground">No categories yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left p-4 font-medium">Name</th>
                    <th className="text-left p-4 font-medium">Slug</th>
                    <th className="text-left p-4 font-medium">Courses</th>
                    <th className="text-left p-4 font-medium">Learning Universes</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-4 font-medium">{c.name}</td>
                      <td className="p-4 text-muted-foreground">{c.slug}</td>
                      <td className="p-4">{c._count?.courses ?? 0}</td>
                      <td className="p-4">{c._count?.learningUniverses ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
