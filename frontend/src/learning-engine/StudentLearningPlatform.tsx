import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Loader2, Menu, Trophy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import { useLearnNavigation } from "@/hooks/useLearnNavigation";
import { isInstructorLuPreviewPath } from "@/lib/instructorPreview";
import { InstructorPreviewBanner } from "@/components/instructor/InstructorPreviewBanner";
import type { LearnerExperiencePackage, LearnerLessonExperience } from "./types";
import { ExperienceRenderer } from "./renderers/ExperienceRenderer";
import { ComponentStateProvider } from "./hooks/useComponentState";
import { navigableSteps, useLessonProgressTree, getLessonProgressPercent, stepLabel, type NodeProgress } from "./hooks/useLessonProgressTree";
import { useLessonLayout } from "./hooks/useLessonLayout";
import { CourseOutlineNav } from "./components/CourseOutlineNav";
import { CourseOutlineMobileDrawer } from "./components/CourseOutlineSidebar";
import {
  LessonWorkspaceContent,
  LessonWorkspacePane,
  StudentLearnLayout,
} from "./components/StudentLearnLayout";
import { StepNavigationFooter } from "./components/StepNavigationFooter";
import { KeyTakeawaysPanel } from "./components/KeyTakeawaysPanel";
import { RevisionStudyPanel } from "./components/RevisionStudyPanel";
import { WorkspaceHost } from "./workspaces/WorkspaceHost";
import { isWorkspaceStepKind } from "./workspaces/types";
import { useToastStore } from "@/store/toastStore";
import { publishLearningLessonContext } from "@/assistant/learningLessonContext";
import { ThemeToggle } from "@/components/common/ThemeToggle";

function flattenLessons(pkg: LearnerExperiencePackage): Array<{ id: string; title: string; moduleTitle: string }> {
  const list: Array<{ id: string; title: string; moduleTitle: string }> = [];
  for (const track of pkg.outline.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        list.push({ id: lesson.id, title: lesson.title, moduleTitle: mod.title });
      }
    }
  }
  return list;
}

export function StudentLearningPlatform(props?: { universeId?: string }) {
  console.log("STUDENT PLATFORM RENDERED");
  console.log("window.location.pathname:", window.location.pathname);
  console.log("window.location.search:", window.location.search);

  const params = useParams<{ id?: string; courseId?: string; lessonId?: string }>();
  const id = props?.universeId || params.id || params.courseId;
  const routeLessonId = params.lessonId;
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isPreviewMode =
    searchParams.get("preview") === "1" ||
    searchParams.get("instructorPreview") === "1" ||
    isInstructorLuPreviewPath(location.pathname) ||
    location.pathname.startsWith("/instructor/preview");
  const routeStepId = searchParams.get("step");
  const workspaceStepId = searchParams.get("workspace");
  const { goLearn, courseHomePath } = useLearnNavigation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [experience, setExperience] = useState<LearnerExperiencePackage | null>(null);
  const [assets, setAssets] = useState<{ filename: string; storedFilename: string }[]>([]);
  const [currentLessonId, setCurrentLessonId] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  const { isMobile, sidebarOpen, setSidebarOpen, toggleSidebar } = useLessonLayout();
  const mainScrollRef = useRef<HTMLElement>(null);
  const [earnedCertificate, setEarnedCertificate] = useState<{
    id: string;
    certificateId: string;
    verificationUrl?: string;
  } | null>(null);
  const [certEligibility, setCertEligibility] = useState<{
    eligible: boolean;
    pendingRequirements: { label: string; code?: string }[];
    certificateUnavailable?: boolean;
  } | null>(null);
  const [claimingCert, setClaimingCert] = useState(false);
  const [publishVersionId, setPublishVersionId] = useState<string>("");
  const [serverResumeStepId, setServerResumeStepId] = useState<string | null>(null);
  const [continueBanner, setContinueBanner] = useState<string | null>(null);
  const stepTimerRef = useRef<{ stepId: string; startedAt: number } | null>(null);
  const lessonInitRef = useRef<string | null>(null);
  const touchProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const certCheckedRef = useRef(false);
  const loadedUniverseRef = useRef<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const toast = useToastStore((s) => s.add);

  const lessonList = useMemo(() => (experience ? flattenLessons(experience) : []), [experience]);

  const currentLesson: LearnerLessonExperience | null =
    experience && currentLessonId ? experience.lessons[currentLessonId] ?? null : null;

  const lessonSteps = useMemo(
    () => (currentLesson ? navigableSteps(currentLesson.steps) : []),
    [currentLesson]
  );

  // Log experience data when loaded
  if (experience && !loadedUniverseRef.current) {
    loadedUniverseRef.current = id || null;
    console.log("STUDENT PLATFORM DATA");
    console.log("Lesson Count:", lessonList.length);
    console.log("Module Count:", experience.outline.tracks.reduce((sum, t) => sum + t.modules.length, 0));
    console.log("Track Count:", experience.outline.tracks.length);
    console.log("Current Lesson:", currentLessonId || "none");
    console.log("Publish Version ID:", experience.publishVersionId || "none");
  }

  const activeStep = useMemo(
    () => lessonSteps.find((s) => s.id === activeStepId) ?? null,
    [lessonSteps, activeStepId]
  );

  const workspaceOpen = Boolean(
    workspaceStepId && activeStep && workspaceStepId === activeStep.id && isWorkspaceStepKind(activeStep.kind)
  );

  const {
    tree,
    getStepProgress,
    markVisited,
    recordStepEvent,
    getUniversePercent,
    addTimeSpent,
    resumeStepId,
    isLessonFullyComplete,
  } = useLessonProgressTree(
    id ?? "",
    publishVersionId || experience?.publishVersionId || "local",
    experience,
    currentLessonId,
    currentLesson?.steps ?? [],
    { isPreviewMode, syncToServer: !isPreviewMode && !!publishVersionId }
  );

  const currentLessonPercent = useMemo(
    () => (currentLesson ? getLessonProgressPercent(lessonSteps, getStepProgress) : 0),
    [currentLesson, lessonSteps, getStepProgress, tree]
  );

  const localUniversePercent = useMemo(
    () => getUniversePercent(lessonList.map((l) => l.id)),
    [getUniversePercent, lessonList, tree]
  );

  const displayPercent = localUniversePercent;

  const DEFAULT_NODE: NodeProgress = {
    completed: false,
    locked: true,
    visited: false,
    progress: 0,
    timeSpent: 0,
    lastVisited: null,
  };

  const getStepProgressForLesson = useCallback(
    (lessonId: string, stepId: string): NodeProgress => {
      return tree[`${lessonId}:${stepId}`] ?? DEFAULT_NODE;
    },
    [tree]
  );

  const isLessonDone = useCallback(
    (lessonId: string) => {
      const exp = experience?.lessons[lessonId];
      if (!exp) return completedLessonIds.has(lessonId);
      const nav = navigableSteps(exp.steps);
      return (
        getLessonProgressPercent(nav, (sid) => getStepProgressForLesson(lessonId, sid)) === 100
      );
    },
    [experience, completedLessonIds, getStepProgressForLesson]
  );

  const applyProgress = useCallback(
    (prog: {
      lastLessonId?: string | null;
      lastStepId?: string | null;
      publishVersionId?: string | null;
      certificate?: { id: string; certificateId: string } | null;
      progress?: { lessonProgress: { lessonId: string; completed: boolean }[] } | null;
    }) => {
      if (prog.progress?.lessonProgress) {
        const completed = new Set(
          prog.progress.lessonProgress.filter((p) => p.completed).map((p) => p.lessonId)
        );
        setCompletedLessonIds(completed);
      }
      if (prog.publishVersionId) setPublishVersionId(prog.publishVersionId);
      if (prog.certificate) {
        setEarnedCertificate({
          id: prog.certificate.id,
          certificateId: prog.certificate.certificateId,
        });
      }
    },
    []
  );

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    console.log("STUDENT PLATFORM API CALLS");
    console.log("Experience API URL:", `/learning-universes/${id}/experience`);
    console.log("Universe API URL:", `/learning-universes/${id}`);
    console.log("Is Preview Mode:", isPreviewMode);

    try {
      const [expRes, uniRes, progRes] = await Promise.all([
        api<{ success: boolean; data: LearnerExperiencePackage }>(`/learning-universes/${id}/experience`),
        api<{ success: boolean; data: { assets?: { filename: string; storedFilename: string }[] } }>(
          `/learning-universes/${id}`
        ),
        isPreviewMode
          ? Promise.resolve({ data: null as null, error: undefined })
          : api<{
              percentComplete: number;
              lastLessonId: string | null;
              lastStepId: string | null;
              publishVersionId: string | null;
              certificate: { id: string; certificateId: string; issuedAt: string } | null;
              progress: { lessonProgress: { lessonId: string; completed: boolean }[] } | null;
            }>(`/learning-universes/${id}/progress`),
      ]);

      if (expRes.error || !expRes.data?.data) {
        throw new Error(expRes.error || "Could not load learning experience");
      }

      const pkg = expRes.data.data;
      setExperience(pkg);
      if (pkg.publishVersionId) setPublishVersionId(pkg.publishVersionId);
      setAssets(uniRes.data?.data?.assets ?? []);
      loadedUniverseRef.current = id;

      if (!isPreviewMode && !progRes.error && progRes.data) {
        applyProgress(progRes.data);
        const lastStep = progRes.data.lastStepId;
        const resumeLesson =
          routeLessonId && pkg.lessons[routeLessonId]
            ? routeLessonId
            : progRes.data.lastLessonId && pkg.lessons[progRes.data.lastLessonId]
              ? progRes.data.lastLessonId
              : null;
        if (
          lastStep &&
          resumeLesson &&
          pkg.lessons[resumeLesson]?.steps.some((s) => s.id === lastStep)
        ) {
          setServerResumeStepId(lastStep);
        } else {
          setServerResumeStepId(null);
        }
      } else {
        setServerResumeStepId(null);
      }

      const lessons = flattenLessons(pkg);
      const resume =
        routeLessonId && pkg.lessons[routeLessonId]
          ? routeLessonId
          : !isPreviewMode && !progRes.error && progRes.data?.lastLessonId && pkg.lessons[progRes.data.lastLessonId]
            ? progRes.data.lastLessonId
            : lessons[0]?.id ?? null;
      setCurrentLessonId(resume);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id, isPreviewMode, applyProgress, routeLessonId]);

  useEffect(() => {
    if (!id) return;
    certCheckedRef.current = false;
    setCertEligibility(null);
    loadedUniverseRef.current = null;
    void load();
  }, [id, isPreviewMode, load]);

  // Sync lesson from URL without refetching the whole course
  useEffect(() => {
    if (!experience || !routeLessonId) return;
    if (experience.lessons[routeLessonId]) {
      setCurrentLessonId(routeLessonId);
    }
  }, [routeLessonId, experience]);

  // Canonicalize URL so refresh restores lesson + step (replace — no extra history entry)
  useEffect(() => {
    if (!id || !experience || loading) return;

    const params = new URLSearchParams(searchParams);
    if (isPreviewMode) params.set("preview", "1");

    if (!routeLessonId && currentLessonId && experience.lessons[currentLessonId]) {
      goLearn({ universeId: id, lessonId: currentLessonId, search: params }, { replace: true });
      return;
    }

    if (routeLessonId && activeStepId && !routeStepId) {
      params.set("step", activeStepId);
      goLearn({ universeId: id, lessonId: routeLessonId, search: params }, { replace: true });
    }
  }, [
    id,
    experience,
    loading,
    routeLessonId,
    routeStepId,
    currentLessonId,
    activeStepId,
    isPreviewMode,
    goLearn,
  ]);

  // Check certificate requirements only once when course hits 100% (no auto-claim)
  useEffect(() => {
    if (!id || isPreviewMode || earnedCertificate || certCheckedRef.current) return;
    if (displayPercent < 100) return;
    certCheckedRef.current = true;
    void (async () => {
      const res = await api<{
        eligible: boolean;
        pendingRequirements: { label: string; code?: string }[];
        certificateUnavailable?: boolean;
        certificate: { id: string; certificateId: string; verificationUrl?: string } | null;
      }>(`/certificates/eligibility/lu/${id}`);
      if (!res.error && res.data) {
        setCertEligibility({
          eligible: res.data.eligible,
          pendingRequirements: res.data.pendingRequirements ?? [],
          certificateUnavailable: res.data.certificateUnavailable,
        });
        if (res.data.certificate) setEarnedCertificate(res.data.certificate);
      }
    })();
  }, [id, isPreviewMode, displayPercent, earnedCertificate]);

  const claimCertificate = async () => {
    if (!id) return;
    setClaimingCert(true);
    try {
      const res = await api<{ certificate: { id: string; certificateId: string; verificationUrl?: string } }>(
        `/certificates/lu/${id}/claim`,
        { method: "POST" }
      );
      if (res.error) throw new Error(res.error);
      if (res.data?.certificate) setEarnedCertificate(res.data.certificate);
    } finally {
      setClaimingCert(false);
    }
  };

  // Resolve active step when lesson changes or URL specifies a step
  useEffect(() => {
    if (!currentLesson || lessonSteps.length === 0) {
      setActiveStepId(null);
      lessonInitRef.current = null;
      setContinueBanner(null);
      return;
    }
    const validRouteStep = routeStepId && lessonSteps.some((s) => s.id === routeStepId) ? routeStepId : null;
    if (validRouteStep) {
      setActiveStepId(validRouteStep);
      lessonInitRef.current = currentLesson.id;
      setContinueBanner(null);
      return;
    }
    if (lessonInitRef.current !== currentLesson.id) {
      lessonInitRef.current = currentLesson.id;
      const serverStep =
        serverResumeStepId && lessonSteps.some((s) => s.id === serverResumeStepId)
          ? serverResumeStepId
          : null;
      const target = serverStep ?? resumeStepId ?? lessonSteps[0]?.id ?? null;
      setActiveStepId(target);
      if (target && (serverStep || resumeStepId) && target !== lessonSteps[0]?.id) {
        const step = lessonSteps.find((s) => s.id === target);
        setContinueBanner(step ? `Continue: ${stepLabel(step)}` : null);
      } else {
        setContinueBanner(null);
      }
    }
  }, [currentLesson, lessonSteps, routeStepId, resumeStepId, serverResumeStepId]);

  // Scroll learn content to top and move focus when the active step changes
  useEffect(() => {
    if (!activeStepId) return;
    const el = mainScrollRef.current;
    if (el) el.scrollTo({ top: 0, behavior: "smooth" });
    const focusTarget = document.getElementById("lesson-step-content");
    focusTarget?.focus({ preventScroll: true });
  }, [activeStepId]);

  // Publish lesson/step context for GateHub Assistant (tutor grounding)
  useEffect(() => {
    if (!id || !currentLesson || !experience) {
      publishLearningLessonContext(null);
      return;
    }
    publishLearningLessonContext({
      universeId: id,
      universeTitle: experience.universe.title,
      lessonId: currentLesson.id,
      lessonTitle: currentLesson.title,
      stepId: activeStep?.id ?? null,
      stepTitle: activeStep ? stepLabel(activeStep) : null,
      stepKind: activeStep?.kind ?? null,
      progressPercent: currentLessonPercent,
    });
    return () => publishLearningLessonContext(null);
  }, [id, experience, currentLesson, activeStep, currentLessonPercent]);

  // Track time spent on active step
  useEffect(() => {
    if (!activeStepId) return;
    markVisited(activeStepId);
    stepTimerRef.current = { stepId: activeStepId, startedAt: Date.now() };
    return () => {
      if (stepTimerRef.current) {
        const elapsed = Math.round((Date.now() - stepTimerRef.current.startedAt) / 1000);
        addTimeSpent(stepTimerRef.current.stepId, elapsed);
      }
    };
  }, [activeStepId, markVisited, addTimeSpent]);

  const updateStepInUrl = useCallback(
    (lessonId: string, stepId: string, options?: { workspace?: boolean }) => {
      if (!id) return;
      const params = new URLSearchParams(searchParams);
      params.set("step", stepId);
      if (options?.workspace) params.set("workspace", stepId);
      else params.delete("workspace");
      if (isPreviewMode) params.set("preview", "1");
      goLearn({ universeId: id, lessonId, search: params }, { replace: true });
    },
    [id, isPreviewMode, goLearn, searchParams]
  );

  const openWorkspace = useCallback(
    (stepId: string) => {
      if (!currentLessonId) return;
      setActiveStepId(stepId);
      updateStepInUrl(currentLessonId, stepId, { workspace: true });
    },
    [currentLessonId, updateStepInUrl]
  );

  const exitWorkspace = useCallback(() => {
    if (!currentLessonId || !activeStepId) return;
    updateStepInUrl(currentLessonId, activeStepId, { workspace: false });
  }, [activeStepId, currentLessonId, updateStepInUrl]);

  const navigateLesson = (lessonId: string) => {
    setCurrentLessonId(lessonId);
    lessonInitRef.current = null;
    if (id) {
      const params = new URLSearchParams(searchParams);
      params.delete("step");
      params.delete("workspace");
      if (isPreviewMode) params.set("preview", "1");
      goLearn({ universeId: id, lessonId, search: params });
    }
  };

  const selectStep = (stepId: string) => {
    setActiveStepId(stepId);
    if (currentLessonId) updateStepInUrl(currentLessonId, stepId);
    mainScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goToAdjacentStep = (direction: -1 | 1) => {
    const index = lessonSteps.findIndex((s) => s.id === activeStepId);
    const next = lessonSteps[index + direction];
    if (next) selectStep(next.id);
  };

  const persistLessonComplete = useCallback(
    async (lessonId: string, verified = false) => {
      if (!id) return;
      if (!verified) {
        const exp = experience?.lessons[lessonId];
        if (exp && !isLessonDone(lessonId)) return;
      }

      if (!isPreviewMode) {
        await api(`/learning-universes/${id}/lessons/${lessonId}/progress`, {
          method: "PATCH",
          body: { completed: true, touch: true },
        });
      }
      setCompletedLessonIds((prev) => new Set([...prev, lessonId]));
    },
    [id, experience, isLessonDone, isPreviewMode]
  );

  const handleStepProgress = useCallback(
    (stepId: string, event: string) => {
      if (!currentLessonId || !currentLesson) return;

      const step = currentLesson.steps.find((s) => s.id === stepId);
      if (!step) return;

      const { lessonComplete } = recordStepEvent(step, event);

      if (lessonComplete) {
        void persistLessonComplete(currentLessonId, true);
      } else if (!isPreviewMode && id) {
        if (touchProgressTimerRef.current) clearTimeout(touchProgressTimerRef.current);
        touchProgressTimerRef.current = setTimeout(() => {
          void api(`/learning-universes/${id}/lessons/${currentLessonId}/progress`, {
            method: "PATCH",
            body: { touch: true, stepId },
          });
        }, 400);
      }
    },
    [currentLesson, currentLessonId, recordStepEvent, id, isPreviewMode, persistLessonComplete]
  );

  if (loading && !experience) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !experience || !id) {
    const isFormatUnavailable = Boolean(error?.includes("current learning format"));
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 max-w-lg mx-auto text-center">
        <p className={isFormatUnavailable ? "text-foreground" : "text-destructive"}>
          {error || "Experience unavailable"}
        </p>
        {isFormatUnavailable && (
          <p className="text-sm text-muted-foreground">
            Please contact your instructor or try again after the course is published in Learning Universe format.
          </p>
        )}
        <Button asChild variant="outline">
          <Link to={isFormatUnavailable || !id ? "/student/my-courses" : courseHomePath(id)}>
            {isFormatUnavailable ? "Back to My Courses" : "Back to course"}
          </Link>
        </Button>
      </div>
    );
  }

  const outlineNav = (
    <CourseOutlineNav
      experience={experience}
      lessonList={lessonList}
      currentLessonId={currentLessonId}
      currentLessonPercent={currentLessonPercent}
      activeStepId={activeStepId}
      isPreviewMode={isPreviewMode}
      earnedCertificate={earnedCertificate}
      certEligibility={certEligibility}
      claimingCert={claimingCert}
      onNavigateLesson={(lessonId) => {
        navigateLesson(lessonId);
        if (isMobile) setSidebarOpen(false);
      }}
      onSelectStep={(stepId) => {
        selectStep(stepId);
        if (isMobile) setSidebarOpen(false);
      }}
      onClaimCertificate={() => void claimCertificate()}
      isLessonDone={isLessonDone}
      getStepProgress={getStepProgress}
    />
  );

  const renderLessonBody = () => {
    if (currentLesson && activeStep && workspaceOpen) {
      return (
        <LessonWorkspaceContent workspaceMode className="h-full min-h-0">
          <div id="lesson-step-content" tabIndex={-1} className="h-full min-h-0 outline-none flex flex-col">
            <WorkspaceHost
              step={activeStep}
              universeId={id}
              lessonId={currentLesson.id}
              publishVersionId={publishVersionId || experience?.publishVersionId}
              onExit={exitWorkspace}
              onProgress={handleStepProgress}
            />
          </div>
        </LessonWorkspaceContent>
      );
    }

    if (currentLesson && activeStep) {
      return (
        <LessonWorkspaceContent>
          <div
            id="lesson-step-content"
            tabIndex={-1}
            className="w-full min-w-0 max-w-full animate-in fade-in duration-200 outline-none"
          >
            {continueBanner && (
              <div
                className="mb-4 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-foreground flex items-center justify-between gap-3"
                role="status"
                data-testid="continue-banner"
              >
                <span className="truncate font-medium">{continueBanner}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="shrink-0 h-7 text-xs"
                  onClick={() => setContinueBanner(null)}
                >
                  Dismiss
                </Button>
              </div>
            )}
            <ExperienceRenderer
              key={activeStep.id}
              step={activeStep}
              universeId={id}
              lessonId={currentLesson.id}
              publishVersionId={publishVersionId || experience?.publishVersionId}
              assets={assets}
              onProgress={handleStepProgress}
              onNavigateLesson={navigateLesson}
              onOpenWorkspace={openWorkspace}
              lessonComplete={isLessonFullyComplete()}
            />
            {activeStep.kind === "summary" && (
              <>
                <KeyTakeawaysPanel steps={lessonSteps} className="mt-6" />
                <RevisionStudyPanel
                  universeId={id}
                  publishVersionId={publishVersionId || experience?.publishVersionId || "local"}
                  lessonId={currentLesson.id}
                  lessonTitle={currentLesson.title}
                  steps={lessonSteps}
                />
              </>
            )}
            {activeStep.kind === "summary" && isLessonFullyComplete() && !completedLessonIds.has(currentLesson.id) && (
              <div className="flex justify-center pt-6">
                <Button type="button" size="lg" className="gap-2" onClick={() => void persistLessonComplete(currentLesson.id)}>
                  <Trophy className="w-4 h-4" />
                  Mark lesson complete
                </Button>
              </div>
            )}
          </div>
        </LessonWorkspaceContent>
      );
    }

    if (currentLesson && lessonSteps.length === 0) {
      return (
        <LessonWorkspaceContent>
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            This lesson has no content yet.
          </div>
        </LessonWorkspaceContent>
      );
    }

    if (!currentLesson && lessonList.length === 0) {
      return (
        <LessonWorkspaceContent>
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground" />
            <h2 className="text-xl font-semibold">No lessons published yet</h2>
            <p className="text-muted-foreground text-sm max-w-md">
              Add lessons in Academic Authoring Studio, save your .tex files, then click{" "}
              <strong>Publish to LU</strong> to make content appear here.
            </p>
            {isPreviewMode && id && (
              <Button asChild variant="outline">
                <Link to={`/instructor/learning-universe/new/academic?edit=${id}`}>Back to Editor</Link>
              </Button>
            )}
          </div>
        </LessonWorkspaceContent>
      );
    }

    return (
      <LessonWorkspaceContent>
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          Select a lesson to begin
        </div>
      </LessonWorkspaceContent>
    );
  };

  const showLearnFooter = Boolean(currentLesson && !workspaceOpen);

  return (
    <ComponentStateProvider scopePrefix={`${id}:${publishVersionId || experience?.publishVersionId || "preview"}`}>
      <div className="app-shell app-shell--immersive flex-1 min-h-0 w-full overflow-hidden bg-background">
        <header data-floating-obstacle="learn-header" className="shrink-0 z-20 border-b bg-background/95 backdrop-blur">
          {isPreviewMode && <InstructorPreviewBanner />}
          <div className="flex items-center gap-3 px-4 h-14">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={toggleSidebar}
              aria-label={sidebarOpen ? "Hide course outline" : "Show course outline"}
              aria-expanded={sidebarOpen}
              aria-controls={isMobile ? undefined : "course-outline-panel"}
            >
              <Menu className="w-5 h-5" aria-hidden />
            </Button>
            <Button asChild size="icon" variant="ghost">
              <Link to={courseHomePath(id)} aria-label="Back to course home">
                <ArrowLeft className="w-5 h-5" aria-hidden />
              </Link>
            </Button>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate">{experience.universe.title}</p>
              <h1 className="font-semibold truncate text-base leading-tight">
                {currentLesson?.title ?? "Select a lesson"}
              </h1>
            </div>
            <div
              className="flex flex-col gap-1 min-w-[88px] w-[min(160px,28vw)] sm:min-w-[140px] sm:w-[min(200px,18vw)]"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span id="course-progress-label" className="hidden xs:inline sm:inline">
                  Progress
                </span>
                <span className="font-medium tabular-nums sm:ml-auto">{displayPercent}%</span>
              </div>
              <Progress
                value={displayPercent}
                className="h-2"
                aria-labelledby="course-progress-label"
              />
            </div>
            <ThemeToggle />
          </div>
        </header>

        <StudentLearnLayout
          sidebar={outlineNav}
          sidebarOpen={sidebarOpen}
          isMobile={isMobile}
          mobileDrawer={
            <CourseOutlineMobileDrawer open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
              {outlineNav}
            </CourseOutlineMobileDrawer>
          }
        >
          <LessonWorkspacePane
            scrollRef={mainScrollRef}
            workspaceMode={workspaceOpen}
            ariaLabel={
              currentLesson
                ? `${currentLesson.title}${activeStep ? ` — ${stepLabel(activeStep)}` : ""}`
                : "Lesson content"
            }
          >
            {renderLessonBody()}
          </LessonWorkspacePane>
          {showLearnFooter && (
            <StepNavigationFooter
              steps={lessonSteps}
              activeStepId={activeStepId}
              onPrevious={() => goToAdjacentStep(-1)}
              onNext={() => goToAdjacentStep(1)}
            />
          )}
        </StudentLearnLayout>
      </div>
    </ComponentStateProvider>
  );
}
