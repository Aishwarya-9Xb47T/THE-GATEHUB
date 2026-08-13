import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";

interface AuditLog {
  id: string;
  action: string;
  targetId?: string;
  targetType?: string;
  ipAddress?: string;
  createdAt: string;
  admin: { email: string; firstName: string; lastName: string; role: string };
}

export function AdminAuditLogs() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "audit-logs"],
    queryFn: async () => {
      const res = await api<{ logs: AuditLog[]; total: number }>("/admin/audit-logs");
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
  });

  const logs = data?.logs ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Audit Logs</h1>
        <p className="mt-1 text-muted-foreground">Super admin — platform security and admin activity trail</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="p-6 animate-pulse h-48" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left p-4">Timestamp</th>
                    <th className="text-left p-4">Admin</th>
                    <th className="text-left p-4">Action</th>
                    <th className="text-left p-4">Target</th>
                    <th className="text-left p-4">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-4">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="p-4">{log.admin.firstName} {log.admin.lastName}<br /><span className="text-muted-foreground text-xs">{log.admin.email}</span></td>
                      <td className="p-4 font-mono text-xs">{log.action}</td>
                      <td className="p-4 text-muted-foreground">{log.targetType || "—"} {log.targetId ? `(${log.targetId.slice(0, 8)}…)` : ""}</td>
                      <td className="p-4 font-mono text-xs">{log.ipAddress || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {logs.length === 0 && <p className="p-8 text-center text-muted-foreground">No audit logs yet.</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
