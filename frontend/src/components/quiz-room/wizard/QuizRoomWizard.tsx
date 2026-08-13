import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  createQuizRoom,
  getQuizRoomPreview,
  launchQuizRoom,
  createQuizRoomTemplate,
  getQuizRoomPreferences,
  listQuizRoomTemplates,
} from "@/lib/liveSession/api";
import {
  DEFAULT_SETTINGS,
  type LiveSessionType,
  type QuizRoomPreview,
  type QuizRoomSourceType,
  type LiveSessionSettings,
} from "@/lib/liveSession/types";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toastStore";
import { WizardShell } from "./WizardShell";
import { CreateMethodStep, type QuizCreationMethod } from "./CreateMethodStep";
import { DuplicateQuizStep } from "./DuplicateQuizStep";
import { BankReuseStep } from "./BankReuseStep";
import { TemplatePickStep } from "./TemplatePickStep";
import { RoomSettingsStep } from "./RoomSettingsStep";
import { PreviewStep } from "./PreviewStep";
import { LaunchStep } from "./LaunchStep";
import { WaygroundCreatorPanel } from "./WaygroundCreatorPanel";
import { AiQuizDesignerWizard } from "@/components/ai-quiz-designer/AiQuizDesignerWizard";
import { QuizBrandingWizard } from "@/components/quiz-branding/QuizBrandingWizard";
import { QuizDetailsStep } from "@/components/quiz-branding/QuizDetailsStep";
import { DuplicateBrandingDialog } from "@/components/quiz-branding/DuplicateBrandingDialog";
import { BuildFromContentWizardStep } from "./BuildFromContentWizardStep";
import {
  createQuizWithIdentity,
  duplicateQuizWithBranding,
} from "@/lib/quizBranding/identityApi";
import {
  DEFAULT_QUIZ_BRANDING,
  DEFAULT_QUIZ_DETAILS,
  saveWorkflowSession,
  type QuizBrandingData,
  type QuizDetailsData,
  type QuizIdentity,
} from "@/lib/quizBranding/types";
import { validateScheduleDatetime, formatScheduleDisplay } from "@/lib/liveSession/scheduleUtils";
import type { WizardExtraSettings } from "./wizardTypes";

type WizardPhase =
  | "method"
  | "branding"
  | "details"
  | "ai-designer"
  | "duplicate-pick"
  | "bank-pick"
  | "template-pick"
  | "wayground-workspace"
  | "build_from_content"
  | "settings"
  | "preview"
  | "launch";

const PHASE_LABELS: Record<WizardPhase, string> = {
  method: "Create Quiz",
  branding: "Quiz Branding",
  details: "Quiz Details",
  "ai-designer": "AI Wizard",
  "duplicate-pick": "Choose Quiz",
  "bank-pick": "Question Bank",
  "template-pick": "Browse Templates",
  "wayground-workspace": "Wayground",
  "build_from_content": "Build From Content",
  settings: "Settings",
  preview: "Preview",
  launch: "Launch",
};

function phasesForMethod(method: QuizCreationMethod | null): WizardPhase[] {
  switch (method) {
    case "manual":
      return ["method", "branding", "details"];
    case "ai":
      return ["method", "branding", "details", "ai-designer"];
    case "templates":
      return ["method", "branding", "details", "template-pick"];
    case "duplicate":
      return ["method", "branding", "details", "duplicate-pick"];
    case "question_bank":
      return ["method", "branding", "details", "bank-pick", "settings", "preview", "launch"];
    case "wayground":
      return ["method", "wayground-workspace"];
    case "build_from_content":
      return ["method", "branding", "details", "build_from_content"];
    default:
      return ["method"];
  }
}

export function QuizRoomWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToastStore((s) => s.add);

  const preQuizId = searchParams.get("quizId");
  const preTemplateId = searchParams.get("templateId");

  const skipBranding = !!preQuizId;

  const [phase, setPhase] = useState<WizardPhase>(
    preQuizId
      ? "settings"
      : "method"
  );
  const [creationMethod, setCreationMethod] = useState<QuizCreationMethod | null>(
    preQuizId ? "duplicate" : null
  );
  const [branding, setBranding] = useState<QuizBrandingData>(DEFAULT_QUIZ_BRANDING);
  const [details, setDetails] = useState<QuizDetailsData>(DEFAULT_QUIZ_DETAILS);
  const [quizId, setQuizId] = useState(preQuizId || "");
  const [sourceType, setSourceType] = useState<QuizRoomSourceType>(preQuizId ? "existing_quiz" : "question_bank");
  const [title, setTitle] = useState("");
  const [sessionType, setSessionType] = useState<LiveSessionType>("live_classroom");
  const [settings, setSettings] = useState<LiveSessionSettings & WizardExtraSettings>({ ...DEFAULT_SETTINGS });
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [preview, setPreview] = useState<QuizRoomPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [duplicateDialog, setDuplicateDialog] = useState<{ quizId: string; title: string } | null>(null);
  const [pendingDuplicateId, setPendingDuplicateId] = useState("");

  const identity: QuizIdentity = useMemo(() => ({ ...branding, ...details }), [branding, details]);
  const phaseList = useMemo(() => phasesForMethod(creationMethod), [creationMethod]);
  const stepIndex = Math.max(0, phaseList.indexOf(phase));

  useEffect(() => {
    getQuizRoomPreferences().then((res) => {
      if (res.data?.data) setSettings({ ...DEFAULT_SETTINGS, ...res.data.data });
    });
  }, []);

  useEffect(() => {
    if (!preQuizId) return;
    setQuizId(preQuizId);
    loadPreview(preQuizId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preQuizId]);

  useEffect(() => {
    if (!preTemplateId) return;
    listQuizRoomTemplates().then((res) => {
      const tpl = res.data?.data?.find((t) => t.id === preTemplateId);
      if (!tpl) return;
      setCreationMethod("templates");
      setSettings({ ...DEFAULT_SETTINGS, ...(tpl.settings as LiveSessionSettings) });
      setSessionType(tpl.sessionType as LiveSessionType);
      setPhase("bank-pick");
    });
  }, [preTemplateId]);

  const loadPreview = async (id?: string) => {
    const qid = id || quizId;
    if (!qid) return;
    setLoadingPreview(true);
    const res = await getQuizRoomPreview(qid);
    setLoadingPreview(false);
    if (res.error || !res.data?.data) {
      toast({ title: "Preview failed", description: res.error, variant: "destructive" });
      return;
    }
    setPreview(res.data.data);
    if (!title) setTitle(res.data.data.title);
  };

  useEffect(() => {
    if (phase === "preview" && quizId && !preview) loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, quizId]);

  const handleMethodSelect = (method: QuizCreationMethod) => {
    if (submitting) return;
    setCreationMethod(method);
    setSourceType(method === "duplicate" ? "existing_quiz" : "question_bank");

    // Wayground: skip branding/details
    if (method === "wayground") {
      setPhase("wayground-workspace");
      return;
    }

    // All other methods go through branding/details first
    setPhase("branding");
  };

  const finishDetails = async () => {
    console.log("[QUIZ WIZARD] finishDetails called", { details, creationMethod, branding });
    if (!details.title.trim()) {
      console.error("[QUIZ WIZARD] Quiz name is empty");
      toast({ title: "Enter a quiz name", description: "Please provide a name for your quiz before continuing.", variant: "destructive" });
      return;
    }
    if (!creationMethod) {
      console.error("[QUIZ WIZARD] No creation method selected");
      toast({ title: "No creation method selected", description: "Please choose how you want to create your quiz.", variant: "destructive" });
      return;
    }
    if (!branding.bannerUrl) {
      console.error("[QUIZ WIZARD] No banner selected");
      toast({ title: "Select a banner", description: "Choose a quiz banner before continuing.", variant: "destructive" });
      return;
    }

    setTitle(details.title.trim());
    saveWorkflowSession({ method: creationMethod, branding, details });
    console.log("[QUIZ WIZARD] Workflow session saved");

    console.log("[QUIZ WIZARD] Identity object:", identity);
    console.log("[QUIZ WIZARD] Identity keys:", Object.keys(identity));
    console.log("[QUIZ WIZARD] Identity values:", Object.values(identity));

    if (creationMethod === "manual") {
      setSubmitting(true);
      const res = await createQuizWithIdentity(identity, { withPlaceholder: true });
      setSubmitting(false);
      const quizId = (res.data as any)?.data?.id || (res.data as any)?.id;
      if (res.error || !quizId) {
        console.error("[QUIZ WIZARD] Could not start builder", { 
          error: res.error, 
          responseData: res.data,
          quizId 
        });
        toast({ 
          title: "Could not start builder", 
          description: res.error || "Quiz ID not found in response", 
          variant: "destructive" 
        });
        return;
      }
      navigate(`/instructor/quiz-room/quizzes/${quizId}/edit`);
      return;
    }

    if (creationMethod === "build_from_content") {
      // Create quiz with identity first, then go to build_from_content phase
      setSubmitting(true);
      console.log("[QUIZ WIZARD] Creating quiz with identity for build_from_content", { identity });
      const res = await createQuizWithIdentity(identity, { withPlaceholder: true });
      console.log("[QUIZ WIZARD] createQuizWithIdentity result", JSON.stringify(res, null, 2));
      setSubmitting(false);
      
      const newQuizId = (res.data as any)?.data?.id || (res.data as any)?.id;
      if (res.error || !newQuizId) {
        console.error("[QUIZ WIZARD] Failed to create quiz", { 
          error: res.error, 
          responseData: res.data,
          quizId: newQuizId 
        });
        toast({ 
          title: "Could not create quiz", 
          description: res.error || "Quiz ID not found in response", 
          variant: "destructive" 
        });
        return;
      }
      console.log("[QUIZ WIZARD] Quiz created successfully", { quizId: newQuizId });
      setQuizId(newQuizId);
      setPhase("build_from_content");
      return;
    }

    const next: Partial<Record<QuizCreationMethod, WizardPhase>> = {
      ai: "ai-designer",
      templates: "template-pick",
      duplicate: "duplicate-pick",
      question_bank: "bank-pick",
    };
    setPhase(next[creationMethod]!);
  };

  const handleDuplicateSelect = (id: string, quizTitle: string) => {
    setPendingDuplicateId(id);
    setDuplicateDialog({ quizId: id, title: quizTitle });
  };

  const handleDuplicateBrandingChoice = async (keepOriginalBranding: boolean) => {
    if (!duplicateDialog) return;
    setSubmitting(true);
    setDuplicateDialog(null);
    const res = await duplicateQuizWithBranding(duplicateDialog.quizId, identity, keepOriginalBranding);
    setSubmitting(false);
    const quizId = res.data?.data?.id || (res.data as any)?.id;
    if (res.error || !quizId) {
      console.error("[QUIZ WIZARD] Duplicate failed", { error: res.error, responseData: res.data, quizId });
      toast({ 
        title: "Duplicate failed", 
        description: res.error || "Quiz ID not found in response after duplication", 
        variant: "destructive" 
      });
      return;
    }
    navigate(`/instructor/quiz-room/quizzes/${quizId}/edit`);
  };

  const isHostLiveFlow = !!(skipBranding && preQuizId);
  const hostLivePhases: WizardPhase[] = ["settings", "preview", "launch"];
  const hostLiveStepLabels = ["Room Settings", "Preview", "Launch"];

  const activePhaseList = isHostLiveFlow ? hostLivePhases : phaseList;
  const activeStepIndex = isHostLiveFlow
    ? hostLivePhases.indexOf(phase)
    : stepIndex;

  const goNextHostLive = () => {
    if ((phase === "settings" || phase === "preview") && !quizId) {
      toast({ title: "No quiz ready", variant: "destructive" });
      return;
    }
    if (phase === "settings") loadPreview();
    const idx = hostLivePhases.indexOf(phase);
    if (idx < hostLivePhases.length - 1) setPhase(hostLivePhases[idx + 1]!);
  };

  const goBackHostLive = () => {
    const idx = hostLivePhases.indexOf(phase);
    if (idx > 0) {
      setPhase(hostLivePhases[idx - 1]!);
      return;
    }
    navigate(`/instructor/quiz-room/quizzes/${preQuizId}/edit`);
  };

  const handleQuizReady = (id: string, quizTitle: string) => {
    setQuizId(id);
    setTitle(quizTitle);
    setPreview(null);
    setPhase("settings");
  };

  const goNext = async () => {
    if (phase === "branding") {
      if (!branding.bannerUrl) {
        toast({ title: "Select a banner", description: "Choose a quiz banner before continuing.", variant: "destructive" });
        return;
      }
      setPhase("details");
      return;
    }
    if (phase === "details") {
      await finishDetails();
      return;
    }
    if (phase === "duplicate-pick" && !pendingDuplicateId) {
      toast({ title: "Select a quiz to duplicate", variant: "destructive" });
      return;
    }
    if ((phase === "settings" || phase === "preview") && !quizId) {
      toast({ title: "No quiz ready", variant: "destructive" });
      return;
    }
    if (phase === "settings") loadPreview();
    const idx = phaseList.indexOf(phase);
    if (idx < phaseList.length - 1) setPhase(phaseList[idx + 1]!);
  };

  const goBack = () => {
    if (phase === "ai-designer") {
      setPhase("details");
      return;
    }
    if (phase === "template-pick") {
      setPhase("details");
      return;
    }
    if (phase === "duplicate-pick") {
      setPhase("details");
      setPendingDuplicateId("");
      return;
    }
    const idx = phaseList.indexOf(phase);
    if (idx > 0) {
      setPhase(phaseList[idx - 1]!);
      return;
    }
    setPhase("method");
    setCreationMethod(null);
  };

  const submitRoom = async (mode: "draft" | "schedule" | "launch") => {
    if (!quizId) return;

    let scheduledIso: string | null = null;
    if (mode === "schedule" && scheduledAt) {
      const check = validateScheduleDatetime(scheduledAt);
      if (!check.ok) {
        toast({ title: "Cannot schedule", description: check.message, variant: "destructive" });
        return;
      }
      scheduledIso = check.iso;
    }

    setSubmitting(true);
    const res = await createQuizRoom({
      quizId,
      title: title || preview?.title || identity.title || "Untitled Quiz",
      sessionType,
      sourceType,
      settings,
      scheduledAt: mode === "schedule" ? scheduledIso : null,
      asDraft: mode === "draft",
    });
    setSubmitting(false);

    if (res.error || !res.data?.data) {
      toast({ title: "Failed to create room", description: res.error, variant: "destructive" });
      return;
    }

    const room = res.data.data;

    if (mode === "launch") {
      if (room.status !== "lobby") {
        const launchRes = await launchQuizRoom(room.id);
        if (launchRes.error) {
          toast({ title: "Created but launch failed", description: launchRes.error, variant: "destructive" });
          navigate(`/instructor/quiz-room/${room.id}/edit`);
          return;
        }
      }
      toast({ title: "Quiz room launched!", variant: "success" });
      navigate(`/instructor/quiz-room/${room.id}/host`);
      return;
    }

    if (mode === "schedule") {
      toast({
        title: "Quiz scheduled!",
        description: scheduledAt ? `Students can join on ${formatScheduleDisplay(scheduledAt)}.` : undefined,
        variant: "success",
      });
      navigate(`/instructor/quiz-room/${room.id}/edit`);
      return;
    }

    toast({ title: "Quiz saved as draft", variant: "success" });
    navigate(`/instructor/quiz-room/${room.id}/edit`);
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    const res = await createQuizRoomTemplate({ name: templateName.trim(), sessionType, sourceType, settings });
    if (!res.error) toast({ title: "Template saved!", variant: "success" });
  };

  const showFooter =
    ["branding", "details"].includes(phase) ||
    ["settings", "preview"].includes(phase);

  const footer = showFooter ? (
    <>
      <Button
        variant="ghost"
        className="text-white/70 hover:bg-white/10 hover:text-white"
        onClick={isHostLiveFlow ? goBackHostLive : goBack}
        disabled={phase === "method"}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />Back
      </Button>
      <Button
        onClick={isHostLiveFlow ? goNextHostLive : goNext}
        disabled={submitting}
        className="ml-auto"
      >
        Continue<ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </>
  ) : ["duplicate-pick", "template-pick"].includes(phase) ? (
    <Button variant="ghost" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={goBack}>
      <ArrowLeft className="mr-2 h-4 w-4" />Back
    </Button>
  ) : null;

  const stepLabels = isHostLiveFlow ? hostLiveStepLabels : phaseList.map((p) => PHASE_LABELS[p]);

  return (
    <>
      <WizardShell
        step={activeStepIndex}
        stepLabels={stepLabels}
        onStepClick={(i) => {
          if (i < activeStepIndex) setPhase(activePhaseList[i]!);
        }}
        footer={footer}
      >
        {phase === "method" && <CreateMethodStep onSelect={handleMethodSelect} busy={submitting} />}

        {phase === "wayground-workspace" && (
          <WaygroundCreatorPanel onBack={() => { setPhase("method"); setCreationMethod(null); }} />
        )}

        {phase === "build_from_content" && (
          <BuildFromContentWizardStep 
            quizId={quizId}
            quizTitle={title || details.title}
            onBack={() => { setPhase("details"); }} 
            onQuizCreated={handleQuizReady}
          />
        )}

        {phase === "branding" && creationMethod && (
          <QuizBrandingWizard workflow={creationMethod} branding={branding} detailsPreview={details} onChange={setBranding} />
        )}

        {phase === "details" && creationMethod && (
          <QuizDetailsStep workflow={creationMethod} branding={branding} details={details} onChange={setDetails} />
        )}

        {phase === "ai-designer" && (
          <AiQuizDesignerWizard
            embedded
            identityContext={identity}
            onBack={() => setPhase("details")}
          />
        )}

        {phase === "duplicate-pick" && (
          <DuplicateQuizStep selectedQuizId={pendingDuplicateId} onSelect={handleDuplicateSelect} />
        )}

        {phase === "template-pick" && (
          <TemplatePickStep
            identity={identity}
            onUseTemplate={(id) => navigate(`/instructor/quiz-room/quizzes/${id}/edit`)}
          />
        )}

        {phase === "bank-pick" && (
          <BankReuseStep quizTitle={title} onTitleChange={setTitle} onQuizCreated={handleQuizReady} identity={identity} />
        )}

        {phase === "settings" && (
          <>
            {isHostLiveFlow && (
              <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-white/80">
                Configure room settings, then continue to <strong className="text-primary">Preview</strong> and{" "}
                <strong className="text-primary">Launch</strong> to go live. The hosting button is on the final step.
              </div>
            )}
            <RoomSettingsStep
            title={title}
            sessionType={sessionType}
            settings={settings}
            scheduledAt={scheduledAt}
            onTitleChange={setTitle}
            onSessionTypeChange={setSessionType}
            onSettingsChange={setSettings}
            onScheduledAtChange={setScheduledAt}
          />
          </>
        )}

        {phase === "preview" && <PreviewStep preview={preview} loading={loadingPreview} roomTitle={title} />}

        {phase === "launch" && (
          <LaunchStep
            roomTitle={title}
            sessionType={sessionType}
            preview={preview}
            scheduledAt={scheduledAt}
            templateName={templateName}
            submitting={submitting}
            onTemplateNameChange={setTemplateName}
            onScheduledAtChange={setScheduledAt}
            onLaunch={() => submitRoom("launch")}
            onSchedule={() => submitRoom("schedule")}
            onDraft={() => submitRoom("draft")}
            onSaveTemplate={saveTemplate}
          />
        )}
      </WizardShell>

      <DuplicateBrandingDialog
        open={!!duplicateDialog}
        quizTitle={duplicateDialog?.title || ""}
        onSelect={handleDuplicateBrandingChoice}
        onCancel={() => setDuplicateDialog(null)}
      />
    </>
  );
}
