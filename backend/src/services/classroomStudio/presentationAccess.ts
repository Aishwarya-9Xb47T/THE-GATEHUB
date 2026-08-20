export function presentationOwnershipAllowed(args: {
  presentationOwnerId: string;
  requesterId?: string;
}): { allowed: boolean; reason: "ok" | "missing_presentation_owner" | "owner_mismatch" } {
  if (!args.presentationOwnerId) return { allowed: false, reason: "missing_presentation_owner" };
  if (!args.requesterId) return { allowed: true, reason: "ok" };
  if (args.presentationOwnerId !== args.requesterId) return { allowed: false, reason: "owner_mismatch" };
  return { allowed: true, reason: "ok" };
}

export function failedImportStatus(args: { sourceStored: boolean; code?: string }): string {
  if (!args.sourceStored || args.code?.startsWith("CLASSROOM_B2_")) return "import_failed";
  if (args.code === "CLASSROOM_RENDER_FAILED") return "render_failed";
  return "extraction_failed";
}

/** Cross-instance render lock: do not start a second LibreOffice job while status is fresh. */
export const CLASSROOM_RENDER_STALE_MS = 8 * 60 * 1000;
export const CLASSROOM_RENDER_JOB_TIMEOUT_MS = 8 * 60 * 1000;

export function reconcileInFlightRender(args: {
  status: string;
  rendered: number;
  total: number;
  exclusiveRunning: boolean;
  updatedAtMs: number;
  nowMs?: number;
  staleMs?: number;
  inflight?: number;
}): "ready" | "keep_rendering" | "mark_failed" {
  if (args.rendered === args.total && args.total > 0) return "ready";
  if (args.exclusiveRunning) return "keep_rendering";
  if ((args.inflight ?? 0) > 0) return "keep_rendering";
  if (args.status !== "rendering" && args.status !== "rendering_partial") return "keep_rendering";
  const now = args.nowMs ?? Date.now();
  const staleMs = args.staleMs ?? CLASSROOM_RENDER_STALE_MS;
  if (now - args.updatedAtMs < staleMs) return "keep_rendering";
  return "mark_failed";
}
