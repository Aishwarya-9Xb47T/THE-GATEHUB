/**
 * V6 Part 4 — Human review mode (approve/reject/lock per component).
 */
export type ReviewStatus = "pending" | "approved" | "rejected" | "locked";

export interface ComponentReviewState {
  component: string;
  lessonId: string;
  status: ReviewStatus;
  reviewerNote?: string;
  reviewedAt?: string;
  locked: boolean;
}

export interface HumanReviewManifest {
  components: ComponentReviewState[];
  allApproved: boolean;
  pendingCount: number;
}

export function buildReviewManifest(
  lessonId: string,
  components: string[]
): HumanReviewManifest {
  const states: ComponentReviewState[] = components.map((c) => ({
    component: c,
    lessonId,
    status: "pending",
    locked: false,
  }));
  return {
    components: states,
    allApproved: false,
    pendingCount: states.length,
  };
}

export function updateReviewState(
  manifest: HumanReviewManifest,
  component: string,
  status: ReviewStatus,
  note?: string
): HumanReviewManifest {
  const components = manifest.components.map((c) =>
    c.component === component
      ? { ...c, status, reviewerNote: note, reviewedAt: new Date().toISOString(), locked: status === "locked" }
      : c
  );
  const pendingCount = components.filter((c) => c.status === "pending").length;
  return { components, allApproved: pendingCount === 0 && components.every((c) => c.status === "approved" || c.status === "locked"), pendingCount };
}

export const REVIEWABLE_COMPONENTS = [
  "theory", "quiz", "lab", "assignment", "diagram", "video", "research", "project", "references",
] as const;
