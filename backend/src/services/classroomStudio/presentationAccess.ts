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
