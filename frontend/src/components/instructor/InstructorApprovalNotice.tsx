import React from "react";
import { useUserStore, isInstructorApproved } from "@/store/userStore";
import { Clock, AlertTriangle, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InstructorApprovalNotice() {
  const { user, fetchUser } = useUserStore();
  const [isChecking, setIsChecking] = React.useState(false);

  if (!user || user.role !== "instructor" || isInstructorApproved(user)) {
    return null;
  }

  const handleRefresh = async () => {
    setIsChecking(true);
    try {
      await fetchUser();
    } finally {
      setIsChecking(false);
    }
  };

  if (user.instructorApprovalStatus === "REJECTED") {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-rose-300/80 bg-rose-50/90 dark:bg-rose-950/30 dark:border-rose-800/60 p-4 md:p-5 shadow-sm text-foreground space-y-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-rose-100 dark:bg-rose-900/60 rounded-xl text-rose-600 dark:text-rose-400 shrink-0 mt-0.5">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                Course Creation Access Rejected
              </h2>
              <p className="text-xs text-rose-700/90 dark:text-rose-300 mt-1">
                Your instructor course-creation request was rejected by an administrator. Course creation remains disabled.
              </p>
              {user.instructorRejectionReason && (
                <div className="mt-2 p-2.5 rounded-lg bg-background/80 border border-rose-200/60 dark:border-rose-900 text-xs text-foreground font-mono">
                  <span className="font-semibold font-sans text-rose-800 dark:text-rose-400">Reason: </span>
                  {user.instructorRejectionReason}
                </div>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={isChecking}
            className="shrink-0 gap-1.5 text-xs h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? "animate-spin" : ""}`} />
            Re-check
          </Button>
        </div>
      </div>
    );
  }

  // PENDING state (or unmigrated)
  return (
    <div
      role="status"
      className="rounded-2xl border border-amber-300/80 bg-amber-50/90 dark:bg-amber-950/30 dark:border-amber-800/60 p-4 md:p-5 shadow-sm text-foreground space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/60 rounded-xl text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 animate-pulse">
            <Clock className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-200">
                Awaiting Admin Approval
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase bg-amber-200/80 text-amber-900 dark:bg-amber-900 dark:text-amber-300">
                Pending Verification
              </span>
            </div>
            <p className="text-xs text-amber-900/90 dark:text-amber-300/90 leading-relaxed">
              Your instructor account is awaiting admin approval. You will be able to create courses once your permission is approved.
            </p>
            <p className="text-[11px] text-amber-800/80 dark:text-amber-400/80 flex items-center gap-1.5 pt-0.5">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span>
                Approval is required only once. After approval, you can create unlimited courses across all visual, AI, and LaTeX studios.
              </span>
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRefresh}
          disabled={isChecking}
          className="shrink-0 gap-1.5 text-xs h-8 border-amber-300/70 hover:bg-amber-100/50 dark:border-amber-700"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? "animate-spin" : ""}`} />
          Check Status
        </Button>
      </div>
    </div>
  );
}
