import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle2, XCircle, ShieldAlert, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandHomeButton } from "@/components/common/Logo";
import { apiUrl } from "@/lib/api";

interface VerificationResult {
  valid: boolean;
  status: string;
  certificateId: string;
  studentName: string;
  courseTitle: string;
  instructorName: string;
  completionDate: string;
  issueDate: string;
  verificationStatus: string;
  revokedAt?: string | null;
  revokeReason?: string | null;
  verificationUrl: string;
}

export function VerifyCertificatePage() {
  const { certificateId } = useParams<{ certificateId: string }>();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!certificateId) return;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(apiUrl(`/api/certificates/verify/${encodeURIComponent(certificateId)}`));
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Certificate not found");
        setResult(data);
      } catch (err: any) {
        setError(err instanceof Error ? err.message : "Verification failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [certificateId]);

  const revoked = result?.status === "REVOKED" || result?.verificationStatus === "REVOKED";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-16 space-y-8">
        <div className="text-center space-y-3">
          <BrandHomeButton className="justify-center" />
          <h1 className="text-3xl font-bold tracking-tight">Certificate Verification</h1>
          <p className="text-slate-400">THE GATEHUB — official credential verification</p>
        </div>

        {loading ? (
          <Card className="bg-slate-900/60 border-slate-800">
            <CardContent className="p-12 flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
              <p className="text-slate-400">Verifying certificate…</p>
            </CardContent>
          </Card>
        ) : error ? (
          <Card className="bg-slate-900/60 border-red-900/50">
            <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
              <XCircle className="w-12 h-12 text-red-400" />
              <h2 className="text-xl font-semibold">Certificate Not Found</h2>
              <p className="text-slate-400">{error}</p>
              <Button asChild variant="outline" className="mt-2">
                <Link to="/">Return Home</Link>
              </Button>
            </CardContent>
          </Card>
        ) : result ? (
          <Card className={`bg-slate-900/60 border ${revoked ? "border-red-800/60" : "border-emerald-800/40"}`}>
            <CardContent className="p-8 space-y-6">
              <div className="flex items-center justify-center gap-3">
                {revoked ? (
                  <>
                    <ShieldAlert className="w-8 h-8 text-red-400" />
                    <span className="text-2xl font-bold text-red-400 tracking-widest">REVOKED</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                    <span className="text-2xl font-bold text-emerald-400 tracking-widest">VERIFIED</span>
                  </>
                )}
              </div>

              <dl className="grid gap-4 text-sm">
                {[
                  ["Certificate Status", revoked ? "REVOKED" : "ACTIVE"],
                  ["Verification Status", result.verificationStatus],
                  ["Student Name", result.studentName],
                  ["Course", result.courseTitle],
                  ["Instructor", result.instructorName],
                  ["Certificate ID", result.certificateId],
                  ["Completion Date", new Date(result.completionDate).toLocaleDateString()],
                  ["Issue Date", new Date(result.issueDate).toLocaleDateString()],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 border-b border-slate-800 pb-3">
                    <dt className="text-slate-500 font-medium">{label}</dt>
                    <dd className="text-right font-semibold text-slate-100">{value}</dd>
                  </div>
                ))}
              </dl>

              {revoked && result.revokeReason && (
                <p className="text-sm text-red-300/90 bg-red-950/30 rounded-lg p-3 border border-red-900/40">
                  Reason: {result.revokeReason}
                </p>
              )}

              <div className="flex justify-center pt-2">
                <Button asChild variant="outline" className="border-slate-700">
                  <Link to="/">Return to THE GATEHUB</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

export function VerifyCertificateRoute() {
  return <VerifyCertificatePage />;
}
