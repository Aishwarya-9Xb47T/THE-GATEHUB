import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToastStore } from "@/store/toastStore";
import { UnifiedAvatar } from "@/components/common/UnifiedAvatar";
import {
  Users,
  ShieldCheck,
  Clock,
  XCircle,
  Search,
  Check,
  AlertTriangle,
  BookOpen,
  Calendar,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";

interface InstructorRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  avatar?: string | null;
  createdAt: string;
  suspended: boolean;
  instructorApprovalStatus: "PENDING" | "APPROVED" | "REJECTED" | string | null;
  instructorApprovedAt?: string | null;
  instructorApprovalNotes?: string | null;
  instructorRejectionReason?: string | null;
  instructorApprovedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  _count?: {
    coursesCreated: number;
    learningUniverses: number;
  };
}

interface CountsData {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

export function AdminInstructorApprovals() {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.add);

  const [activeTab, setActiveTab] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("PENDING");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Approval dialog state
  const [approvingInstructor, setApprovingInstructor] = useState<InstructorRecord | null>(null);
  const [approvalNotes, setApprovalNotes] = useState("");

  // Rejection dialog state
  const [rejectingInstructor, setRejectingInstructor] = useState<InstructorRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Fetch counts
  const { data: countsData } = useQuery<CountsData>({
    queryKey: ["admin", "instructor-approvals", "counts"],
    queryFn: async () => {
      const res = await api<{ counts: CountsData }>("/admin/instructor-approvals/counts");
      if (res.error) throw new Error(res.error);
      return res.data!.counts;
    },
    refetchInterval: 30_000,
  });

  // Fetch instructors
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "instructor-approvals", activeTab, search, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      });
      if (activeTab !== "ALL") {
        params.set("status", activeTab);
      }
      if (search.trim()) {
        params.set("search", search.trim());
      }
      const res = await api<{
        instructors: InstructorRecord[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`/admin/instructor-approvals?${params}`);
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const res = await api<{ success: boolean; message: string }>(
        `/admin/instructor-approvals/${id}/approve`,
        {
          method: "POST",
          body: { notes },
        }
      );
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      toast({
        title: "Instructor Approved",
        description: "Permanent course-creation permission granted.",
        variant: "success",
      });
      setApprovingInstructor(null);
      setApprovalNotes("");
      queryClient.invalidateQueries({ queryKey: ["admin", "instructor-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Approval Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const res = await api<{ success: boolean; message: string }>(
        `/admin/instructor-approvals/${id}/reject`,
        {
          method: "POST",
          body: { reason },
        }
      );
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      toast({
        title: "Instructor Request Rejected",
        description: "Course creation remains blocked.",
        variant: "default",
      });
      setRejectingInstructor(null);
      setRejectionReason("");
      queryClient.invalidateQueries({ queryKey: ["admin", "instructor-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Rejection Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleApproveSubmit = () => {
    if (!approvingInstructor) return;
    approveMutation.mutate({
      id: approvingInstructor.id,
      notes: approvalNotes,
    });
  };

  const handleRejectSubmit = () => {
    if (!rejectingInstructor) return;
    rejectMutation.mutate({
      id: rejectingInstructor.id,
      reason: rejectionReason,
    });
  };

  const counts = countsData || { total: 0, pending: 0, approved: 0, rejected: 0 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">Instructor Approvals</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              One-Time Permission
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage course-creation authorization. Once approved, instructors gain permanent access to create unlimited courses across all authoring studios.
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card
          className={`cursor-pointer transition-all border ${
            activeTab === "PENDING"
              ? "ring-2 ring-amber-500/50 border-amber-300 dark:border-amber-700 bg-amber-500/5"
              : "hover:border-border/80"
          }`}
          onClick={() => {
            setActiveTab("PENDING");
            setPage(1);
          }}
        >
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Awaiting Approval</p>
              <h2 className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{counts.pending}</h2>
            </div>
            <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
              <Clock className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-all border ${
            activeTab === "APPROVED"
              ? "ring-2 ring-emerald-500/50 border-emerald-300 dark:border-emerald-700 bg-emerald-500/5"
              : "hover:border-border/80"
          }`}
          onClick={() => {
            setActiveTab("APPROVED");
            setPage(1);
          }}
        >
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Approved Instructors</p>
              <h2 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{counts.approved}</h2>
            </div>
            <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-all border ${
            activeTab === "REJECTED"
              ? "ring-2 ring-rose-500/50 border-rose-300 dark:border-rose-700 bg-rose-500/5"
              : "hover:border-border/80"
          }`}
          onClick={() => {
            setActiveTab("REJECTED");
            setPage(1);
          }}
        >
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rejected Requests</p>
              <h2 className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">{counts.rejected}</h2>
            </div>
            <div className="p-3 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400">
              <XCircle className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-all border ${
            activeTab === "ALL"
              ? "ring-2 ring-primary/50 border-primary/40 bg-primary/5"
              : "hover:border-border/80"
          }`}
          onClick={() => {
            setActiveTab("ALL");
            setPage(1);
          }}
        >
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Instructors</p>
              <h2 className="text-2xl font-bold text-foreground mt-1">{counts.total}</h2>
            </div>
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <Users className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border border-border/60">
          {(
            [
              { id: "PENDING", label: `Pending (${counts.pending})` },
              { id: "APPROVED", label: `Approved (${counts.approved})` },
              { id: "REJECTED", label: `Rejected (${counts.rejected})` },
              { id: "ALL", label: `All (${counts.total})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 bg-background/80"
          />
        </div>
      </div>

      {/* Main Table / List */}
      <Card className="border border-border/70 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              Loading instructor requests...
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-destructive">
              Failed to load instructor approvals: {(error as Error).message}
              <Button variant="link" onClick={() => refetch()} className="ml-2">
                Retry
              </Button>
            </div>
          ) : data?.instructors.length === 0 ? (
            <div className="p-16 text-center space-y-3">
              <div className="inline-flex p-3 rounded-full bg-muted/60 text-muted-foreground">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <h3 className="font-semibold text-foreground text-base">No instructors found</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {activeTab === "PENDING"
                  ? "There are currently no instructors waiting for approval."
                  : "No instructor records matched the selected filter or search."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/70 bg-muted/30 text-xs font-semibold text-muted-foreground">
                    <th className="py-3 px-4">Instructor</th>
                    <th className="py-3 px-4">Registered</th>
                    <th className="py-3 px-4">Approval Status</th>
                    <th className="py-3 px-4">Activity</th>
                    <th className="py-3 px-4">Approval Audit / Notes</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 text-sm">
                  {data?.instructors.map((instructor) => {
                    const status = instructor.instructorApprovalStatus || "PENDING";
                    const isApproved = status === "APPROVED";
                    const isRejected = status === "REJECTED";
                    const isPending = !isApproved && !isRejected;

                    return (
                      <tr
                        key={instructor.id}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        {/* Instructor info */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <UnifiedAvatar
                              user={instructor as any}
                              size="md"
                            />
                            <div>
                              <p className="font-semibold text-foreground">
                                {instructor.firstName} {instructor.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {instructor.email}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Registered */}
                        <td className="py-3.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 opacity-70" />
                            <span>
                              {instructor.createdAt
                                ? format(new Date(instructor.createdAt), "MMM d, yyyy")
                                : "—"}
                            </span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {isApproved && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                              Approved
                            </span>
                          )}
                          {isRejected && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                              <XCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                              Rejected
                            </span>
                          )}
                          {isPending && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 animate-pulse">
                              <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                              Pending Approval
                            </span>
                          )}
                        </td>

                        {/* Activity */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1" title="Courses created">
                              <BookOpen className="h-3.5 w-3.5 opacity-70" />
                              {(instructor._count?.coursesCreated ?? 0) + (instructor._count?.learningUniverses ?? 0)}
                            </span>
                          </div>
                        </td>

                        {/* Approver / Notes */}
                        <td className="py-3.5 px-4 text-xs text-muted-foreground max-w-xs truncate">
                          {isApproved && (
                            <div className="space-y-0.5">
                              {instructor.instructorApprovedBy ? (
                                <p className="font-medium text-foreground truncate">
                                  Approved by {instructor.instructorApprovedBy.firstName} {instructor.instructorApprovedBy.lastName}
                                </p>
                              ) : (
                                <p className="text-muted-foreground">Admin verified</p>
                              )}
                              {instructor.instructorApprovedAt && (
                                <p className="text-[11px] text-muted-foreground">
                                  {format(new Date(instructor.instructorApprovedAt), "MMM d, yyyy HH:mm")}
                                </p>
                              )}
                              {instructor.instructorApprovalNotes && (
                                <p className="text-[11px] italic text-muted-foreground truncate">
                                  "{instructor.instructorApprovalNotes}"
                                </p>
                              )}
                            </div>
                          )}
                          {isRejected && (
                            <div className="space-y-0.5">
                              <p className="text-rose-600 dark:text-rose-400 font-medium">Access blocked</p>
                              {instructor.instructorRejectionReason && (
                                <p className="text-[11px] text-muted-foreground truncate">
                                  Reason: {instructor.instructorRejectionReason}
                                </p>
                              )}
                            </div>
                          )}
                          {isPending && (
                            <span className="text-amber-600 dark:text-amber-400 italic">
                              Awaiting review
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {isPending && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setApprovingInstructor(instructor);
                                    setApprovalNotes("");
                                  }}
                                  className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-3 shadow-sm"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setRejectingInstructor(instructor);
                                    setRejectionReason("");
                                  }}
                                  className="h-8 gap-1 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-xs px-3"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  Reject
                                </Button>
                              </>
                            )}

                            {isRejected && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setApprovingInstructor(instructor);
                                  setApprovalNotes("Re-approved following review");
                                }}
                                className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-3"
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                                Re-Approve
                              </Button>
                            )}

                            {isApproved && (
                              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-1">
                                <ShieldCheck className="h-4 w-4" />
                                Verified Permanent
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-2">
          <p>
            Showing {((page - 1) * data.limit) + 1} to {Math.min(page * data.limit, data.total)} of {data.total} instructors
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 px-3 text-xs"
            >
              Previous
            </Button>
            <span className="font-semibold text-foreground">
              {page} / {data.totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              className="h-8 px-3 text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Approve Confirmation Dialog */}
      <Dialog
        open={!!approvingInstructor}
        onOpenChange={(open) => {
          if (!open) setApprovingInstructor(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Approve Instructor Course Creation
            </DialogTitle>
            <DialogDescription>
              Grant permanent permission for this instructor to create, generate, compile, and publish courses across all GateHub authoring tools.
            </DialogDescription>
          </DialogHeader>

          {approvingInstructor && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-xl bg-muted/60 border border-border/60 flex items-center gap-3">
                <UnifiedAvatar
                  user={approvingInstructor as any}
                  size="md"
                />
                <div className="min-w-0">
                  <p className="font-semibold text-foreground text-sm truncate">
                    {approvingInstructor.firstName} {approvingInstructor.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {approvingInstructor.email}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Approval Notes (Optional):
                </label>
                <Input
                  placeholder="e.g. Verified university affiliation / portfolio review"
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  className="text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Recorded in administrative audit log.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200">
                <span className="font-semibold">Note: </span>
                This approval is one-time only. The instructor can create unlimited courses and will never need approval again.
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setApprovingInstructor(null)}
              disabled={approveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApproveSubmit}
              disabled={approveMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              {approveMutation.isPending ? "Approving..." : "Grant Permission"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Confirmation Dialog */}
      <Dialog
        open={!!rejectingInstructor}
        onOpenChange={(open) => {
          if (!open) setRejectingInstructor(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              Reject Instructor Request
            </DialogTitle>
            <DialogDescription>
              Block course creation for this instructor. The instructor's dashboard will display the rejection notice and course creation will remain prohibited.
            </DialogDescription>
          </DialogHeader>

          {rejectingInstructor && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-xl bg-muted/60 border border-border/60 flex items-center gap-3">
                <UnifiedAvatar
                  user={rejectingInstructor as any}
                  size="md"
                />
                <div className="min-w-0">
                  <p className="font-semibold text-foreground text-sm truncate">
                    {rejectingInstructor.firstName} {rejectingInstructor.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {rejectingInstructor.email}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Reason for Rejection:
                </label>
                <Input
                  placeholder="e.g. Unverifiable credentials / incomplete application"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  This explanation will be visible to the instructor on their dashboard.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setRejectingInstructor(null)}
              disabled={rejectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRejectSubmit}
              disabled={rejectMutation.isPending}
              variant="destructive"
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export default AdminInstructorApprovals;
