import { useCallback, useEffect, useState } from "react";
import { Activity, CheckCircle2, Loader2, RefreshCw, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBannerHealth, type BannerProviderHealthEntry } from "@/lib/courseBranding/bannerApi";
import { cn } from "@/lib/utils";

function StatusBadge({ entry }: { entry: BannerProviderHealthEntry }) {
  const Icon =
    entry.status === "connected" ? CheckCircle2 : entry.status === "failed" ? XCircle : AlertCircle;
  const color =
    entry.status === "connected"
      ? "text-green-600"
      : entry.status === "failed"
        ? "text-destructive"
        : "text-amber-600";

  return (
    <div className="flex items-start gap-2">
      <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", color)} />
      <div>
        <p className={cn("font-semibold capitalize", color)}>
          {entry.status === "connected" ? "Connected" : entry.status === "failed" ? "Failed" : "Not configured"}
        </p>
        {entry.message && <p className="text-xs text-muted-foreground mt-0.5">{entry.message}</p>}
      </div>
    </div>
  );
}

export function BannerStudioHealth() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Awaited<ReturnType<typeof getBannerHealth>>["data"] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getBannerHealth();
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setHealth(res.data ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const data = health?.data;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Banner Studio Health
            </CardTitle>
            <CardDescription>Live connectivity for AI generation and image search providers</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
        )}

        {loading && !data && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Testing providers…
          </div>
        )}

        {data && (
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">OPENAI_API_KEY</p>
              <StatusBadge entry={data.openai} />
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">UNSPLASH_API_KEY</p>
              <StatusBadge entry={data.unsplash} />
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">PEXELS_API_KEY</p>
              <StatusBadge entry={data.pexels} />
            </div>
          </div>
        )}

        {data?.env && (
          <p className="text-[11px] text-muted-foreground">
            Server keys: OpenAI {data.env.openaiKey} · Unsplash {data.env.unsplashKey} · Pexels {data.env.pexelsKey}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          If OpenAI fails, Banner Studio automatically falls back to Unsplash → Pexels → curated templates so generation never stops.
        </p>
      </CardContent>
    </Card>
  );
}
