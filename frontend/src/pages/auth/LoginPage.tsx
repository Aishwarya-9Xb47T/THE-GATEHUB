import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { useUserStore, getHomeRoute } from "@/store/userStore";
import { useToastStore } from "@/store/toastStore";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GlobalFooter } from "@/components/common/GlobalFooter";
import { BrandHomeButton } from "@/components/common/Logo";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
type Form = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser, setToken } = useUserStore();
  const toast = useToastStore((s) => s.add);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema) });

  const searchParams = new URLSearchParams(location.search);
  const fromQuery = searchParams.get("from") || searchParams.get("redirect") || undefined;
  const fromState =
    typeof (location.state as { from?: string } | null)?.from === "string" &&
    (location.state as { from: string }).from &&
    !(location.state as { from: string }).from.startsWith("/login")
      ? (location.state as { from: string }).from
      : undefined;
  const returnTo =
    (fromState || fromQuery) && !(fromState || fromQuery)!.startsWith("/login")
      ? (fromState || fromQuery)
      : undefined;

  const onSubmit = async (data: Form) => {
    setLoading(true);
    setServerError(null);
    const res = await api<{ user: any; token: string; message?: string }>("/auth/login", { method: "POST", body: data });
    setLoading(false);
    
    if (res.error) {
      const errorMessage = res.error;
      setServerError(errorMessage);
      const title =
        /verify your email/i.test(errorMessage)
          ? "Email not verified"
          : /too many/i.test(errorMessage)
            ? "Too many attempts"
            : /locked/i.test(errorMessage)
              ? "Account locked"
              : "Sign-in failed";
      toast({ title, description: errorMessage, variant: "destructive" });
      return;
    }
    if (res.data?.user && res.data?.token) {
      setUser(res.data.user);
      setToken(res.data.token);
      const redirectTo = returnTo ?? getHomeRoute(res.data.user.role);
      navigate(redirectTo, { replace: true });
      toast({ title: "Welcome back!", variant: "success" });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/20">
      {/* Decorative blurry gradients background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-brand-indigo/15 rounded-full blur-[120px]" />
        <div className="absolute top-[60%] -right-[10%] w-[40%] h-[60%] bg-brand-blue/10 rounded-full blur-[120px]" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 pb-12">
        <div className="mb-8 w-full max-w-md flex justify-center">
          <BrandHomeButton className="w-full max-w-md flex justify-center" size="xl" />
        </div>
        
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-md">
          <Card className="shadow-2xl bg-card/70 backdrop-blur-xl">
            {/* Gradient accent top bar */}
            <div className="h-1 w-full rounded-t-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500" />

            <CardHeader className="space-y-1 text-center pb-6 pt-7">
              <CardTitle className="text-h2 font-display text-foreground">Welcome back</CardTitle>
              <CardDescription className="text-base text-muted-foreground">Sign in to your THE GATEHUB account</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* ── Google OAuth — Primary Path ─────────────────────────── */}
              <GoogleAuthButton returnTo={returnTo} />

              {/* OR Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/60" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card/70 px-3 text-muted-foreground font-medium tracking-wider">or continue with email</span>
                </div>
              </div>

              {/* ── Email / Password — Secondary Path ───────────────────── */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="font-semibold">Email</Label>
                  <Input id="email" type="email" placeholder="you@example.com" className="h-12 px-4 rounded-xl bg-background/50" {...register("email")} />
                  {errors.email && <p className="text-sm text-red-500 font-medium">{errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="font-semibold">Password</Label>
                    <Link to="/forgot-password" className="text-xs font-bold text-primary hover:underline underline-offset-4">
                      Forgot Password?
                    </Link>
                  </div>
                  <div className="relative group">
                    <Input 
                      id="password" 
                      type={showPassword ? "text" : "password"} 
                      className="h-12 pl-4 pr-12 rounded-xl bg-background/50 focus:bg-background transition-colors" 
                      {...register("password")} 
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-sm text-red-500 font-medium">{errors.password.message}</p>}
                </div>

                {serverError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center text-red-500 text-sm font-medium">
                    {serverError}
                  </div>
                )}

                <Button type="submit" className="w-full h-12 text-lg rounded-xl font-semibold shadow-lg hover:shadow-amber-500/30 transition-all hover:-translate-y-0.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600" disabled={loading}>
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </form>

              <p className="text-center text-sm font-medium text-muted-foreground">
                Don&apos;t have an account? <Link to="/register" className="text-primary hover:text-primary/80 transition-colors font-semibold">Create one now</Link>
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
      
      <div className="mt-10">
        <GlobalFooter />
      </div>
    </div>
  );
}
