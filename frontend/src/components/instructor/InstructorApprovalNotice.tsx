import React from "react";
import { useUserStore, isInstructorApproved } from "@/store/userStore";
import { Clock, AlertTriangle, ShieldCheck, RefreshCw, Calendar, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

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

  const submissionDate = user.createdAt
    ? (() => {
        try {
          return format(new Date(user.createdAt), "MMMM d, yyyy");
        } catch {
          return null;
        }
      })()
    : null;

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
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-rose-200/80 dark:bg-rose-900/80 text-rose-900 dark:text-rose-200 font-semibold">
                  &lt;Status: Rejected&gt;
                </span>
                <h2 className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                  Course Creation Access Blocked
                </h2>
              </div>
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
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-amber-200/90 dark:bg-amber-900/80 text-amber-950 dark:text-amber-200 font-semibold">
                &lt;Status: Awaiting Admin Approval&gt;
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase bg-amber-200/80 text-amber-900 dark:bg-amber-900 dark:text-amber-300">
                Pending Verification
              </span>
              {submissionDate && (
                <span className="text-[11px] text-amber-800/80 dark:text-amber-400 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Submitted: {submissionDate}
                </span>
              )}
            </div>

            <p className="text-sm font-semibold text-amber-950 dark:text-amber-200">
              "Your instructor application is currently under review by the Super Admin."
            </p>

            <p className="text-xs text-amber-900/90 dark:text-amber-300/90 leading-relaxed">
              Your account has been created successfully. Course creation, editing, and publishing permissions are awaiting one-time authorization by the platform administrator.
            </p>

            <div className="p-3 rounded-xl bg-background/80 border border-amber-200/60 dark:border-amber-900/50 text-xs space-y-1.5">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <ArrowRight className="h-3.5 w-3.5 text-amber-600" />
                What happens next:
              </p>
              <p className="text-muted-foreground leading-relaxed text-[11px]">
                Once approved, course creation will automatically be enabled across all visual, AI, and LaTeX studios. You will receive an in-app confirmation and will not need to submit another request.
              </p>
            </div>
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
