import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useToastStore } from "@/store/toastStore";

interface AdminAiPanelProps {
  canEdit: boolean;
  settingsProvider?: string;
  settingsModel?: string;
  onPatchSettings: (key: string, value: unknown) => void;
}

export function AdminAiPanel({ canEdit, settingsProvider, settingsModel, onPatchSettings }: AdminAiPanelProps) {
  const toast = useToastStore((s) => s.add);
  const queryClient = useQueryClient();
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>({});

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "ai", "status"],
    queryFn: async () => {
      const res = await api<any>("/admin/ai/health");
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
    refetchInterval: 30_000,
  });

  const status = data;
  const cfg = status;
  const benchmark = status?.benchmark;
  const ollama = status?.ollama;
  const provider = String(settingsProvider ?? status?.provider ?? cfg?.provider ?? "ollama");
  const model = String(settingsModel ?? status?.activeModel ?? status?.configuredModel ?? "");

  const switchProvider = useMutation({
    mutationFn: async (p: string) => {
      const res = await api("/admin/ai/provider", { method: "POST", body: { provider: p } });
      if (res.error) throw new Error(res.error);
      onPatchSettings("aiProvider", p);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "ai"] });
      toast({ title: "AI provider updated", variant: "success" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const switchModel = useMutation({
    mutationFn: async (m: string) => {
      const res = await api("/admin/ai/model", { method: "POST", body: { model: m } });
      if (res.error) throw new Error(res.error);
      onPatchSettings("aiModelName", m);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "ai"] });
      toast({ title: "AI model updated", variant: "success" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const saveConfig = useMutation({
    mutationFn: async () => {
      const res = await api("/admin/ai/config", { method: "PATCH", body: localConfig });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      setLocalConfig({});
      refetch();
      toast({ title: "AI config saved", variant: "success" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const patchLocal = (k: string, v: unknown) => setLocalConfig((c) => ({ ...c, [k]: v }));

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading AI status…</p>;

  return (
    <div className="space-y-6">
      {status?.note && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {status.note}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active Provider</CardTitle></CardHeader><CardContent className="text-lg font-bold capitalize">{status?.activeProvider ?? status?.provider ?? "—"}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active Model</CardTitle></CardHeader><CardContent className="text-lg font-bold truncate">{status?.activeModel || model || "—"}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Success Rate</CardTitle></CardHeader><CardContent className="text-lg font-bold">{benchmark?.successRate ?? 100}%</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Avg Response</CardTitle></CardHeader><CardContent className="text-lg font-bold">{benchmark?.avgResponseMs ?? 0} ms</CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI Provider</CardTitle>
          <CardDescription>
            Health: {status?.apiReachable ? "Reachable" : "Unavailable"} · Auth: {status?.authentication ?? "—"}
            {status?.fallbackUsed ? " · Fallback active" : ""}
            {status?.latencyMs != null ? ` · ${status.latencyMs}ms` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Provider</label>
              <select
                disabled={!canEdit || switchProvider.isPending}
                className="mt-1 w-full h-10 rounded-md border px-3 bg-background"
                value={provider}
                onChange={(e) => switchProvider.mutate(e.target.value)}
              >
                <option value="ollama">Ollama (Local)</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Google Gemini</option>
                <option value="claude">Anthropic Claude</option>
                <option value="azure_openai">Azure OpenAI</option>
                <option value="mock">Mock (Offline)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Model</label>
              <div className="mt-1 flex gap-2">
                <Input
                  disabled={!canEdit}
                  value={model}
                  onChange={(e) => onPatchSettings("aiModelName", e.target.value)}
                  placeholder="llama3.1"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canEdit || !model.trim()}
                  onClick={() => switchModel.mutate(model.trim())}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>

          {provider === "ollama" && ollama?.models?.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Detected Ollama models</p>
              <div className="flex flex-wrap gap-2">
                {ollama.models.map((m: string) => (
                  <button
                    key={m}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => {
                      onPatchSettings("aiModelName", m);
                      switchModel.mutate(m);
                    }}
                    className="rounded-full border px-3 py-1 text-xs hover:border-primary"
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Generation parameters</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Temperature" type="number" value={(localConfig.temperature as number) ?? 0.7} disabled={!canEdit} onChange={(v) => patchLocal("temperature", Number(v))} />
          <Field label="Top P" type="number" value={(localConfig.topP as number) ?? 0.9} disabled={!canEdit} onChange={(v) => patchLocal("topP", Number(v))} />
          <Field label="Top K" type="number" value={(localConfig.topK as number) ?? 40} disabled={!canEdit} onChange={(v) => patchLocal("topK", Number(v))} />
          <Field label="Max tokens" type="number" value={(localConfig.maxTokens as number) ?? 4096} disabled={!canEdit} onChange={(v) => patchLocal("maxTokens", Number(v))} />
          <Field label="Timeout (ms)" type="number" value={(localConfig.timeoutMs as number) ?? 120000} disabled={!canEdit} onChange={(v) => patchLocal("timeoutMs", Number(v))} />
          <Field label="Ollama host" value={String(localConfig.ollamaHost ?? "http://localhost:11434")} disabled={!canEdit} onChange={(v) => patchLocal("ollamaHost", v)} />
          <div className="sm:col-span-2 text-xs text-muted-foreground space-y-1">
            <p>Configured: {status?.configuredModel ?? "—"}</p>
            <p>Fallback: {status?.fallbackModel ?? "gpt-4o-mini"}</p>
            {status?.lastError && <p className="text-amber-600">Last error: {status.lastError}</p>}
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={Boolean(localConfig.streamingEnabled ?? status?.streamingEnabled ?? true)}
              onChange={(e) => patchLocal("streamingEnabled", e.target.checked)}
            />
            Streaming enabled
          </label>
          {canEdit && (
            <Button type="button" onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending || !Object.keys(localConfig).length}>
              Save parameters
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Benchmark</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p>Requests: {benchmark?.requests ?? 0}</p>
          <p>Token estimate: {benchmark?.tokenEstimate ?? 0}</p>
          <p>Streaming: {benchmark?.streamingEnabled ? "On" : "Off"}</p>
          <p>RAM (heap): {benchmark?.ramUsageMb ?? 0} MB</p>
          <p>GPU: {benchmark?.gpuStatus ?? "n/a"}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, disabled, type = "text" }: { label: string; value: string | number | undefined; onChange: (v: string) => void; disabled?: boolean; type?: string }) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <Input className="mt-1" type={type} step={type === "number" ? "any" : undefined} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
