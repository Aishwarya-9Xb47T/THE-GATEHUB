import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/paymentUtils";

export function AdminReports() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "reports"],
    queryFn: async () => {
      const res = await api<{ report: Record<string, unknown> }>("/admin/reports");
      if (res.error) throw new Error(res.error);
      return res.data!.report;
    },
    refetchInterval: 60_000,
  });

  if (isLoading) return <div className="p-8 animate-pulse text-muted-foreground">Loading reports...</div>;
  if (isError) return <div className="p-8 text-destructive">{(error as Error).message}</div>;

  const items = [
    { label: "Total Users", value: data?.users },
    { label: "Total Courses", value: data?.courses },
    { label: "Learning Universes", value: data?.learningUniverses },
    { label: "Completed Payments", value: data?.completedPayments },
    { label: "Total Revenue", value: formatINR(Number(data?.totalRevenue ?? 0)) },
    { label: "Platform Revenue", value: formatINR(Number(data?.platformRevenue ?? 0)) },
    { label: "Instructor Revenue", value: formatINR(Number(data?.instructorRevenue ?? 0)) },
    { label: "Reviews", value: data?.reviews },
    { label: "Hidden Reviews", value: data?.hiddenReviews },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Reports</h1>
        <p className="mt-1 text-muted-foreground">
          Platform summary report — generated {data?.generatedAt ? new Date(String(data.generatedAt)).toLocaleString() : "now"}
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{item.label}</CardTitle></CardHeader>
            <CardContent className="text-2xl font-bold">{String(item.value)}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
