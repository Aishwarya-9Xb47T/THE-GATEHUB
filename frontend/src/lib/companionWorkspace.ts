import { isColabEmbeddable } from "@/lib/notebookPreview";
import { isOverleafEmbeddable } from "@/lib/overleafCompanion";

export type CompanionVendor = "colab" | "overleaf";

const PENDING_KEY = "gatehub-pending-companion";

export interface PendingCompanionLaunch {
  vendor: CompanionVendor;
  savedAt: number;
}

export function savePendingCompanionLaunch(vendor: CompanionVendor) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ vendor, savedAt: Date.now() } satisfies PendingCompanionLaunch));
}

export function consumePendingCompanionLaunch(): PendingCompanionLaunch | null {
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(PENDING_KEY);
  try {
    const parsed = JSON.parse(raw) as PendingCompanionLaunch;
    if (Date.now() - parsed.savedAt > 15 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Official Colab/Overleaf block iframe embedding (X-Frame-Options / CSP).
 * Always opens the official site in a new tab — GateHub tab stays open.
 */
export function openOfficialCompanionUrl(url: string, vendor: CompanionVendor): Window | null {
  const embedAllowed = vendor === "colab" ? isColabEmbeddable() : isOverleafEmbeddable();
  if (embedAllowed) {
    // Reserved for future embed panel if vendors ever allow it.
    return null;
  }

  return window.open(url, "_blank", "noopener,noreferrer");
}
