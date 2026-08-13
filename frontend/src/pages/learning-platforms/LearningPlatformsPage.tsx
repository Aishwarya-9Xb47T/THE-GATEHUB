import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Globe,
  Sparkles,
  ExternalLink,
  Gamepad2,
  CheckCircle2,
  Lock,
  Zap,
  ArrowRight,
  HelpCircle,
  GraduationCap,
  Layers,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToastStore } from "@/store/toastStore";
import { useUserStore } from "@/store/userStore";
import { apiUrl } from "@/lib/api";

interface Platform {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  status: "active" | "coming_soon" | "beta";
  badge?: string;
  websiteUrl: string;
  features: string[];
  color: string;
}

export function LearningPlatformsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToastStore((s) => s.add);
  const { user } = useUserStore();
  const [quickCode, setQuickCode] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Determine base route (/instructor/learning-platforms vs /student/learning-platforms vs /admin/learning-platforms)
  const isInstructor = location.pathname.startsWith("/instructor");
  const isStudent = location.pathname.startsWith("/student");
  const isPageAdmin = location.pathname.startsWith("/admin");

  const basePrefix = isInstructor
    ? "/instructor/learning-platforms"
    : isStudent
      ? "/student/learning-platforms"
      : isPageAdmin
        ? "/admin/learning-platforms"
        : "/instructor/learning-platforms";

  useEffect(() => {
    async function fetchPlatforms() {
      try {
        const res = await fetch(apiUrl("/api/learning-platforms/platforms"));
        const json = await res.json();
        if (json.success && json.data?.platforms) {
          setPlatforms(json.data.platforms);
        }
      } catch (err: any) {
        console.error("Failed to load learning platforms", err);
      } finally {
        setIsLoading(false);
      }
    }
    void fetchPlatforms();
  }, []);

  const handleLaunchWayground = (view = "dashboard") => {
    navigate(`${basePrefix}/wayground?view=${view}`);
  };

  const handleQuickJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCode.trim()) {
      toast({
        title: "Please enter a valid join code",
        variant: "destructive",
      });
      return;
    }
    const cleanCode = quickCode.trim();
    navigate(`${basePrefix}/wayground?view=join&code=${encodeURIComponent(cleanCode)}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-purple-900/40 via-indigo-900/30 to-blue-900/40 border border-purple-500/20 p-6 md:p-10 shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-12 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-4 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-semibold tracking-wide uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            External Learning Workspaces
          </div>

          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white">
            Learning Platforms Hub
          </h1>

          <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
            Access interactive learning platforms, gamified assessment tools, flashcards, and external LMS workspaces directly inside <span className="text-purple-400 font-semibold">THE GATEHUB</span>.
          </p>

          {/* Quick Join Bar for Wayground */}
          <div className="pt-2">
            <form onSubmit={handleQuickJoin} className="flex flex-col sm:flex-row items-center gap-3 bg-background/80 backdrop-blur-md p-2 rounded-2xl border border-white/10 max-w-xl">
              <div className="flex items-center gap-2 px-3 text-muted-foreground w-full sm:w-auto">
                <Gamepad2 className="w-5 h-5 text-purple-400 shrink-0" />
                <span className="text-xs font-semibold whitespace-nowrap">Join Quiz:</span>
              </div>
              <Input
                placeholder="Enter Wayground Join Code..."
                value={quickCode}
                onChange={(e) => setQuickCode(e.target.value)}
                className="bg-transparent border-none text-foreground placeholder:text-muted-foreground focus-visible:ring-0 text-sm font-mono tracking-wider"
              />
              <Button type="submit" className="w-full sm:w-auto bg-purple-600 hover:bg-purple-500 text-white rounded-xl px-6 font-semibold shadow-lg shadow-purple-600/30 shrink-0">
                Join Game <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Featured Platform: Wayground */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Globe className="w-5 h-5 text-purple-400" />
            Featured Integration
          </h2>
          <Badge variant="outline" className="border-purple-500/30 text-purple-400 bg-purple-500/10 px-3 py-1">
            LTI 1.3 Advantage Ready
          </Badge>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-3xl bg-card border border-purple-500/30 p-6 md:p-8 shadow-xl overflow-hidden group hover:border-purple-500/50 transition-all duration-300"
        >
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-pink-500/10 via-purple-500/10 to-transparent blur-3xl pointer-events-none" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-pink-500/30">
                  W
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-extrabold text-foreground">Wayground</h3>
                    <span className="text-xs text-muted-foreground font-mono bg-purple-500/10 border border-purple-500/20 rounded-md px-2 py-0.5">
                      formerly Quizizz
                    </span>
                  </div>
                  <p className="text-sm text-purple-400 font-medium">
                    Gamified Assessments, Flashcards, & Interactive Lessons
                  </p>
                </div>
              </div>

              <p className="text-muted-foreground text-sm leading-relaxed">
                Wayground provides millions of community & curriculum-aligned quizzes, spaced-repetition flashcards, interactive slides, and real-time live battle games. Seamlessly embedded inside THE GATEHUB so you never lose your flow.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  "In-App Embedded Workspace",
                  "Flashcard Decks & Spaced Practice",
                  "Curriculum-Aligned Assessments",
                  "Single Sign-On (SSO) Support",
                  "LTI 1.3 Gradebook Sync",
                  "Live Quiz Join Arena",
                ].map((feat, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-foreground/90 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  onClick={() => handleLaunchWayground("dashboard")}
                  className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-bold px-6 py-5 rounded-2xl shadow-lg shadow-purple-500/25"
                >
                  <Sparkles className="w-4 h-4 mr-2" /> Launch Wayground Workspace
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleLaunchWayground("join")}
                  className="border-purple-500/30 text-purple-300 hover:bg-purple-500/10 rounded-2xl py-5 font-semibold"
                >
                  <Gamepad2 className="w-4 h-4 mr-2 text-purple-400" /> Student Join Portal
                </Button>
                <a
                  href="https://wayground.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
                >
                  Visit Website <ExternalLink className="w-3.5 h-3.5 ml-1" />
                </a>
              </div>
            </div>

            {/* Visual Workspace Preview Card */}
            <div className="lg:col-span-5 bg-background/60 rounded-2xl border border-white/10 p-5 space-y-4 backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  Workspace Active Status
                </div>
                <Badge variant="secondary" className="text-[10px] bg-purple-500/20 text-purple-300 border-none">
                  CONNECTED
                </Badge>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs bg-card/60 p-3 rounded-xl border border-white/5">
                  <span className="text-muted-foreground">User Session</span>
                  <span className="font-semibold text-foreground">{user?.email || "Authenticated User"}</span>
                </div>
                <div className="flex items-center justify-between text-xs bg-card/60 p-3 rounded-xl border border-white/5">
                  <span className="text-muted-foreground">Embedding Mode</span>
                  <span className="font-semibold text-purple-300">Inline Sandbox + LTI 1.3</span>
                </div>
                <div className="flex items-center justify-between text-xs bg-card/60 p-3 rounded-xl border border-white/5">
                  <span className="text-muted-foreground">Platform Context</span>
                  <span className="font-semibold text-emerald-400">THE GATEHUB Integrated</span>
                </div>
              </div>

              <Button
                variant="ghost"
                onClick={() => handleLaunchWayground("flashcards")}
                className="w-full text-xs text-purple-300 hover:bg-purple-500/10 rounded-xl justify-between"
              >
                <span>Browse Wayground Flashcards</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Extensible Platforms Catalog */}
      <section className="space-y-4 pt-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-400" />
            Extensible Platform Ecosystem
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            THE GATEHUB architecture easily expands to connect leading learning management systems & platforms.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              name: "Khan Academy",
              tagline: "Free World-Class Education",
              description: "Interactive math, science & humanities practice problems and skill trees.",
              status: "Coming Soon",
              badge: "Planned",
              color: "from-emerald-500/10 to-teal-500/10 border-emerald-500/20",
              icon: GraduationCap,
            },
            {
              name: "Moodle LMS",
              tagline: "Open-Source Learning Management",
              description: "Connect institutional course materials, assignments, and forums via LTI 1.3.",
              status: "LTI Bridge Planned",
              badge: "LTI 1.3",
              color: "from-amber-500/10 to-orange-500/10 border-amber-500/20",
              icon: BookOpen,
            },
            {
              name: "Canvas LMS",
              tagline: "Enterprise Educational Platform",
              description: "Deep integration with Instructure Canvas modules and speedgrader.",
              status: "Enterprise Planned",
              badge: "Enterprise",
              color: "from-rose-500/10 to-pink-500/10 border-rose-500/20",
              icon: Layers,
            },
            {
              name: "Coursera for Campus",
              tagline: "Guided Projects & Certificates",
              description: "Track external certification modules and University skill credits.",
              status: "Partner Track",
              badge: "Explore",
              color: "from-blue-500/10 to-cyan-500/10 border-blue-500/20",
              icon: Globe,
            },
          ].map((item, idx) => {
            const IconComponent = item.icon;
            return (
              <div
                key={idx}
                className={`rounded-2xl bg-card border p-5 space-y-4 flex flex-col justify-between hover:border-foreground/20 transition-all ${item.color}`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-background/80 flex items-center justify-center border border-white/10 text-foreground">
                      <IconComponent className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <Badge variant="secondary" className="text-[10px] bg-background/60 text-muted-foreground border-white/10">
                      {item.badge}
                    </Badge>
                  </div>

                  <div>
                    <h3 className="font-bold text-base text-foreground">{item.name}</h3>
                    <p className="text-xs text-purple-400/90 font-medium">{item.tagline}</p>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5 text-[11px]">
                    <Lock className="w-3 h-3" /> {item.status}
                  </span>
                  <Button variant="ghost" size="sm" disabled className="h-7 text-[11px] opacity-60">
                    Notify Me
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
