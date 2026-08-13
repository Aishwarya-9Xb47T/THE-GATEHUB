import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TourStep {
  target: string;
  title: string;
  content: string;
}

const TOURS: Record<string, { key: string; steps: TourStep[] }> = {
  student: {
    key: "onboarding-student-v1",
    steps: [
      { target: "[data-tour='dashboard']", title: "Dashboard", content: "Your home base for courses and progress." },
      { target: "[data-tour='my-courses']", title: "My Courses", content: "Access all enrolled courses here." },
      { target: "[data-tour='browse']", title: "Browse & Learning Universes", content: "Discover courses and structured Learning Universes." },
      { target: "[data-tour='certificates']", title: "Certificates", content: "Download earned certificates." },
    ],
  },
  instructor: {
    key: "onboarding-instructor-v1",
    steps: [
      { target: "[data-tour='create-course']", title: "Create Course", content: "Start a traditional video course with sections, lectures, and quizzes." },
      { target: "[data-tour='create-lu']", title: "Create Learning Universe", content: "Build structured paths with Visual or Academic Authoring Studio." },
      { target: "[data-tour='my-courses']", title: "My Courses", content: "Manage and publish your courses and Learning Universes." },
      { target: "[data-tour='project-reviews']", title: "Review Projects", content: "Grade student GitHub, Colab, and file submissions." },
    ],
  },
  admin: {
    key: "onboarding-admin-v1",
    steps: [
      { target: "[data-tour='users']", title: "Users", content: "Manage platform users and roles." },
      { target: "[data-tour='analytics']", title: "Analytics", content: "Platform-wide metrics." },
      { target: "[data-tour='payments']", title: "Payments", content: "Monitor transactions." },
      { target: "[data-tour='settings']", title: "Settings", content: "Configure AI, certificates, and more." },
    ],
  },
};

export function OnboardingTour({ role }: { role: "student" | "instructor" | "admin" }) {
  const tour = TOURS[role];
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!tour) return;
    if (localStorage.getItem(tour.key)) return;
    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, [tour]);

  if (!visible || !tour) return null;

  const current = tour.steps[step];
  const finish = () => {
    localStorage.setItem(tour.key, "done");
    setVisible(false);
  };

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      <div className="absolute inset-0 bg-black/40 pointer-events-auto" />
      <div className={cn(
        "absolute bottom-8 left-1/2 -translate-x-1/2 w-[min(90vw,400px)] pointer-events-auto",
        "bg-background border border-border rounded-xl shadow-2xl p-5",
      )}>
        <div className="flex justify-between items-start mb-2">
          <p className="text-xs text-muted-foreground">Step {step + 1} of {tour.steps.length}</p>
          <Button variant="ghost" size="icon" className="h-6 w-6 -mt-1" onClick={finish}><X className="w-4 h-4" /></Button>
        </div>
        <h3 className="font-semibold mb-1">{current.title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{current.content}</p>
        <div className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={finish}>Skip tour</Button>
          {step < tour.steps.length - 1 ? (
            <Button size="sm" onClick={() => setStep((s) => s + 1)} className="gap-1">
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button size="sm" onClick={finish}>Get started</Button>
          )}
        </div>
      </div>
    </div>
  );
}
