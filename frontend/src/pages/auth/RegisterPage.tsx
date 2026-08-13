import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Eye, EyeOff, Sparkles } from "lucide-react";
import { useUserStore, getHomeRoute } from "@/store/userStore";
import { useToastStore } from "@/store/toastStore";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GlobalFooter } from "@/components/common/GlobalFooter";
import { BrandHomeButton } from "@/components/common/Logo";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";

const ROLE_LABELS: Record<string, string> = {
  student: "Student",
  instructor: "Instructor",
  admin: "Admin",
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const baseSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(100, "First name too long"),
    lastName: z.string().trim().min(1, "Last name is required").max(100, "Last name too long"),
    email: z.string().trim().email("Please enter a valid email address").max(254, "Email too long"),
    confirmEmail: z.string().trim().email("Please enter a valid confirmation email").max(254, "Email too long"),
    password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password must not exceed 128 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password").max(128),
    role: z.string().min(1, "Role is required"),
  })
  .refine((data) => normalizeEmail(data.email) === normalizeEmail(data.confirmEmail), {
    message: "Email addresses do not match",
    path: ["confirmEmail"],
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type Form = z.infer<typeof baseSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const { setUser, setToken } = useUserStore();
  const toast = useToastStore((s) => s.add);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [allowedRoles, setAllowedRoles] = useState<string[]>(["student", "instructor"]);
  const [showEmailForm, setShowEmailForm] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(baseSchema),
    defaultValues: { role: "student" },
  });
  const role = watch("role");

  useEffect(() => {
    api<{ roles: string[] }>("/auth/registration-options").then((res) => {
      if (res.data?.roles?.length) {
        setAllowedRoles(res.data.roles);
      }
    });
  }, []);

  const handleBlockedClipboard = (e: React.ClipboardEvent) => {
    e.preventDefault();
    toast({
      title: "Clipboard Action Restricted",
      description: "Please enter this information manually.",
    });
  };

  const onSubmit = async (data: Form) => {
    if (submittingRef.current || loading) return;

    if (!allowedRoles.includes(data.role)) {
      toast({ title: "Error", description: "Invalid role selected", variant: "destructive" });
      return;
    }

    submittingRef.current = true;
    setLoading(true);

    try {

      const { confirmEmail: _ce, confirmPassword: _cp, ...registerData } = data;
      const payload = {
        ...registerData,
        email: normalizeEmail(data.email),
        confirmEmail: normalizeEmail(data.confirmEmail),
        confirmPassword: data.confirmPassword,
      };

      const res = await api<{
        user: any;
        token: string;
        requiresEmailVerification?: boolean;
        message?: string;
      }>("/auth/register", {
        method: "POST",
        body: payload,
      });

      if (res.error) {
        toast({ title: "Registration failed", description: res.error, variant: "destructive" });
        return;
      }

      if (res.data?.requiresEmailVerification || (!res.data?.token && res.data?.message)) {
        toast({
          title: "Check your email",
          description: res.data.message || "Verify your email to finish creating your account.",
          variant: "success",
        });
        navigate("/login", { replace: true });
        return;
      }

      if (res.data?.user && res.data?.token) {
        setToken(res.data.token);
        setUser(res.data.user);
        navigate(getHomeRoute(res.data.user.role), { replace: true });
        toast({ title: "Account created!", variant: "success" });
      }
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/20">
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[20%] -right-[10%] w-[50%] h-[50%] bg-brand-purple/12 rounded-full blur-[120px]" />
        <div className="absolute top-[80%] -left-[10%] w-[40%] h-[40%] bg-brand-blue/10 rounded-full blur-[120px]" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 py-8">
        <div className="mb-8 w-full max-w-lg flex justify-center">
          <BrandHomeButton className="flex justify-center" size="xl" />
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-lg">
          <Card className="shadow-2xl bg-card/70 backdrop-blur-xl">
            {/* Gradient accent top bar */}
            <div className="h-1 w-full rounded-t-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500" />

            <CardHeader className="space-y-1 text-center pb-4 pt-7">
              <CardTitle className="text-h2 font-display text-foreground">Create your account</CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                Join the world-class learning platform
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              {/* ── Google OAuth — Preferred Path ────────────────────── */}
              <div className="space-y-2">
                <GoogleAuthButton label="Continue with Google — it's free" />
                <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  No password needed — sign up in one click
                </p>
              </div>

              {/* OR Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/60" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card/70 px-3 text-muted-foreground font-medium tracking-wider">or create with email</span>
                </div>
              </div>

              {/* ── Email Form — Secondary Path (collapsible) ─────────── */}
              {!showEmailForm ? (
                <button
                  type="button"
                  onClick={() => setShowEmailForm(true)}
                  className="w-full text-sm text-center text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  Use email and password instead
                </button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName" className="font-semibold">First name</Label>
                        <Input id="firstName" className="h-12 px-4 rounded-xl bg-background/50" {...register("firstName")} />
                        {errors.firstName && <p className="text-sm text-red-500 font-medium">{errors.firstName.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName" className="font-semibold">Last name</Label>
                        <Input id="lastName" className="h-12 px-4 rounded-xl bg-background/50" {...register("lastName")} />
                        {errors.lastName && <p className="text-sm text-red-500 font-medium">{errors.lastName.message}</p>}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="email" className="font-semibold">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          autoComplete="email"
                          placeholder="you@example.com"
                          className="h-12 px-4 rounded-xl bg-background/50"
                          onPaste={handleBlockedClipboard}
                          onCopy={handleBlockedClipboard}
                          onCut={handleBlockedClipboard}
                          {...register("email")}
                        />
                        {errors.email && <p className="text-sm text-red-500 font-medium">{errors.email.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirmEmail" className="font-semibold">Confirm Email</Label>
                        <Input
                          id="confirmEmail"
                          type="email"
                          autoComplete="email"
                          placeholder="you@example.com"
                          className="h-12 px-4 rounded-xl bg-background/50"
                          onPaste={handleBlockedClipboard}
                          onCopy={handleBlockedClipboard}
                          onCut={handleBlockedClipboard}
                          {...register("confirmEmail")}
                        />
                        {errors.confirmEmail && <p className="text-sm text-red-500 font-medium">{errors.confirmEmail.message}</p>}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="password" className="font-semibold">Password</Label>
                        <div className="relative group">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="new-password"
                            className="h-12 pl-4 pr-12 rounded-xl bg-background/50 focus:bg-background transition-colors"
                            onPaste={handleBlockedClipboard}
                            onCopy={handleBlockedClipboard}
                            onCut={handleBlockedClipboard}
                            {...register("password")}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                          </button>
                        </div>
                        {errors.password && <p className="text-sm text-red-500 font-medium">{errors.password.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword" className="font-semibold">Confirm Password</Label>
                        <div className="relative group">
                          <Input
                            id="confirmPassword"
                            type={showConfirmPassword ? "text" : "password"}
                            autoComplete="new-password"
                            className="h-12 pl-4 pr-12 rounded-xl bg-background/50 focus:bg-background transition-colors"
                            onPaste={handleBlockedClipboard}
                            onCopy={handleBlockedClipboard}
                            onCut={handleBlockedClipboard}
                            {...register("confirmPassword")}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
                            aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                          >
                            {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                          </button>
                        </div>
                        {errors.confirmPassword && <p className="text-sm text-red-500 font-medium">{errors.confirmPassword.message}</p>}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-semibold">I am a</Label>
                      <Select value={role} onValueChange={(v) => setValue("role", v)}>
                        <SelectTrigger className="h-12 px-4 rounded-xl bg-background/50">
                          <SelectValue placeholder="Role" />
                        </SelectTrigger>
                        <SelectContent>
                          {allowedRoles.map((r) => (
                            <SelectItem key={r} value={r}>{ROLE_LABELS[r] ?? r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {allowedRoles.includes("admin") && (
                      <p className="text-xs text-muted-foreground text-center">
                        Super admin accounts are created automatically on server startup — use Login with your super admin email.
                      </p>
                    )}
                    <Button
                      type="submit"
                      className="w-full h-12 text-lg rounded-xl transition-all hover:-translate-y-0.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 font-semibold shadow-md"
                      disabled={loading}
                    >
                      {loading ? "Creating account..." : "Create account"}
                    </Button>
                  </form>
                </motion.div>
              )}

              <p className="text-center text-sm font-medium text-muted-foreground">
                Already have an account? <Link to="/login" className="text-primary hover:text-primary/80 transition-colors font-semibold">Sign in</Link>
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <GlobalFooter />
    </div>
  );
}

