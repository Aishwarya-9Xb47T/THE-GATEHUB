import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Trophy,
  Download,
  Calendar,
  GraduationCap,
  Award,
  Loader2,
  ExternalLink,
  Copy,
  Share2,
} from "lucide-react";
import { useState } from "react";
import { useToastStore } from "@/store/toastStore";
import { Link } from "react-router-dom";

interface CertificateItem {
  type: "course" | "learning_universe";
  id: string;
  contentId: string;
  title: string;
  thumbnail?: string | null;
  studentName?: string;
  instructorName?: string;
  issuedAt: string;
  completionDate?: string | null;
  certificateId?: string;
  status: string;
  downloadUrl: string;
  verifyId: string;
  verificationUrl: string;
}

export function CertificatesPage() {
  const toast = useToastStore((s) => s.add);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-certificates"],
    queryFn: async () => {
      const res = await api<{ success: boolean; certificates: CertificateItem[] }>("/certificates/my");
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
  });

  const certificates = data?.certificates ?? [];

  const handleDownload = async (cert: CertificateItem) => {
    setDownloadingId(cert.id);
    try {
      const token = localStorage.getItem("lms_token");
      if (!token) throw new Error("Authentication required");

      const response = await fetch(cert.downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Download failed (${response.status})`);
      }

      const blob = await response.blob();
      if (blob.size === 0) throw new Error("Downloaded file is empty");

      const urlBlob = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlBlob;
      a.download = `GATEHUB_Certificate_${cert.certificateId ?? cert.title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(urlBlob);
      }, 100);

      toast({ title: "Certificate downloaded successfully!", variant: "success" });
    } catch (err: any) {
      toast({
        title: "Download failed",
        description: err instanceof Error ? err.message : "Please try again later",
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const copyVerifyLink = async (cert: CertificateItem) => {
    const url = cert.verificationUrl.startsWith("http")
      ? cert.verificationUrl
      : `${window.location.origin}/verify/certificate/${cert.verifyId}`;
    await navigator.clipboard.writeText(url);
    const token = localStorage.getItem("lms_token");
    if (token && cert.certificateId) {
      await api(`/certificates/${cert.certificateId}/share`, { method: "POST" });
    }
    toast({ title: "Verification link copied", variant: "success" });
  };

  const handlePrint = async (cert: CertificateItem) => {
    await handleDownload(cert);
    toast({ title: "Open the downloaded PDF to print", variant: "default" });
  };

  return (
    <div className="w-full min-w-0 space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Award className="w-7 h-7 text-primary" />
            </div>
            <h1 className="page-title tracking-tight">Certificates</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">
            Your earned achievements and professional credentials
          </p>
        </div>

        {certificates.length > 0 && (
          <div className="bg-card/50 backdrop-blur-sm border border-border/50 px-6 py-3 rounded-2xl flex items-center gap-4 shadow-sm">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60">
                Total Earned
              </span>
              <span className="text-xl font-bold text-foreground">{certificates.length}</span>
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse h-64 bg-card/30" />
          ))}
        </div>
      ) : certificates.length === 0 ? (
        <Card className="border-dashed border-2 bg-transparent">
          <CardContent className="p-24 text-center flex flex-col items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center">
              <GraduationCap className="w-10 h-10 text-muted-foreground/40" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-foreground">No certificates yet</h3>
              <p className="text-muted-foreground max-w-sm mx-auto">
                Complete every required lesson, quiz, lab, and assignment to earn your official certificate.
              </p>
            </div>
            <Button variant="outline" className="mt-4 rounded-xl px-8 h-12 font-semibold" asChild>
              <Link to="/student/my-courses">My Courses</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {certificates.map((cert) => (
            <Card
              key={`${cert.type}-${cert.id}`}
              className="group overflow-hidden border-border/40 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 flex flex-col backdrop-blur-sm bg-card/80"
            >
              <div className="aspect-[16/10] relative overflow-hidden flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
                <img
                  src={
                    cert.thumbnail ||
                    "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=60"
                  }
                  className="max-h-full max-w-full object-contain transition-transform duration-700 group-hover:scale-110 opacity-90 group-hover:opacity-100"
                  alt={cert.title}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="flex items-center gap-2 text-white/90 text-xs font-bold uppercase tracking-widest mb-1">
                    <Calendar className="w-3 h-3" />
                    Issued {new Date(cert.issuedAt).toLocaleDateString(undefined, { year: "numeric", month: "short" })}
                  </div>
                  <h3 className="text-white font-bold text-lg leading-tight line-clamp-2">{cert.title}</h3>
                </div>
                <div className="absolute top-4 right-4 w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-white shadow-lg border border-white/20">
                  <Trophy className="w-6 h-6" />
                </div>
              </div>
              <CardContent className="p-5 flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  {cert.studentName && (
                    <p className="text-sm text-foreground">
                      <span className="text-muted-foreground">Student · </span>
                      {cert.studentName}
                    </p>
                  )}
                  {cert.instructorName && (
                    <p className="text-sm text-foreground">
                      <span className="text-muted-foreground">Instructor · </span>
                      {cert.instructorName}
                    </p>
                  )}
                  {(cert.completionDate || cert.issuedAt) && (
                    <p className="text-sm text-foreground flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      Completed{" "}
                      {new Date(cert.completionDate || cert.issuedAt).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  )}
                  {cert.certificateId && (
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Certificate · {cert.certificateId}
                    </p>
                  )}
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Completed · Certificate Issued
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    className="w-full h-11 rounded-xl font-bold gap-2"
                    onClick={() => void handleDownload(cert)}
                    disabled={downloadingId === cert.id}
                  >
                    {downloadingId === cert.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    {downloadingId === cert.id ? "Preparing…" : "Download Certificate PDF"}
                  </Button>
                  <div className="grid grid-cols-3 gap-2">
                    <Button variant="outline" size="sm" onClick={() => void copyVerifyLink(cert)}>
                      <Copy className="w-3 h-3" />
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={
                          cert.verificationUrl.startsWith("http")
                            ? cert.verificationUrl
                            : `/verify/certificate/${cert.verifyId}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void handlePrint(cert)}>
                      <Share2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
