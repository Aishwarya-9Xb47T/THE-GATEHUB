import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ContentSourceGrid } from "@/components/assessment-studio";

export function ContentBuilderPanel() {
  const queryClient = useQueryClient();
  const [contentMethod, setContentMethod] = useState<"upload" | "google" | "wayground" | null>(null);

  if (contentMethod) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <h3 className="text-base font-semibold">Content analysis not available yet</h3>
        <p className="text-sm text-muted-foreground">
          Automated extraction from learning materials is not enabled. Create questions in Quiz Builder or Question Bank instead.
        </p>
        <button
          type="button"
          onClick={() => setContentMethod(null)}
          className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Build from Content</h2>
        <p className="text-sm text-muted-foreground">
          Provide any learning material — GateHub analyses it and extracts assessment questions into your Question Bank.
        </p>
      </div>
      <ContentSourceGrid onSelect={setContentMethod} />
    </div>
  );
}
