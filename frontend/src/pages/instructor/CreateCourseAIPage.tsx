import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useToastStore } from "@/store/toastStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sparkles, Loader2, GraduationCap, CheckCircle2, ArrowLeft } from "lucide-react";
import type { AuthoringPackage } from "./courseAuthoringTypes";

export function CreateCourseAIPage() {
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.add);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [generationStep, setGenerationStep] = useState("");

  const handleAiGenerate = async () => {
    if (!aiTopic.trim()) {
      toast({
        title: "Topic required",
        description: "Enter a course topic (e.g. Deep Learning, Advanced React).",
        variant: "destructive",
      });
      return;
    }
    setIsAiGenerating(true);
    setGenerationStep("Designing industry-standard curriculum...");
    try {
      const res = await api<{ data: { authoringPackage: AuthoringPackage; thumbnailUrl?: string } }>(
        "/courses/ai-authoring-preview",
        { method: "POST", body: { topic: aiTopic.trim() } }
      );
      if (res.error) throw new Error(res.error);

      const pkg = res.data?.data?.authoringPackage;
      if (!pkg) throw new Error("No authoring data returned");

      setGenerationStep("Populating course form...");
      toast({
        title: "Course authored by AI",
        description: `${pkg.curriculum.length} modules generated. Review and edit before creating.`,
        variant: "success",
      });

      navigate("/instructor/courses/new/manual", {
        state: { authoringPackage: pkg, thumbnailUrl: res.data?.data?.thumbnailUrl },
      });
    } catch (e: any) {
      toast({ title: "AI Authoring Failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsAiGenerating(false);
      setGenerationStep("");
    }
  };

  return (
    <div className="w-full min-w-0 space-y-8 pb-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/instructor/courses/new">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="page-title tracking-tight text-foreground">AI Course Authoring</h1>
        <p className="mt-2 text-muted-foreground">
          Generate a complete professional course, then review and publish on the manual form.
        </p>
      </div>

      <Card className="border-border/40 shadow-xl shadow-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-primary" />
            AI Course Authoring Assistant
          </CardTitle>
          <CardDescription>
            Enter a topic and AI will generate course details, curriculum, quizzes, projects, and resources.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label className="text-base font-bold">Course Topic</Label>
            <Input
              placeholder="e.g. Deep Learning, Advanced React, Operating Systems"
              className="h-14 text-lg rounded-xl border-primary/20"
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              disabled={isAiGenerating}
              onKeyDown={(e) => e.key === "Enter" && handleAiGenerate()}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {["Course Details", "8-10 Modules", "Quizzes & Exams", "Projects & Resources"].map((item) => (
              <div key={item} className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 text-primary">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                {item}
              </div>
            ))}
          </div>

          {isAiGenerating && generationStep && (
            <p className="text-sm text-muted-foreground animate-pulse">{generationStep}</p>
          )}

          <Button
            className="w-full h-14 text-lg font-bold rounded-xl bg-gradient-to-r from-primary to-blue-600"
            onClick={handleAiGenerate}
            disabled={isAiGenerating || !aiTopic.trim()}
          >
            {isAiGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Authoring Course...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 mr-2" />
                Generate Complete Course
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
