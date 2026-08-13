import { useCallback, useEffect, useState } from "react";
import {
  History,
  GitCompare,
  RotateCcw,
  Loader2,
  ChevronRight,
  Clock,
  User,
  FileText,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useToastStore } from "@/store/toastStore";

type VersionSummary = {
  id: string;
  versionNumber: number;
  label: string;
  publishType: string;
  notes: string | null;
  createdAt: string;
  isSafetySnapshot: boolean;
  author: { id: string; name: string; email: string } | null;
  learningUniverse: { id: string; title: string } | null;
  resourceCourse: { id: string; title: string } | null;
  fileCount: number;
  assetCount: number;
};

type VersionDetail = VersionSummary & {
  dslSnapshot: string;
  fileInventory: { path: string; name: string; isFolder: boolean; content?: string; s3Url?: string }[];
  assetInventory: { path: string; name: string; storedFilename: string }[];
  projectMetadata: { title?: string; fileCount?: number; assetCount?: number };
  project: { id: string; title: string; createdAt: string; updatedAt: string };
};

type TimelineEvent = {
  id: string;
  eventType: string;
  createdAt: string;
  actor: { firstName: string; lastName: string } | null;
  metadata?: Record<string, unknown>;
};

type CompareResult = {
  versionA: { id: string; versionNumber: number; createdAt: string };
  versionB: { id: string; versionNumber: number; createdAt: string };
  addedFiles: string[];
  removedFiles: string[];
  changedFiles: string[];
  dslDiff: { line: number; type: "added" | "removed"; content: string }[];
};

interface VersionHistoryPanelProps {
  projectId: string;
  onRestored?: () => void;
  onClose?: () => void;
}

const PUBLISH_TYPE_LABELS: Record<string, string> = {
  publish: "Published",
  republish: "Republished",
  manual: "Manual snapshot",
  "pre-restore": "Safety snapshot",
  "auto-save": "Auto-save",
  compile: "Compile",
  "resource-publish": "Resource publish",
};

export function VersionHistoryPanel({ projectId, onRestored, onClose }: VersionHistoryPanelProps) {
  const addToast = useToastStore((s) => s.add);
  const [tab, setTab] = useState<"versions" | "timeline" | "compare">("versions");
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<VersionDetail | null>(null);
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [snapshotNotes, setSnapshotNotes] = useState("");
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    const res = await api<{ success: boolean; data: VersionSummary[] }>(
      `/latex-projects/${projectId}/versions`
    );
    if (res.data?.data) setVersions(res.data.data);
    setLoading(false);
  }, [projectId]);

  const fetchTimeline = useCallback(async () => {
    const res = await api<{ success: boolean; data: TimelineEvent[] }>(
      `/latex-projects/${projectId}/timeline`
    );
    if (res.data?.data) setTimeline(res.data.data);
  }, [projectId]);

  useEffect(() => {
    fetchVersions();
    fetchTimeline();
  }, [fetchVersions, fetchTimeline]);

  const openVersion = async (versionId: string) => {
    const res = await api<{ success: boolean; data: VersionDetail }>(
      `/latex-projects/${projectId}/versions/${versionId}`
    );
    if (res.data?.data) setSelectedVersion(res.data.data);
  };

  const runCompare = async () => {
    if (!compareA || !compareB) {
      addToast({ title: "Select two versions", variant: "destructive" });
      return;
    }
    setComparing(true);
    const res = await api<{ success: boolean; data: CompareResult }>(
      `/latex-projects/${projectId}/versions/compare?a=${compareA}&b=${compareB}`
    );
    if (res.data?.data) setCompareResult(res.data.data);
    setComparing(false);
  };

  const handleRestore = async (versionId: string, versionNumber: number) => {
    if (!confirm(`Restore to version ${versionNumber}? A safety snapshot will be created first.`)) return;
    setRestoring(true);
    const res = await api<{ success: boolean; data: { message: string } }>(
      `/latex-projects/${projectId}/versions/${versionId}/restore`,
      { method: "POST" }
    );
    setRestoring(false);
    if (res.error) {
      addToast({ title: "Restore failed", description: res.error, variant: "destructive" });
      return;
    }
    addToast({ title: "Version restored", description: res.data?.data?.message, variant: "success" });
    setSelectedVersion(null);
    fetchVersions();
    fetchTimeline();
    onRestored?.();
  };

  const createSnapshot = async () => {
    setCreatingSnapshot(true);
    const res = await api(`/latex-projects/${projectId}/versions`, {
      method: "POST",
      body: { notes: snapshotNotes || undefined },
    });
    setCreatingSnapshot(false);
    if (res.error) {
      addToast({ title: "Snapshot failed", description: res.error, variant: "destructive" });
      return;
    }
    addToast({ title: "Snapshot created", variant: "success" });
    setSnapshotNotes("");
    fetchVersions();
    fetchTimeline();
  };

  const formatDate = (d: string) => new Date(d).toLocaleString();

  return (
    <div className="h-full flex flex-col bg-[#181818] text-slate-200">
      <div className="h-10 border-b border-slate-800 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <History className="w-4 h-4 text-primary" />
          Version History
        </div>
        {onClose && (
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="flex border-b border-slate-800 text-xs">
        {(["versions", "timeline", "compare"] as const).map((t) => (
          <button
            key={t}
            className={`flex-1 py-2 capitalize ${tab === t ? "border-b-2 border-primary text-white" : "text-slate-500"}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {tab === "versions" && (
          <>
            <div className="space-y-2 pb-2 border-b border-slate-800">
              <Textarea
                placeholder="Optional snapshot notes..."
                value={snapshotNotes}
                onChange={(e) => setSnapshotNotes(e.target.value)}
                className="text-xs min-h-[60px] bg-[#252526] border-slate-700"
              />
              <Button
                size="sm"
                className="w-full h-8"
                onClick={createSnapshot}
                disabled={creatingSnapshot}
              >
                {creatingSnapshot ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Create Snapshot
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : versions.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No versions yet. Publish or create a snapshot.</p>
            ) : (
              versions.map((v) => (
                <button
                  key={v.id}
                  className="w-full text-left p-3 rounded-lg border border-slate-800 hover:border-slate-600 bg-[#1e1e1e] transition-colors"
                  onClick={() => openVersion(v.id)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-sm font-bold text-primary">v{v.versionNumber}</span>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </div>
                  <div className="flex flex-wrap gap-1 mb-1">
                    <Badge variant="outline" className="text-[10px] h-5">
                      {PUBLISH_TYPE_LABELS[v.publishType] || v.publishType}
                    </Badge>
                    {v.isSafetySnapshot && (
                      <Badge variant="outline" className="text-[10px] h-5 border-amber-600 text-amber-400">
                        Safety
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {formatDate(v.createdAt)}
                  </p>
                  {v.author && (
                    <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <User className="w-3 h-3" /> {v.author.name}
                    </p>
                  )}
                  {v.learningUniverse && (
                    <p className="text-[10px] text-emerald-500 mt-1">LU: {v.learningUniverse.title}</p>
                  )}
                  {v.resourceCourse && (
                    <p className="text-[10px] text-blue-400 mt-1">Resource: {v.resourceCourse.title}</p>
                  )}
                  {v.notes && <p className="text-[10px] text-slate-400 mt-1 italic">{v.notes}</p>}
                </button>
              ))
            )}
          </>
        )}

        {tab === "timeline" && (
          <div className="space-y-2">
            {timeline.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No timeline events yet.</p>
            ) : (
              timeline.map((e) => (
                <div key={e.id} className="flex gap-2 p-2 rounded border border-slate-800 text-xs">
                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div>
                    <p className="font-semibold capitalize">{e.eventType.replace(/_/g, " ")}</p>
                    <p className="text-slate-500">{formatDate(e.createdAt)}</p>
                    {e.actor && (
                      <p className="text-slate-500">
                        {e.actor.firstName} {e.actor.lastName}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "compare" && (
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs text-slate-400">Version A (older)</label>
              <select
                className="w-full bg-[#252526] border border-slate-700 rounded px-2 py-1.5 text-xs"
                value={compareA}
                onChange={(e) => setCompareA(e.target.value)}
              >
                <option value="">Select...</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNumber} — {formatDate(v.createdAt)}
                  </option>
                ))}
              </select>
              <label className="text-xs text-slate-400">Version B (newer)</label>
              <select
                className="w-full bg-[#252526] border border-slate-700 rounded px-2 py-1.5 text-xs"
                value={compareB}
                onChange={(e) => setCompareB(e.target.value)}
              >
                <option value="">Select...</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNumber} — {formatDate(v.createdAt)}
                  </option>
                ))}
              </select>
              <Button size="sm" className="w-full gap-2" onClick={runCompare} disabled={comparing}>
                {comparing ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitCompare className="w-3 h-3" />}
                Compare
              </Button>
            </div>

            {compareResult && (
              <div className="space-y-3 text-xs">
                <p className="text-slate-400">
                  v{compareResult.versionA.versionNumber} vs v{compareResult.versionB.versionNumber}
                </p>
                {compareResult.addedFiles.length > 0 && (
                  <div>
                    <p className="text-emerald-400 font-semibold mb-1">Added files</p>
                    {compareResult.addedFiles.map((f) => (
                      <p key={f} className="text-emerald-300 font-mono">
                        + {f}
                      </p>
                    ))}
                  </div>
                )}
                {compareResult.removedFiles.length > 0 && (
                  <div>
                    <p className="text-red-400 font-semibold mb-1">Removed files</p>
                    {compareResult.removedFiles.map((f) => (
                      <p key={f} className="text-red-300 font-mono">
                        - {f}
                      </p>
                    ))}
                  </div>
                )}
                {compareResult.changedFiles.length > 0 && (
                  <div>
                    <p className="text-amber-400 font-semibold mb-1">Changed files</p>
                    {compareResult.changedFiles.map((f) => (
                      <p key={f} className="text-amber-300 font-mono">
                        ~ {f}
                      </p>
                    ))}
                  </div>
                )}
                {compareResult.dslDiff.length > 0 && (
                  <div>
                    <p className="text-blue-400 font-semibold mb-1">DSL differences</p>
                    <div className="bg-[#0d0d0d] rounded p-2 font-mono max-h-48 overflow-y-auto">
                      {compareResult.dslDiff.map((d, i) => (
                        <div
                          key={i}
                          className={d.type === "added" ? "text-emerald-400" : "text-red-400"}
                        >
                          {d.type === "added" ? "+" : "-"} L{d.line}: {d.content}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {compareResult.addedFiles.length === 0 &&
                  compareResult.removedFiles.length === 0 &&
                  compareResult.changedFiles.length === 0 &&
                  compareResult.dslDiff.length === 0 && (
                    <p className="text-slate-500">No differences found.</p>
                  )}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedVersion && (
        <div className="absolute inset-0 bg-[#181818] z-10 flex flex-col">
          <div className="h-10 border-b border-slate-800 flex items-center justify-between px-3">
            <span className="text-sm font-bold">v{selectedVersion.versionNumber} Details</span>
            <Button size="sm" variant="ghost" onClick={() => setSelectedVersion(null)}>
              Back
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
            <div>
              <p className="text-slate-400 mb-1">Metadata</p>
              <p>Project: {selectedVersion.project?.title}</p>
              <p>Type: {PUBLISH_TYPE_LABELS[selectedVersion.publishType] || selectedVersion.publishType}</p>
              <p>Files: {selectedVersion.fileInventory?.length ?? 0}</p>
              <p>Assets: {selectedVersion.assetInventory?.length ?? 0}</p>
            </div>

            <div>
              <p className="text-slate-400 mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3" /> File inventory
              </p>
              <div className="bg-[#0d0d0d] rounded p-2 font-mono max-h-24 overflow-y-auto">
                {(selectedVersion.fileInventory || []).map((f) => (
                  <p key={f.path} className="text-slate-400">
                    {f.isFolder ? "📁" : "📄"} {f.path}
                  </p>
                ))}
              </div>
            </div>

            <div>
              <p className="text-slate-400 mb-1">DSL Source</p>
              <pre className="bg-[#0d0d0d] rounded p-2 font-mono max-h-40 overflow-y-auto text-[10px] whitespace-pre-wrap">
                {selectedVersion.dslSnapshot?.slice(0, 3000)}
                {(selectedVersion.dslSnapshot?.length ?? 0) > 3000 ? "\n…" : ""}
              </pre>
            </div>

            <Button
              size="sm"
              className="w-full gap-2"
              variant="destructive"
              disabled={restoring}
              onClick={() => handleRestore(selectedVersion.id, selectedVersion.versionNumber)}
            >
              {restoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              Restore this version
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
