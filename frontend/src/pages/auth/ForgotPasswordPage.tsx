import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandHomeButton } from "@/components/common/Logo";

const schema = z.object({
  email: z.string().email("Please enter a valid email address"),
});
type Form = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState(
    "If an account exists for that email, a password reset link has been sent."
  );
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: Form) => {
    setLoading(true);
    try {
      const res = await api<{ message?: string }>("/auth/forgot-password", {
        method: "POST",
        body: data,
      });
      if (res.data?.message) setMessage(res.data.message);
      setSubmitted(true);
    } catch (error: any) {
      console.error("Request failed:", error);
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/20">
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px]" />
        <div className="absolute top-[60%] -right-[10%] w-[40%] h-[60%] bg-blue-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="mb-8 w-full max-w-md flex justify-center">
          <BrandHomeButton className="flex justify-center" />
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-md">
          <Card className="border border-border/50 shadow-2xl bg-card/60 backdrop-blur-xl">
            <CardHeader className="space-y-1 text-center pb-6">
              <CardTitle className="text-h2 font-display">Reset Password</CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                {submitted
                  ? "Check your inbox if an account exists"
                  : "Enter your email to receive a password reset link"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!submitted ? (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="font-semibold">Email Address</Label>
                    <div className="relative group">
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        className="h-12 pl-11 pr-4 rounded-xl bg-background/50 focus:bg-background transition-colors"
                        {...register("email")}
                      />
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    </div>
                    {errors.email && <p className="text-sm text-red-500 font-medium">{errors.email.message}</p>}
                  </div>

                  <Button type="submit" className="w-full h-12 text-lg rounded-xl font-semibold shadow-lg hover:shadow-primary/30 transition-all hover:-translate-y-0.5" disabled={loading}>
                    {loading ? "Sending link..." : "Send Reset Link"}
                  </Button>

                  <Link to="/login" className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Back to login
                  </Link>
                </form>
              ) : (
                <div className="text-center space-y-6 py-4">
                  <div className="flex justify-center">
                    <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center">
                      <CheckCircle2 className="w-10 h-10 text-green-500" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-lg font-bold text-foreground">Request received</p>
                    <p className="text-sm text-muted-foreground mb-4">{message}</p>
                  </div>
                  <Link to="/login" className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Back to login
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
