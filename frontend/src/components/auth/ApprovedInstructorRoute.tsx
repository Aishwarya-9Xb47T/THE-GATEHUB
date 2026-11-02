import React from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useUserStore, isAdminRole, isInstructorApproved } from "@/store/userStore";
import { Loader2, Clock, AlertTriangle, ArrowLeft, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ApprovedInstructorRouteProps {
  children: React.ReactNode;
}

export function ApprovedInstructorRoute({ children }: ApprovedInstructorRouteProps) {
  const { user, isLoading } = useUserStore();
  const location = useLocation();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center bg-background text-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  // Administrators and approved instructors can access
  if (isAdminRole(user.role) || isInstructorApproved(user)) {
    return <>{children}</>;
  }

  // Rejected instructor state
  if (user.role === "instructor" && user.instructorApprovalStatus === "REJECTED") {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-16">
        <Card className="border-rose-200/50 bg-rose-50/30 dark:bg-rose-950/20 dark:border-rose-800/40 shadow-xl overflow-hidden">
          <div className="h-2 w-full bg-rose-500" />
          <CardContent className="p-8 space-y-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-rose-100 dark:bg-rose-900/50 rounded-2xl text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Course Creation Permission Rejected
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Instructor Access Management
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-background/80 border border-border/60 text-sm space-y-2">
              <p className="font-medium text-foreground">
                Your course-creation request was rejected by an administrator.
              </p>
              {user.instructorRejectionReason && (
                <div className="mt-2 p-3 rounded-lg bg-rose-50/50 dark:bg-rose-900/20 text-rose-800 dark:text-rose-300 text-xs">
                  <span className="font-semibold">Reason provided: </span>
                  {user.instructorRejectionReason}
                </div>
              )}
              <p className="text-muted-foreground text-xs mt-2">
                Course creation remains disabled. If you believe this is in error or have updated your credentials, please contact platform administration.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => navigate("/instructor")}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Return to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Pending instructor state
  return (
    <div className="container mx-auto max-w-2xl px-4 py-16">
      <Card className="border-amber-200/60 bg-amber-50/30 dark:bg-amber-950/20 dark:border-amber-800/40 shadow-xl overflow-hidden">
        <div className="h-2 w-full bg-gradient-to-r from-amber-500 to-amber-600" />
        <CardContent className="p-8 space-y-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-100 dark:bg-amber-900/50 rounded-2xl text-amber-600 dark:text-amber-400 animate-pulse">
              <Clock className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Awaiting Admin Approval
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Instructor Account Verification
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-background/80 border border-border/60 text-sm space-y-3">
            <p className="font-semibold text-foreground text-base">
              Your instructor account is awaiting admin approval. You will be able to create courses once your permission is approved.
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              To preserve academic quality, all instructor registrations require a single, one-time verification by our platform administrators. Once approved, you will have permanent, unrestricted access to all course-creation studios:
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5 pl-4 list-disc">
              <li>Manual Visual Course Studio & Curriculum Builder</li>
              <li>AI Course Architect & Auto-Curriculum Generation</li>
              <li>LaTeX Academic Authoring Studio & DSL Compiler</li>
              <li>Learning Universe & Interactive Lab Creation</li>
            </ul>
            <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>
                Approval is required only once. After approval, you will never be asked again.
              </span>
            </div>
          </div>

          <div className="flex justify-between items-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void useUserStore.getState().fetchUser()}
              className="text-xs"
            >
              Check Status
            </Button>
            <Button
              onClick={() => navigate("/instructor")}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Return to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
