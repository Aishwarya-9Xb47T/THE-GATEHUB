import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandHomeButton } from "@/components/common/Logo";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

export function VerifyEmailChangePage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("Confirming your new email…");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Missing confirmation token.");
      return;
    }
    api<{ message?: string }>("/auth/email-change/confirm", {
      method: "POST",
      body: { token },
    }).then((res) => {
      if (res.error) {
        setStatus("error");
        setMessage(res.error);
        return;
      }
      setStatus("ok");
      setMessage(res.data?.message || "Email updated. Please sign in again.");
    });
  }, [token]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <BrandHomeButton className="mb-8" size="xl" />
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="font-display">Confirm email change</CardTitle>
          <CardDescription>THE GATEHUB account security</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 text-center">
          {status === "loading" && <Loader2 className="h-10 w-10 animate-spin text-primary" />}
          {status === "ok" && <CheckCircle2 className="h-10 w-10 text-emerald-600" />}
          {status === "error" && <XCircle className="h-10 w-10 text-destructive" />}
          <p className="text-sm text-muted-foreground">{message}</p>
          <Button asChild className="mt-2">
            <Link to="/login">Sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
