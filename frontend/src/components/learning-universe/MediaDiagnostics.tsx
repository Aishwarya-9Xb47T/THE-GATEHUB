interface MediaDiagnosticsProps {
  fileRef: string;
  resolvedUrl: string;
  status: "found" | "missing" | "remote";
  blockType?: string;
}

export function MediaDiagnostics({ fileRef, resolvedUrl, status, blockType = "Media" }: MediaDiagnosticsProps) {
  const statusLabel = status === "found" ? "Found" : status === "remote" ? "Remote URL" : "Missing";

  return (
    <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs space-y-1">
      <p className="font-semibold text-muted-foreground uppercase tracking-wide">{blockType} Block</p>
      <p>
        <span className="text-muted-foreground">File:</span> {fileRef || "(none)"}
      </p>
      {resolvedUrl && (
        <p className="break-all">
          <span className="text-muted-foreground">Resolved URL:</span> {resolvedUrl}
        </p>
      )}
      <p>
        <span className="text-muted-foreground">Status:</span>{" "}
        <span
          className={
            status === "found" || status === "remote"
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          }
        >
          {statusLabel}
        </span>
      </p>
    </div>
  );
}
