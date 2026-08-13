import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, apiFormData } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AdminAiPanel } from "@/components/admin/AdminAiPanel";
import { useToastStore } from "@/store/toastStore";
import { useUserStore, isAdminRole, isSuperAdminRole } from "@/store/userStore";
import { formatRoleLabel } from "@/lib/roles";
import { formatINR } from "@/lib/paymentUtils";
import { UnifiedAvatar } from "@/components/common/UnifiedAvatar";
import { LogOut, Upload, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type TabId = "profile" | "platform" | "payments" | "certificates" | "ai" | "learning" | "security" | "email" | "health";

const TABS: { id: TabId; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "platform", label: "Platform" },
  { id: "payments", label: "Payments" },
  { id: "certificates", label: "Certificates" },
  { id: "ai", label: "AI" },
  { id: "learning", label: "Learning Universes" },
  { id: "security", label: "Security" },
  { id: "email", label: "Email" },
  { id: "health", label: "System Health" },
];

function ToggleRow({ label, desc, checked, disabled, onChange }: {
  label: string; desc?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <Label className="text-base font-semibold">{label}</Label>
        {desc && <p className="text-sm text-muted-foreground">{desc}</p>}
      </div>
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(v === true)} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function AdminSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.add);
  const { user, fetchUser, clearAuth } = useUserStore();
  const canEdit = isAdminRole(user?.role);
  const canEditSuper = isSuperAdminRole(user?.role);
  const [tab, setTab] = useState<TabId>("profile");
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [profileForm, setProfileForm] = useState<Record<string, string>>({});
  const [passwordForm, setPasswordForm] = useState({ current: "", newPass: "", confirm: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [previewZoom, setPreviewZoom] = useState(50);
  const certPdfUrlRef = useRef<string | null>(null);

  const patch = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ["admin", "settings", "profile"],
    queryFn: async () => {
      const res = await api<any>("/admin/settings/profile");
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
  });

  const { data: settingsData, isLoading: settingsLoading, refetch: refetchSettings } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: async () => {
      const res = await api<any>("/admin/settings");
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
  });

  const { data: healthData, refetch: refetchHealth } = useQuery({
    queryKey: ["admin", "settings", "health"],
    queryFn: async () => {
      const res = await api<any>("/admin/settings/health");
      if (res.error) throw new Error(res.error);
      return res.data!.health;
    },
    enabled: tab === "health",
    refetchInterval: tab === "health" ? 30_000 : false,
  });

  useEffect(() => {
    if (profileData?.profile) {
      const p = profileData.profile;
      setProfileForm({
        firstName: p.firstName ?? "",
        lastName: p.lastName ?? "",
        phone: p.phone ?? "",
        designation: p.designation ?? "",
        bio: p.bio ?? "",
        contactEmail: p.contactEmail ?? "",
      });
    }
  }, [profileData]);

  const settings = { ...(settingsData?.settings ?? {}), ...form };
  const paymentStats = settingsData?.paymentStats;
  const aiUsage = settingsData?.aiUsage;
  const integrations = settingsData?.integrations;

  const certPreviewKey = useMemo(() => JSON.stringify({
    platformName: settings.platformName,
    platformLogo: settings.platformLogo,
    certificateIssuerName: settings.certificateIssuerName,
    certificateDesignation: settings.certificateDesignation,
    certificatePrefix: settings.certificatePrefix,
    certificateSignatureUrl: settings.certificateSignatureUrl,
    certificateSealUrl: settings.certificateSealUrl,
    certificateBackgroundUrl: settings.certificateBackgroundUrl,
  }), [settings.platformName, settings.platformLogo, settings.certificateIssuerName, settings.certificateDesignation, settings.certificatePrefix, settings.certificateSignatureUrl, settings.certificateSealUrl, settings.certificateBackgroundUrl]);

  const { data: certPreviewPdf, isLoading: certPreviewLoading, error: certPreviewError, refetch: refetchCertPreview } = useQuery({
    queryKey: ["admin", "settings", "cert-preview-pdf", certPreviewKey],
    queryFn: async () => {
      const token = localStorage.getItem("lms_token");
      const res = await fetch(`/api/admin/settings/certificate-preview/pdf?_=${Date.now()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: certPreviewKey,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || `Preview failed (${res.status})`);
      }
      const blob = await res.blob();
      if (certPdfUrlRef.current) URL.revokeObjectURL(certPdfUrlRef.current);
      const url = URL.createObjectURL(blob);
      certPdfUrlRef.current = url;
      return { url, size: blob.size };
    },
    enabled: tab === "certificates" && !!settingsData,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    return () => {
      if (certPdfUrlRef.current) URL.revokeObjectURL(certPdfUrlRef.current);
    };
  }, []);

  const saveSettings = useMutation({
    mutationFn: async () => {
      const res = await api("/admin/settings", { method: "PATCH", body: form });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "settings", "cert-preview-pdf"] });
      setForm({});
      toast({ title: "Settings saved", variant: "success" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveProfile = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await api("/admin/settings/profile", { method: "PATCH", body });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings", "profile"] });
      fetchUser();
      toast({ title: "Profile updated", variant: "success" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const logoutAll = useMutation({
    mutationFn: async () => {
      const res = await api<{ requiresReauth?: boolean }>("/admin/settings/logout-all", { method: "POST" });
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      clearAuth();
      toast({ title: "All sessions revoked", description: "Please log in again.", variant: "success" });
      navigate("/login", { replace: true });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const testEmail = useMutation({
    mutationFn: async () => {
      const res = await api("/admin/settings/test-email", { method: "POST", body: { to: testEmailTo } });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => toast({ title: "Test email sent", variant: "success" }),
    onError: (e: Error) => toast({ title: "Email failed", description: e.message, variant: "destructive" }),
  });

  const uploadAsset = async (type: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiFormData<any>(`/admin/settings/upload/${type}`, fd);
    if (res.error) throw new Error(res.error);
    queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "settings", "cert-preview-pdf"] });
    toast({ title: `${type} uploaded`, variant: "success" });
  };

  const uploadAvatar = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const up = await apiFormData<{ url: string }>("/upload", fd);
    if (up.error) throw new Error(up.error);
    await saveProfile.mutateAsync({ avatar: up.data!.url });
  };

  const deleteCertAsset = async (type: string) => {
    const res = await api(`/admin/settings/certificate-asset/${type}`, { method: "DELETE" });
    if (res.error) throw new Error(res.error);
    queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "settings", "cert-preview-pdf"] });
    toast({ title: `${type} removed`, variant: "success" });
  };

  const certAssetUrl = (type: "signature" | "seal" | "background") => {
    const map = { signature: settings.certificateSignatureUrl, seal: settings.certificateSealUrl, background: settings.certificateBackgroundUrl };
    const url = map[type];
    return url ? String(url) : null;
  };

  const feeTotal = Number(settings.platformFeePercentage ?? 20) + Number(settings.instructorSharePercentage ?? 80);
  const feeValid = Math.abs(feeTotal - 100) < 0.01;

  if (profileLoading && settingsLoading) {
    return <div className="p-8 animate-pulse text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="space-y-8 w-full min-w-0 pb-12">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Platform Control Center — configure your LMS
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* PROFILE */}
      {tab === "profile" && profileData && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Admin Profile</CardTitle>
              <CardDescription>Your account information and security</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <UnifiedAvatar user={profileData.profile} size="lg" />
                <div>
                  <p className="font-semibold">{profileData.profile.firstName} {profileData.profile.lastName}</p>
                  <p className="text-sm text-muted-foreground">{formatRoleLabel(profileData.profile.role)}</p>
                  <label className="mt-2 inline-flex items-center gap-2 text-sm text-primary cursor-pointer">
                    <Upload className="h-4 w-4" />
                    Upload photo
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
                  </label>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="First Name"><Input value={profileForm.firstName} onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })} /></Field>
                <Field label="Last Name"><Input value={profileForm.lastName} onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })} /></Field>
                <Field label="Phone"><Input value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} /></Field>
                <Field label="Designation"><Input value={profileForm.designation} onChange={(e) => setProfileForm({ ...profileForm, designation: e.target.value })} placeholder="e.g. Platform Administrator" /></Field>
                <Field label="Contact Email"><Input type="email" value={profileForm.contactEmail} onChange={(e) => setProfileForm({ ...profileForm, contactEmail: e.target.value })} /></Field>
                <Field label="Login Email"><Input value={profileData.profile.email} disabled className="bg-muted/30" /></Field>
              </div>
              <Field label="Bio"><textarea className="w-full min-h-[80px] rounded-md border px-3 py-2 text-sm bg-background" value={profileForm.bio} onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })} /></Field>
              <div className="grid sm:grid-cols-4 gap-4 text-sm text-muted-foreground">
                <div><span className="font-medium text-foreground">Joined</span><br />{new Date(profileData.profile.createdAt).toLocaleDateString()}</div>
                <div><span className="font-medium text-foreground">Last Login</span><br />{profileData.profile.lastLoginAt ? new Date(profileData.profile.lastLoginAt).toLocaleString() : "—"}</div>
                <div><span className="font-medium text-foreground">Role</span><br />{formatRoleLabel(profileData.profile.role)}</div>
                <div><span className="font-medium text-foreground">Account Status</span><br />{profileData.profile.accountStatus ?? "Active"}</div>
              </div>
              <Button onClick={() => saveProfile.mutate(profileForm)} disabled={saveProfile.isPending}>Save Profile</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Change Password</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!showPassword ? (
                <Button variant="outline" onClick={() => setShowPassword(true)}>Change Password</Button>
              ) : (
                <>
                  <Field label="Current Password"><Input type="password" value={passwordForm.current} onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })} /></Field>
                  <Field label="New Password"><Input type="password" value={passwordForm.newPass} onChange={(e) => setPasswordForm({ ...passwordForm, newPass: e.target.value })} /></Field>
                  <Field label="Confirm Password"><Input type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })} /></Field>
                  <div className="flex gap-2">
                    <Button onClick={() => {
                      if (passwordForm.newPass !== passwordForm.confirm) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
                      saveProfile.mutate({ currentPassword: passwordForm.current, newPassword: passwordForm.newPass });
                      setShowPassword(false);
                    }}>Update Password</Button>
                    <Button variant="ghost" onClick={() => setShowPassword(false)}>Cancel</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Sessions & Security</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Active sessions: {profileData.sessions?.length ?? 0}
                {(profileData.sessions?.length ?? 0) === 0 && (
                  <span className="block mt-1 text-xs">Log out and sign in again to start tracking this device.</span>
                )}
              </p>
              {profileData.sessions?.map((s: any) => (
                <div key={s.id} className={cn("text-sm border rounded-lg p-3", s.isCurrent && "border-primary/50 bg-primary/5")}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{s.browser} on {s.device}</p>
                    {s.isCurrent && <span className="text-xs text-primary font-semibold">Current session</span>}
                  </div>
                  <p className="text-muted-foreground">{s.ipAddress || "Unknown IP"}</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Started {new Date(s.createdAt).toLocaleString()} · Last active {new Date(s.lastActive).toLocaleString()}
                  </p>
                </div>
              ))}
              <div>
                <p className="font-medium mb-2">Recent Login History</p>
                {profileData.loginHistory?.length ? profileData.loginHistory.map((h: any) => (
                  <div key={h.id} className="text-sm border-b py-2 last:border-0">
                    <span className={h.success ? "text-green-600" : "text-destructive"}>{h.success ? "Success" : "Failed"}</span>
                    {" · "}{new Date(h.createdAt).toLocaleString()}
                    {" · "}{h.browser} on {h.device}
                    {" · "}{h.ipAddress || "—"}
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">No login history yet.</p>
                )}
              </div>
              <Button variant="destructive" onClick={() => logoutAll.mutate()} disabled={logoutAll.isPending}>
                <LogOut className="h-4 w-4 mr-2" /> Logout All Devices
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* PLATFORM */}
      {tab === "platform" && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>General</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Platform Name"><Input disabled={!canEdit} value={String(settings.platformName ?? "")} onChange={(e) => patch("platformName", e.target.value)} /></Field>
              <Field label="Company Name"><Input disabled={!canEdit} value={String(settings.companyName ?? "")} onChange={(e) => patch("companyName", e.target.value)} /></Field>
              <Field label="Contact Email"><Input disabled={!canEdit} type="email" value={String(settings.contactEmail ?? "")} onChange={(e) => patch("contactEmail", e.target.value)} /></Field>
              <Field label="Support Email"><Input disabled={!canEdit} type="email" value={String(settings.supportEmail ?? "")} onChange={(e) => patch("supportEmail", e.target.value)} /></Field>
              <Field label="Support Phone"><Input disabled={!canEdit} value={String(settings.supportPhone ?? "")} onChange={(e) => patch("supportPhone", e.target.value)} /></Field>
              <Field label="Website URL"><Input disabled={!canEdit} value={String(settings.websiteUrl ?? "")} onChange={(e) => patch("websiteUrl", e.target.value)} /></Field>
              <Field label="Footer Text"><Input disabled={!canEdit} value={String(settings.footerText ?? "")} onChange={(e) => patch("footerText", e.target.value)} /></Field>
              <div className="space-y-2">
                <Label>Platform Logo</Label>
                {settings.platformLogo && <img src={String(settings.platformLogo)} alt="Logo" className="h-12 object-contain" />}
                {canEdit && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer text-primary">
                    <Upload className="h-4 w-4" /> Upload logo
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAsset("logo", e.target.files[0])} />
                  </label>
                )}
              </div>
              <div className="space-y-2">
                <Label>Favicon</Label>
                {settings.faviconUrl && <img src={String(settings.faviconUrl)} alt="Favicon" className="h-8 w-8 object-contain" />}
                {canEdit && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer text-primary">
                    <Upload className="h-4 w-4" /> Upload favicon
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAsset("favicon", e.target.files[0])} />
                  </label>
                )}
              </div>
              <ToggleRow label="Maintenance Mode" desc="Block non-super-admin access" checked={!!settings.maintenanceMode} disabled={!canEditSuper} onChange={(v) => patch("maintenanceMode", v)} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>User Registration</CardTitle></CardHeader>
            <CardContent className="divide-y">
              <ToggleRow label="Student Registration" checked={!!settings.studentRegistrationEnabled} disabled={!canEdit} onChange={(v) => patch("studentRegistrationEnabled", v)} />
              <ToggleRow label="Instructor Registration" checked={!!settings.instructorRegistrationEnabled} disabled={!canEdit} onChange={(v) => patch("instructorRegistrationEnabled", v)} />
              <ToggleRow label="Auto-Approve Instructors" desc="Off = manual approval required" checked={!!settings.instructorAutoApprove} disabled={!canEdit} onChange={(v) => patch("instructorAutoApprove", v)} />
              <ToggleRow label="Email Verification" checked={!!settings.emailVerificationEnabled} disabled={!canEdit} onChange={(v) => patch("emailVerificationEnabled", v)} />
              <ToggleRow label="Allow Admin Creation" checked={!!settings.adminCreationEnabled} disabled={!canEdit} onChange={(v) => patch("adminCreationEnabled", v)} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* PAYMENTS */}
      {tab === "payments" && (
        <div className="space-y-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Revenue</CardTitle></CardHeader><CardContent className="text-xl font-bold">{formatINR(paymentStats?.totalRevenue ?? 0)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Platform Share</CardTitle></CardHeader><CardContent className="text-xl font-bold">{formatINR(paymentStats?.platformRevenue ?? 0)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Instructor Share</CardTitle></CardHeader><CardContent className="text-xl font-bold">{formatINR(paymentStats?.instructorRevenue ?? 0)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Transactions</CardTitle></CardHeader><CardContent className="text-xl font-bold">{paymentStats?.transactionCount ?? 0}</CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle>Payment Configuration</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Platform Fee %"><Input disabled={!canEdit} type="number" value={Number(settings.platformFeePercentage ?? 20)} onChange={(e) => patch("platformFeePercentage", Number(e.target.value))} /></Field>
              <Field label="Instructor Share %"><Input disabled={!canEdit} type="number" value={Number(settings.instructorSharePercentage ?? 80)} onChange={(e) => patch("instructorSharePercentage", Number(e.target.value))} /></Field>
              <Field label="Default Currency"><Input disabled={!canEdit} value={String(settings.defaultCurrency ?? "INR")} onChange={(e) => patch("defaultCurrency", e.target.value)} /></Field>
              <Field label="Payment Gateway"><Input disabled={!canEdit} value={String(settings.paymentGateway ?? "razorpay")} onChange={(e) => patch("paymentGateway", e.target.value)} /></Field>
              {!feeValid && <p className="text-destructive text-sm col-span-2">Platform fee + instructor share must equal 100% (currently {feeTotal}%)</p>}
              <div className="col-span-2 text-sm text-muted-foreground space-y-1">
                <p>Razorpay: {integrations?.razorpay ? "Connected" : "Not configured"} {integrations?.razorpayWebhook ? "(webhook configured)" : ""}</p>
                <p>Refunds: {paymentStats?.refundCount ?? 0} ({formatINR(paymentStats?.refundAmount ?? 0)})</p>
                <p>Last payment: {paymentStats?.lastPayment ? `${formatINR(paymentStats.lastPayment.amount)} on ${new Date(paymentStats.lastPayment.createdAt).toLocaleString()}` : "None"}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* CERTIFICATES */}
      {tab === "certificates" && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Certificate Design</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Issuer Name"><Input disabled={!canEdit} value={String(settings.certificateIssuerName ?? "")} onChange={(e) => patch("certificateIssuerName", e.target.value)} /></Field>
              <Field label="Designation"><Input disabled={!canEdit} value={String(settings.certificateDesignation ?? "")} onChange={(e) => patch("certificateDesignation", e.target.value)} /></Field>
              <Field label="Certificate Prefix"><Input disabled={!canEdit} value={String(settings.certificatePrefix ?? "")} onChange={(e) => patch("certificatePrefix", e.target.value)} placeholder="GH-CERT" /></Field>
              {(["signature", "seal", "background"] as const).map((type) => (
                <div key={type} className="space-y-2">
                  <Label className="capitalize">{type}</Label>
                  {certAssetUrl(type) && (
                    <div className="flex items-center gap-3 p-2 border rounded-lg bg-muted/30">
                      <img src={certAssetUrl(type)!} alt={type} className="h-16 w-16 object-contain rounded border bg-white" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground truncate">{certAssetUrl(type)}</p>
                      </div>
                      {canEdit && (
                        <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => deleteCertAsset(type)}>Remove</Button>
                      )}
                    </div>
                  )}
                  {canEdit && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer text-primary">
                      <Upload className="h-4 w-4" /> {certAssetUrl(type) ? `Replace ${type}` : `Upload ${type}`}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAsset(type, e.target.files[0])} />
                    </label>
                  )}
                  {type === "background" && (
                    <p className="text-xs text-muted-foreground">Use a subtle paper texture image, not the platform logo.</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Live Preview</CardTitle>
                  <CardDescription>
                    Actual generated PDF — identical to what students download · Sample Student · Sample Course · Date: DD/MM/YYYY
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground">Zoom</Label>
                  {[25, 50, 75, 100].map((z) => (
                    <Button key={z} type="button" size="sm" variant={previewZoom === z ? "default" : "outline"} onClick={() => setPreviewZoom(z)}>
                      {z}%
                    </Button>
                  ))}
                  <Button type="button" size="sm" variant="outline" onClick={() => refetchCertPreview()} disabled={certPreviewLoading}>
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 overflow-auto rounded-b-lg border-t bg-muted/40" style={{ maxHeight: "85vh" }}>
              {certPreviewLoading && (
                <p className="text-sm text-muted-foreground text-center py-12">Generating certificate preview…</p>
              )}
              {certPreviewError && (
                <p className="text-sm text-destructive text-center py-12">{(certPreviewError as Error).message}</p>
              )}
              {certPreviewPdf?.url && (
                <div className="flex justify-center" style={{ transform: `scale(${previewZoom / 100})`, transformOrigin: "top center" }}>
                  <iframe
                    key={certPreviewPdf.url}
                    title="Certificate PDF preview"
                    src={`${certPreviewPdf.url}#toolbar=0&navpanes=0`}
                    className="border shadow-lg bg-white"
                    style={{
                      width: "1122px",
                      height: "794px",
                      maxWidth: "none",
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* AI */}
      {tab === "ai" && (
        <div className="space-y-6">
          <div className="grid sm:grid-cols-3 gap-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Monthly Requests</CardTitle></CardHeader><CardContent className="text-xl font-bold">{aiUsage?.monthlyRequests ?? 0}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Requests</CardTitle></CardHeader><CardContent className="text-xl font-bold">{aiUsage?.totalRequests ?? 0}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Est. Cost</CardTitle></CardHeader><CardContent className="text-xl font-bold">{formatINR(aiUsage?.estimatedCost ?? 0)}</CardContent></Card>
          </div>
          <AdminAiPanel
            canEdit={canEdit}
            settingsProvider={String(settings.aiProvider ?? "ollama")}
            settingsModel={String(settings.aiModelName ?? "")}
            onPatchSettings={patch}
          />
          <Card>
            <CardHeader><CardTitle>Feature toggles</CardTitle></CardHeader>
            <CardContent className="divide-y">
              <ToggleRow label="AI Course Builder" checked={!!settings.aiAuthoringEnabled} disabled={!canEdit} onChange={(v) => patch("aiAuthoringEnabled", v)} />
              <ToggleRow label="AI Learning Universe Builder" checked={!!settings.aiLuBuilderEnabled} disabled={!canEdit} onChange={(v) => patch("aiLuBuilderEnabled", v)} />
              <ToggleRow label="AI Tutor" checked={!!settings.aiTutorEnabled} disabled={!canEdit} onChange={(v) => patch("aiTutorEnabled", v)} />
              <ToggleRow label="AI Quiz Generator" checked={!!settings.aiQuizGeneratorEnabled} disabled={!canEdit} onChange={(v) => patch("aiQuizGeneratorEnabled", v)} />
              <ToggleRow label="AI Project Evaluator" checked={!!settings.aiProjectEvaluatorEnabled} disabled={!canEdit} onChange={(v) => patch("aiProjectEvaluatorEnabled", v)} />
              <ToggleRow label="AI Interview Assistant" checked={!!settings.aiInterviewAssistantEnabled} disabled={!canEdit} onChange={(v) => patch("aiInterviewAssistantEnabled", v)} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* LEARNING UNIVERSES */}
      {tab === "learning" && (
        <Card>
          <CardHeader><CardTitle>Learning Universe Controls</CardTitle></CardHeader>
          <CardContent className="divide-y">
            <ToggleRow label="Allow Publishing" checked={!!settings.luPublishingEnabled} disabled={!canEdit} onChange={(v) => patch("luPublishingEnabled", v)} />
            <ToggleRow label="Require Review Before Publish" checked={!!settings.luRequireReview} disabled={!canEdit} onChange={(v) => patch("luRequireReview", v)} />
            <ToggleRow label="Allow Public Universes" checked={!!settings.luAllowPublic} disabled={!canEdit} onChange={(v) => patch("luAllowPublic", v)} />
            <ToggleRow label="Require Enrollment" checked={!!settings.luRequireEnrollment} disabled={!canEdit} onChange={(v) => patch("luRequireEnrollment", v)} />
            <ToggleRow label="Require Payment" checked={!!settings.luRequirePayment} disabled={!canEdit} onChange={(v) => patch("luRequirePayment", v)} />
            <ToggleRow label="Allow Project Submissions" checked={!!settings.luAllowProjectSubmissions} disabled={!canEdit} onChange={(v) => patch("luAllowProjectSubmissions", v)} />
            <ToggleRow label="Allow Resubmissions" checked={!!settings.luAllowResubmissions} disabled={!canEdit} onChange={(v) => patch("luAllowResubmissions", v)} />
            <ToggleRow label="Enable Auto Grading" checked={!!settings.luEnableAutoGrading} disabled={!canEdit} onChange={(v) => patch("luEnableAutoGrading", v)} />
          </CardContent>
        </Card>
      )}

      {/* SECURITY */}
      {tab === "security" && (
        <Card>
          <CardHeader><CardTitle>Security Settings</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Session Timeout (minutes)"><Input disabled={!canEdit} type="number" value={Number(settings.sessionTimeoutMinutes ?? 1440)} onChange={(e) => patch("sessionTimeoutMinutes", Number(e.target.value))} /></Field>
            <Field label="JWT Expiry (hours)"><Input disabled={!canEdit} type="number" value={Number(settings.jwtExpiryHours ?? 168)} onChange={(e) => patch("jwtExpiryHours", Number(e.target.value))} /></Field>
            <Field label="Max Login Attempts"><Input disabled={!canEdit} type="number" value={Number(settings.maxLoginAttempts ?? 5)} onChange={(e) => patch("maxLoginAttempts", Number(e.target.value))} /></Field>
            <Field label="Min Password Length"><Input disabled={!canEdit} type="number" value={Number(settings.passwordMinLength ?? 8)} onChange={(e) => patch("passwordMinLength", Number(e.target.value))} /></Field>
            <ToggleRow label="Require Number in Password" checked={!!settings.requirePasswordNumber} disabled={!canEdit} onChange={(v) => patch("requirePasswordNumber", v)} />
            <ToggleRow label="Require Special Character" checked={!!settings.requirePasswordSpecial} disabled={!canEdit} onChange={(v) => patch("requirePasswordSpecial", v)} />
            <ToggleRow label="Rate Limiting" checked={!!settings.rateLimitingEnabled} disabled={!canEdit} onChange={(v) => patch("rateLimitingEnabled", v)} />
            <ToggleRow label="CAPTCHA" checked={!!settings.captchaEnabled} disabled={!canEdit} onChange={(v) => patch("captchaEnabled", v)} />
          </CardContent>
        </Card>
      )}

      {/* EMAIL */}
      {tab === "email" && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>SMTP Configuration</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="SMTP Host"><Input disabled={!canEdit} value={String(settings.smtpHost ?? "")} onChange={(e) => patch("smtpHost", e.target.value)} placeholder="smtp.gmail.com" /></Field>
              <Field label="SMTP Port"><Input disabled={!canEdit} type="number" value={Number(settings.smtpPort ?? 587)} onChange={(e) => patch("smtpPort", Number(e.target.value))} /></Field>
              <Field label="Username"><Input disabled={!canEdit} value={String(settings.smtpUsername ?? "")} onChange={(e) => patch("smtpUsername", e.target.value)} /></Field>
              <Field label="Password"><Input disabled={!canEdit} type="password" value={String(settings.smtpPassword ?? "")} onChange={(e) => patch("smtpPassword", e.target.value)} placeholder={canEdit ? "Enter SMTP password" : "••••••••"} /></Field>
            </CardContent>
          </Card>
          {canEditSuper && (
            <Card>
              <CardHeader><CardTitle>Test Email</CardTitle></CardHeader>
              <CardContent className="flex gap-3">
                <Input placeholder="recipient@email.com" value={testEmailTo} onChange={(e) => setTestEmailTo(e.target.value)} className="max-w-xs" />
                <Button onClick={() => testEmail.mutate()} disabled={!testEmailTo || testEmail.isPending}>Send Test</Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* SYSTEM HEALTH */}
      {tab === "health" && healthData && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => refetchHealth()}><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: "Backend", status: healthData.backend?.status },
              { label: "Database", status: healthData.database?.status },
              { label: "AI", status: healthData.ai?.status },
              { label: "Payments", status: healthData.payments?.status },
            ].map((item) => (
              <Card key={item.label}>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{item.label}</CardTitle></CardHeader>
                <CardContent><span className={cn("font-semibold capitalize", item.status === "healthy" || item.status === "configured" || item.status === "running" ? "text-green-600" : "text-amber-600")}>{item.status}</span></CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle>Metrics</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
              <p>Storage: {healthData.storage?.mb ?? 0} MB</p>
              <p>Active users (1h): {healthData.activeUsers ?? 0}</p>
              <p>Failed logins (24h): {healthData.failedLogins24h ?? 0}</p>
              <p>AI requests (month): {healthData.aiUsage?.monthlyRequests ?? 0}</p>
              <p>Uptime: {Math.round(healthData.backend?.uptime ?? 0)}s</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Services</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {healthData.services?.map((s: any) => (
                  <li key={s.name} className="flex justify-between text-sm border-b py-2 last:border-0">
                    <span>{s.name}</span>
                    <span className="capitalize text-muted-foreground">{s.status}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {canEdit && tab !== "profile" && tab !== "health" && (
        <div className="flex gap-3 pt-4 border-t">
          <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending || Object.keys(form).length === 0 || (tab === "payments" && !feeValid)}>
            {saveSettings.isPending ? "Saving..." : "Save Settings"}
          </Button>
          <Button variant="outline" onClick={() => { setForm({}); refetchSettings(); }}>Reset Changes</Button>
        </div>
      )}
    </div>
  );
}
