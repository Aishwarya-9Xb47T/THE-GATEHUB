import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Eye, EyeOff, Lock, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToastStore } from "@/store/toastStore";
import { BrandHomeButton } from "@/components/common/Logo";

const schema = z.object({
  password: z.string().min(8, "At least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});
type Form = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const toast = useToastStore((s) => s.add);
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: Form) => {
    if (!token) {
      toast({ title: "Invalid token", description: "Reset token is missing from the URL", variant: "destructive" });
      return;
    }

    setLoading(true);
    const res = await api("/auth/reset-password", { 
      method: "POST", 
      body: { token, password: data.password, confirmPassword: data.confirmPassword } 
    });
    setLoading(false);

    if (res.error) {
      toast({ title: "Error", description: res.error, variant: "destructive" });
    } else {
      setSuccess(true);
      toast({ title: "Success!", description: "Password reset successful.", variant: "success" });
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md text-center p-8 space-y-4">
          <CardTitle className="text-red-500">Invalid Link</CardTitle>
          <p className="text-muted-foreground">This password reset link is invalid or has expired.</p>
          <Button asChild className="w-full">
            <Link to="/forgot-password">Request New Link</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/20">
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[20%] -right-[10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px]" />
        <div className="absolute top-[80%] -left-[10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="mb-8 w-full max-w-md flex justify-center">
          <BrandHomeButton className="flex justify-center" />
        </div>
        
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-md">
          <Card className="border border-border/50 shadow-2xl bg-card/60 backdrop-blur-xl">
            <CardHeader className="space-y-1 text-center pb-6">
              <CardTitle className="text-h2 font-display">New Password</CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                {success ? "Success!" : "Set your new secure password"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!success ? (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="password">New Password</Label>
                    <div className="relative group">
                      <Input 
                        id="password" 
                        type={showPassword ? "text" : "password"} 
                        className="h-12 pl-11 pr-12 rounded-xl bg-background/50 focus:bg-background transition-colors" 
                        {...register("password")} 
                      />
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
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

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <div className="relative group">
                      <Input 
                        id="confirmPassword" 
                        type={showConfirmPassword ? "text" : "password"} 
                        className="h-12 pl-11 pr-12 rounded-xl bg-background/50 focus:bg-background transition-colors" 
                        {...register("confirmPassword")} 
                      />
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
                      >
                        {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    {errors.confirmPassword && <p className="text-sm text-red-500 font-medium">{errors.confirmPassword.message}</p>}
                  </div>

                  <Button type="submit" className="w-full h-12 text-lg rounded-xl font-semibold shadow-lg hover:shadow-primary/30 transition-all hover:-translate-y-0.5" disabled={loading}>
                    {loading ? "Resetting..." : "Reset Password"}
                  </Button>
                </form>
              ) : (
                <div className="text-center space-y-6 py-4">
                  <div className="flex justify-center">
                    <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center">
                      <CheckCircle2 className="w-10 h-10 text-green-500" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-lg font-bold text-foreground">Password Reset!</p>
                    <p className="text-sm text-muted-foreground">
                      Your password has been successfully updated. You can now log in with your new credentials.
                    </p>
                  </div>
                  <Button className="w-full h-12 rounded-xl" asChild>
                    <Link to="/login">Go to Login</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
