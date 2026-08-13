import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { useUserStore, getHomeRoute } from "@/store/userStore";
import { useToastStore } from "@/store/toastStore";
import { api } from "@/lib/api";

const loginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(1, "Password required"),
});
type LoginForm = z.infer<typeof loginSchema>;

interface AuthGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Callback to run after successful authentication */
  onSuccess?: () => void;
  /** Contextual message explaining why auth is needed */
  message?: string;
  /** The path to redirect to after Google OAuth (optional) */
  returnTo?: string;
}

/**
 * Premium auth gate modal shown when guests attempt restricted actions.
 * Features Google OAuth (primary) + email/password (secondary).
 * Matches modern learning platform UX (Coursera, Udemy, Notion).
 */
export function AuthModal({
  isOpen,
  onClose,
  onSuccess,
  message = "Sign in to continue learning",
  returnTo,
}: AuthGateModalProps) {
  const navigate = useNavigate();
  const { setUser, setToken } = useUserStore();
  const toast = useToastStore((s) => s.add);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const handleClose = () => {
    reset();
    setServerError(null);
    onClose();
  };

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    setServerError(null);
    const res = await api<{ user: any; token: string; message?: string }>("/auth/login", {
      method: "POST",
      body: data,
    });
    setLoading(false);

    if (res.error) {
      setServerError(res.error);
      return;
    }
    if (res.data?.user && res.data?.token) {
      setUser(res.data.user);
      setToken(res.data.token);
      toast({ title: `Welcome back, ${res.data.user.firstName}!`, variant: "success" });
      handleClose();
      onSuccess?.();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl">
        <DialogTitle className="sr-only">Sign in to continue</DialogTitle>

        {/* Decorative gradient top bar */}
        <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500" />

        <AnimatePresence mode="wait">
          <motion.div
            key="auth-gate"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="p-6 sm:p-8"
          >
            {/* Header */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 mb-4">
                <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-foreground font-display">Sign in to continue</h2>
              <p className="text-sm text-muted-foreground mt-1">{message}</p>
            </div>

            {/* Google Button — Primary path */}
            <div className="mb-4">
              <GoogleAuthButton returnTo={returnTo} label="Continue with Google" />
            </div>

            {/* OR Divider */}
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/60" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card/95 px-3 text-muted-foreground font-medium tracking-wider">or</span>
              </div>
            </div>

            {/* Email/Password form — Secondary path */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="gate-email" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Email
                </Label>
                <Input
                  id="gate-email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="h-11 rounded-xl bg-background/50 focus:bg-background transition-colors"
                  {...register("email")}
                />
                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="gate-password" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Password
                  </Label>
                  <Link
                    to="/forgot-password"
                    onClick={handleClose}
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="gate-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="h-11 pl-4 pr-12 rounded-xl bg-background/50 focus:bg-background transition-colors"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
              </div>

              {serverError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-500 text-center">
                  {serverError}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-11 rounded-xl font-semibold bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white shadow-md hover:shadow-amber-500/30 transition-all hover:-translate-y-0.5"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>

            {/* Footer */}
            <p className="mt-5 text-center text-sm text-muted-foreground">
              No account?{" "}
              <Link
                to="/register"
                onClick={handleClose}
                className="text-primary font-semibold hover:underline"
              >
                Create one free
              </Link>
            </p>
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
