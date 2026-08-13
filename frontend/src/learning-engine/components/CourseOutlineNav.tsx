import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Download,
  Loader2,
  Trophy,
} from "lucide-react";
import { memo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { LearnerExperiencePackage } from "../types";
import { LessonStepNavigator } from "./LessonStepNavigator";
import { navigableSteps, type NodeProgress } from "../hooks/useLessonProgressTree";

interface CourseOutlineNavProps {
  experience: LearnerExperiencePackage;
  lessonList: Array<{ id: string; title: string; moduleTitle: string }>;
  currentLessonId: string | null;
  currentLessonPercent: number;
  activeStepId: string | null;
  isPreviewMode: boolean;
  earnedCertificate: { id: string; certificateId: string; verificationUrl?: string } | null;
  certEligibility: {
    eligible: boolean;
    pendingRequirements: { label: string; code?: string }[];
    certificateUnavailable?: boolean;
  } | null;
  claimingCert: boolean;
  onNavigateLesson: (lessonId: string) => void;
  onSelectStep: (stepId: string) => void;
  onClaimCertificate: () => void;
  isLessonDone: (lessonId: string) => boolean;
  getStepProgress: (stepId: string) => NodeProgress;
}

export const CourseOutlineNav = memo(function CourseOutlineNav({
  experience,
  lessonList,
  currentLessonId,
  currentLessonPercent,
  activeStepId,
  isPreviewMode,
  earnedCertificate,
  certEligibility,
  claimingCert,
  onNavigateLesson,
  onSelectStep,
  onClaimCertificate,
  isLessonDone,
  getStepProgress,
}: CourseOutlineNavProps) {
  console.log("COURSE OUTLINE RENDERED");
  console.log("Lesson List Count:", lessonList.length);
  console.log("Current Lesson ID:", currentLessonId);
  console.log("Active Step ID:", activeStepId);
  console.log("Is Preview Mode:", isPreviewMode);
  console.log("Publish Version ID:", experience.publishVersionId);
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-4 border-b shrink-0 hidden md:block">
        <h2 className="font-semibold text-sm flex items-center gap-2" id="course-outline-heading">
          <BookOpen className="w-4 h-4" aria-hidden />
          Course outline
        </h2>
      </div>
      <nav className="p-2 space-y-1 flex-1 min-h-0 overflow-y-auto" aria-labelledby="course-outline-heading">
        {lessonList.map((l) => {
          const lessonExp = experience.lessons[l.id];
          const steps = lessonExp ? navigableSteps(lessonExp.steps) : [];
          const isCurrentLesson = currentLessonId === l.id;

          return (
            <div key={l.id}>
              <button
                type="button"
                onClick={() => onNavigateLesson(l.id)}
                aria-current={isCurrentLesson ? "page" : undefined}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isCurrentLesson ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                )}
              >
                {isLessonDone(l.id) ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" aria-hidden />
                ) : (
                  <span className="w-4 h-4 rounded-full border shrink-0" aria-hidden />
                )}
                <span className="truncate flex-1">{l.title}</span>
                <ChevronRight
                  className={cn("w-3.5 h-3.5 shrink-0 transition-transform", isCurrentLesson && "rotate-90")}
                  aria-hidden
                />
              </button>
              {isCurrentLesson && steps.length > 0 && (
                <LessonStepNavigator
                  steps={steps}
                  activeStepId={activeStepId}
                  getStepProgress={getStepProgress}
                  onSelectStep={onSelectStep}
                />
              )}
              {isCurrentLesson && (
                <div className="ml-5 mt-1 mb-2 px-2">
                  <Progress value={currentLessonPercent} className="h-1.5" aria-label={`Lesson progress ${currentLessonPercent}%`} />
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {!isPreviewMode && (
        <div className="p-3 border-t shrink-0 space-y-2">
          {earnedCertificate ? (
            <Button asChild size="sm" className="w-full gap-2">
              <Link to={earnedCertificate.verificationUrl || `/certificates/${earnedCertificate.certificateId}`}>
                <Trophy className="w-4 h-4" />
                View certificate
              </Link>
            </Button>
          ) : certEligibility?.eligible ? (
            <Button type="button" size="sm" className="w-full gap-2" onClick={onClaimCertificate} disabled={claimingCert}>
              {claimingCert ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
              Claim certificate
            </Button>
          ) : certEligibility?.certificateUnavailable ||
            certEligibility?.pendingRequirements?.some((p) => p.code === "not_eligible") ? (
            <p className="text-xs text-muted-foreground text-center px-1">
              This course does not include a certificate.
            </p>
          ) : certEligibility && !certEligibility.eligible ? (
            <p className="text-xs text-muted-foreground text-center px-1">
              Complete the course to unlock your certificate.
            </p>
          ) : null}
          <Button asChild size="sm" variant="outline" className="w-full gap-2">
            <Link to={`/learning-universe/${experience.universe.id}`}>
              <Download className="w-4 h-4" />
              Course home
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
});
