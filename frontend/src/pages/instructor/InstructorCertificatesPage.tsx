import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiUrl, api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Award, Download, Loader2, Ban, RefreshCw, Users } from "lucide-react";
import { useState } from "react";
import { useToastStore } from "@/store/toastStore";

interface IssuedCert {
  id: string;
  certificateId: string;
  status: string;
  issuedAt: string;
  completionDate: string | null;
  user: { id: string; firstName: string; lastName: string; email: string };
  learningUniverse: { id: string; title: string };
}

interface PendingStudent {
  userId: string;
  studentName: string;
  email: string;
  learningUniverseId: string;
  courseTitle: string;
  completionPercent: number;
  pendingRequirements: { label: string }[];
}

export function InstructorCertificatesPage() {
  const toast = useToastStore((s) => s.add);
  const queryClient = useQueryClient();
  const [universeFilter, setUniverseFilter] = useState<string>("all");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["instructor-certificates", universeFilter],
    queryFn: async () => {
      const qs =
        universeFilter !== "all" ? `?learningUniverseId=${encodeURIComponent(universeFilter)}` : "";
      const res = await api<{
        issued: IssuedCert[];
        revoked: IssuedCert[];
        pending: PendingStudent[];
        universes: { id: string; title: string }[];
      }>(`/certificates/instructor/list${qs}`);
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api(`/certificates/instructor/${id}/revoke`, {
        method: "POST",
        body: { reason: "Revoked by instructor" },
      });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["instructor-certificates"] });
      toast({ title: "Certificate revoked", variant: "success" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const reissueMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api(`/certificates/instructor/${id}/reissue`, { method: "POST" });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["instructor-certificates"] });
      toast({ title: "Certificate reissued", variant: "success" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const handleDownload = async (cert: IssuedCert) => {
    setDownloadingId(cert.id);
    try {
      const token = localStorage.getItem("lms_token");
      const response = await fetch(apiUrl(`/api/certificates/lu/${cert.id}/download`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificate-${cert.certificateId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({
        title: "Download failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const issued = data?.issued ?? [];
  const revoked = data?.revoked ?? [];
  const pending = data?.pending ?? [];

  return (
    <div className="w-full min-w-0 space-y-8 pb-16">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Award className="w-8 h-8 text-primary" />
            <h1 className="page-title">Certificates</h1>
          </div>
          <p className="text-muted-foreground">Issued, pending, and revoked student certificates</p>
        </div>
        <Select value={universeFilter} onValueChange={setUniverseFilter}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="All courses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Learning Universes</SelectItem>
            {(data?.universes ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              Issued ({issued.length})
            </h2>
            {issued.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">No certificates issued yet.</CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {issued.map((cert) => (
                  <Card key={cert.id}>
                    <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold">
                          {cert.user.firstName} {cert.user.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground">{cert.learningUniverse.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {cert.certificateId} · Issued {new Date(cert.issuedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleDownload(cert)}
                          disabled={downloadingId === cert.id}
                        >
                          {downloadingId === cert.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          PDF
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => revokeMutation.mutate(cert.id)}
                          disabled={revokeMutation.isPending}
                        >
                          <Ban className="w-4 h-4 mr-1" /> Revoke
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {pending.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" />
                Pending ({pending.length})
              </h2>
              <div className="grid gap-4">
                {pending.map((p) => (
                  <Card key={`${p.userId}-${p.learningUniverseId}`}>
                    <CardContent className="p-4">
                      <p className="font-semibold">{p.studentName}</p>
                      <p className="text-sm text-muted-foreground">{p.courseTitle} — {p.completionPercent}%</p>
                      <ul className="mt-2 text-xs text-amber-700 dark:text-amber-400 space-y-1">
                        {p.pendingRequirements.slice(0, 5).map((r, i) => (
                          <li key={i}>• {r.label}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {revoked.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-red-600">
                <Ban className="w-5 h-5" />
                Revoked ({revoked.length})
              </h2>
              <div className="grid gap-4">
                {revoked.map((cert) => (
                  <Card key={cert.id} className="border-red-200/40">
                    <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold">
                          {cert.user.firstName} {cert.user.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground">{cert.learningUniverse.title}</p>
                        <p className="text-xs text-red-500 mt-1">{cert.certificateId}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => reissueMutation.mutate(cert.id)}
                        disabled={reissueMutation.isPending}
                      >
                        <RefreshCw className="w-4 h-4 mr-1" /> Reissue
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
