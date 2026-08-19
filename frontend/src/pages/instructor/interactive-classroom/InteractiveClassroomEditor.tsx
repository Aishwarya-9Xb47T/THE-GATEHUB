import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Play,
  Settings,
  QrCode,
  Users,
  Clock,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Star,
  Copy,
  Trash2,
  X,
  PanelLeft,
  PanelLeftClose,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToastStore } from "@/store/toastStore";
import { classroomAssetErrorFromBody } from "@/lib/classroom/classroomAssetUrls";
import { apiUrl, getToken } from "@/lib/api";
import { SlideRenderer } from "@/components/classroom/SlideRenderer";
import { SessionQrPanel } from "@/components/classroom/SessionQrPanel";

interface ActiveSession {
  id: string;
  roomCode: string;
  status: string;
  participants?: { id: string }[];
  _count?: { participants: number };
}

function getParticipantCount(session: ActiveSession | null | undefined): number {
  if (!session) return 0;
  if (session._count?.participants != null) return session._count.participants;
  return session.participants?.length ?? 0;
}

interface Slide {
  id: string;
  order: number;
  title: string;
  content?: any;
  thumbnail?: string;
  notes?: string;
  isLocked: boolean;
  isHidden: boolean;
  isImportant: boolean;
  interactions: Interaction[];
}

interface Interaction {
  id: string;
  type: string;
  settings?: any;
  duration?: number;
  points: number;
}

interface Presentation {
  id: string;
  title: string;
  description?: string;
  sourceType: string;
  status: string;
  slides: Slide[];
  renderProgress?: { rendered: number; total: number; currentSlide: number };
  renderedVisuals?: number;
}

type SaveState = "saved" | "saving" | "unsaved" | "error";

function formatSlideNumber(order: number): string {
  return String(order).padStart(2, "0");
}

function formatSourceType(sourceType: string): string {
  const labels: Record<string, string> = {
    powerpoint: "PowerPoint",
    google_slides: "Google Slides",
    pdf: "PDF",
    scratch: "From Scratch",
  };
  return labels[sourceType] ?? sourceType.replace(/_/g, " ");
}

function getSlideDisplayTitle(slide: Slide): string {
  const trimmed = slide.title?.trim();
  if (trimmed && trimmed !== "undefined" && trimmed !== "null") {
    return trimmed;
  }
  return `Slide ${slide.order}`;
}

export function InteractiveClassroomEditor() {
  const navigate = useNavigate();
  const { presentationId } = useParams<{ presentationId: string }>();
  const toast = useToastStore((s) => s.add);

  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [startingSession, setStartingSession] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [repairingVisuals, setRepairingVisuals] = useState(false);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);

  const autosaveTimer = useRef<number | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const lastSavedSnapshot = useRef<string>("");

  const slides = presentation?.slides ?? [];
  const selectedSlide = useMemo(
    () => slides.find((s) => s.id === selectedSlideId) ?? null,
    [slides, selectedSlideId],
  );

  const selectSlideById = useCallback((slideId: string) => {
    setSelectedSlideId(slideId);
  }, []);

  const fetchPresentation = useCallback(async (options?: { silent?: boolean }) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(apiUrl(`/api/classroom-studio/presentations/${presentationId}`), {
        headers: { Authorization: `Bearer ${getToken()}` },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Failed to load presentation");
      const data = await response.json();
      setPresentation(data);
      setSelectedSlideId((prev) => {
        if (prev && data.slides.some((s: Slide) => s.id === prev)) return prev;
        return data.slides[0]?.id ?? null;
      });
      const snapshot = JSON.stringify({ title: data.title, description: data.description });
      lastSavedSnapshot.current = snapshot;
      setSaveState("saved");
    } catch (error: any) {
      if (options?.silent) return;
      toast({
        title: "Error",
        description:
          error instanceof DOMException && error.name === "AbortError"
            ? "Loading the editor timed out. Please retry."
            : error instanceof Error
              ? error.message
              : "Failed to load presentation",
        variant: "destructive",
      });
    } finally {
      window.clearTimeout(timeout);
      if (!options?.silent) setLoading(false);
    }
  }, [presentationId, toast]);

  useEffect(() => {
    void fetchPresentation();
  }, [fetchPresentation]);

  useEffect(() => {
    const status = presentation?.status;
    if (!status || !["rendering", "uploading", "extracting", "source_stored"].includes(status)) return;
    const timer = window.setInterval(() => {
      void fetchPresentation({ silent: true });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [presentation?.status, fetchPresentation]);

  const markUnsaved = useCallback(() => {
    setSaveState((current) => (current === "saving" ? current : "unsaved"));
  }, []);

  const handleSave = async () => {
    if (!presentation) return;
    setSaveState("saving");
    try {
      const response = await fetch(apiUrl(`/api/classroom-studio/presentations/${presentationId}`), {
        method: "PUT",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: presentation.title, description: presentation.description }),
      });
      if (!response.ok) throw new Error("Save failed");
      lastSavedSnapshot.current = JSON.stringify({
        title: presentation.title,
        description: presentation.description,
      });
      setSaveState("saved");
      toast({ title: "Saved", description: "Presentation saved successfully" });
    } catch {
      setSaveState("error");
      toast({ title: "Save failed", description: "Could not save. Please retry.", variant: "destructive" });
    }
  };

  const handleRegenerateVisuals = async () => {
    if (!presentationId) return;
    setRepairingVisuals(true);
    try {
      const response = await fetch(
        apiUrl(`/api/classroom-studio/presentations/${presentationId}/regenerate-visuals`),
        { method: "POST", headers: { Authorization: `Bearer ${getToken()}` } },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const parsed = classroomAssetErrorFromBody(body) || {
          code: "CLASSROOM_REGENERATE_FAILED",
          message: typeof body?.error === "string" ? body.error : "Unable to regenerate the slide visuals.",
        };
        toast({
          title: "Unable to regenerate the slide visuals.",
          description: `Code: ${parsed.code}${parsed.message ? ` — ${parsed.message}` : ""}`,
          variant: "destructive",
        });
        return;
      }
      const result = await response.json().catch(() => null);
      if (result?.code === "CLASSROOM_RENDERING") {
        toast({
          title: "Generating slide visuals",
          description: "Rendering continues in the background. This page will update as each slide finishes.",
        });
        await fetchPresentation();
        return;
      }
      if (result?.code === "CLASSROOM_RENDER_PARTIAL") {
        toast({
          title: "Some slide visuals could not be generated",
          description: `${result.slidesSucceeded ?? 0} succeeded, ${result.slidesFailed ?? 0} failed${result.method ? ` • ${result.method}` : ""}.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Slide visuals regenerated",
          description: result?.method ? `Renderer: ${result.method}. Reloading the presentation.` : "Reloading the presentation.",
        });
      }
      await fetchPresentation();
    } catch {
      toast({ title: "Regenerate failed", description: "Could not reach the presentation repair service.", variant: "destructive" });
    } finally {
      setRepairingVisuals(false);
    }
  };

  const fetchActiveSession = useCallback(async (options?: { silent?: boolean }) => {
    if (!presentationId) return null;
    if (!options?.silent) setLoadingSession(true);
    try {
      const response = await fetch(apiUrl(`/api/classroom-studio/sessions?presentationId=${presentationId}&status=active`),
        { headers: { Authorization: `Bearer ${getToken()}` } },
      );
      if (!response.ok) return null;
      const sessions = (await response.json()) as ActiveSession[];
      const session = sessions[0] ?? null;
      setActiveSession(session);
      return session;
    } catch {
      setActiveSession(null);
      return null;
    } finally {
      if (!options?.silent) setLoadingSession(false);
    }
  }, [presentationId]);

  useEffect(() => {
    void fetchActiveSession({ silent: true });
  }, [fetchActiveSession]);

  useEffect(() => {
    if (sessionDrawerOpen) void fetchActiveSession();
  }, [sessionDrawerOpen, fetchActiveSession]);

  useEffect(() => {
    if (!sessionDrawerOpen) return;
    const interval = window.setInterval(() => {
      void fetchActiveSession({ silent: true });
    }, 8000);
    return () => window.clearInterval(interval);
  }, [sessionDrawerOpen, fetchActiveSession]);

  useEffect(() => {
    if (!timerRunning || timerSeconds <= 0) return;
    const id = window.setInterval(() => {
      setTimerSeconds((s) => {
        if (s <= 1) {
          setTimerRunning(false);
          toast({ title: "Timer finished" });
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning, timerSeconds, toast]);

  const formatTimer = (total: number) => {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const handleShowQrCode = async () => {
    let session = activeSession;
    if (!session) session = await fetchActiveSession();
    if (!session?.roomCode) {
      toast({
        title: "No active session",
        description: "Start a session first to generate a room code and QR.",
      });
      return;
    }
    setQrDialogOpen(true);
  };

  const handleManageParticipants = async () => {
    let session = activeSession;
    if (!session) session = await fetchActiveSession();
    if (session?.id) {
      navigate(`/instructor/interactive-classroom/session/${session.id}`);
      return;
    }
    toast({
      title: "No active session",
      description: "Start a session to manage participants.",
    });
  };

  const startTimer = (minutes: number) => {
    setTimerSeconds(minutes * 60);
    setTimerRunning(true);
  };

  const handleToggleSlideFlag = async (slide: Slide, flag: "isLocked" | "isHidden" | "isImportant") => {
    const updated: Slide = { ...slide, [flag]: !slide[flag] };
    setPresentation((prev) =>
      prev ? { ...prev, slides: prev.slides.map((s) => (s.id === slide.id ? updated : s)) } : prev,
    );
    try {
      const response = await fetch(apiUrl(`/api/classroom-studio/slides/${slide.id}`), {
        method: "PUT",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ [flag]: updated[flag] }),
      });
      if (!response.ok) throw new Error("Save failed");
      if (flag === "isHidden") {
        toast({
          title: updated.isHidden ? "Slide hidden in session" : "Slide visible in session",
          description: updated.isHidden
            ? "Still editable here — skipped during live presentation."
            : "Will appear during live sessions.",
        });
      }
    } catch {
      toast({ title: "Error", description: "Could not update slide. Please retry.", variant: "destructive" });
      setPresentation((prev) =>
        prev ? { ...prev, slides: prev.slides.map((s) => (s.id === slide.id ? slide : s)) } : prev,
      );
    }
  };

  const handleDuplicateSlide = async (slide: Slide) => {
    try {
      const response = await fetch(apiUrl(`/api/classroom-studio/slides/${slide.id}/duplicate`), {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!response.ok) throw new Error("Duplicate failed");
      toast({ title: "Duplicated", description: "Slide duplicated" });
      await fetchPresentation();
    } catch {
      toast({ title: "Error", description: "Could not duplicate slide", variant: "destructive" });
    }
  };

  const handleDeleteSlide = async (slide: Slide) => {
    if (!presentation || presentation.slides.length <= 1) {
      toast({
        title: "Cannot delete",
        description: "A presentation must have at least one slide",
        variant: "destructive",
      });
      return;
    }
    try {
      const response = await fetch(apiUrl(`/api/classroom-studio/slides/${slide.id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!response.ok) throw new Error("Delete failed");
      if (selectedSlideId === slide.id) {
        const idx = presentation.slides.findIndex((s) => s.id === slide.id);
        const next = presentation.slides[idx - 1] ?? presentation.slides[idx + 1];
        setSelectedSlideId(next?.id ?? null);
      }
      toast({ title: "Deleted", description: "Slide removed" });
      await fetchPresentation();
    } catch {
      toast({ title: "Error", description: "Could not delete slide", variant: "destructive" });
    }
  };

  const autosaveSlideTitle = (slide: Slide, title: string) => {
    if (!presentation) return;
    const updated = { ...slide, title };
    setPresentation({
      ...presentation,
      slides: presentation.slides.map((s) => (s.id === slide.id ? updated : s)),
    });
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(async () => {
      try {
        const response = await fetch(apiUrl(`/api/classroom-studio/slides/${slide.id}`), {
          method: "PUT",
          headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!response.ok) throw new Error("Autosave failed");
      } catch {
        toast({
          title: "Autosave failed",
          description: "Slide title could not be saved.",
          variant: "destructive",
        });
      }
    }, 650);
  };

  const navigateSlide = useCallback(
    (direction: "next" | "prev" | "first" | "last") => {
      if (!slides.length || !selectedSlideId) return;
      const currentIdx = slides.findIndex((s) => s.id === selectedSlideId);
      if (currentIdx < 0) return;
      let nextIdx = currentIdx;
      if (direction === "next") nextIdx = Math.min(currentIdx + 1, slides.length - 1);
      if (direction === "prev") nextIdx = Math.max(currentIdx - 1, 0);
      if (direction === "first") nextIdx = 0;
      if (direction === "last") nextIdx = slides.length - 1;
      if (nextIdx !== currentIdx) setSelectedSlideId(slides[nextIdx]!.id);
    },
    [slides, selectedSlideId],
  );

  const handleStartSession = async () => {
    if (!presentation) return;
    setStartingSession(true);
    try {
      let existing = activeSession;
      if (!existing) existing = await fetchActiveSession();
      if (existing?.id) {
        navigate(`/instructor/interactive-classroom/session/${existing.id}`);
        return;
      }

      const response = await fetch(apiUrl("/api/classroom-studio/sessions"), {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ presentationId: presentation.id, title: presentation.title }),
      });
      if (!response.ok) throw new Error("Failed to start session");
      const session = (await response.json()) as ActiveSession;
      setActiveSession(session);
      navigate(`/instructor/interactive-classroom/session/${session.id}`);
    } catch {
      toast({ title: "Error", description: "Failed to start session", variant: "destructive" });
    } finally {
      setStartingSession(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
        return;
      }

      if (event.key === "Escape") {
        setSessionDrawerOpen(false);
        setShowSettings(false);
        setQrDialogOpen(false);
        return;
      }

      if (typing || !slides.length) return;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        navigateSlide("next");
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigateSlide("prev");
      } else if (event.key === "Home") {
        event.preventDefault();
        navigateSlide("first");
      } else if (event.key === "End") {
        event.preventDefault();
        navigateSlide("last");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [slides.length, navigateSlide]);

  const saveLabel = useMemo(() => {
    if (saveState === "saving") return "Saving…";
    if (saveState === "unsaved") return "Unsaved";
    if (saveState === "error") return "Save failed";
    return "Saved";
  }, [saveState]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading presentation…</p>
        </div>
      </div>
    );
  }

  if (!presentation) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Presentation not found</p>
      </div>
    );
  }

  const currentSlideIndex = selectedSlide
    ? slides.findIndex((s) => s.id === selectedSlide.id)
    : -1;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Top toolbar */}
      <header className="h-14 shrink-0 border-b bg-card px-3 flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => navigate("/instructor/interactive-classroom")}
            aria-label="Back to presentations"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? "Expand slides panel" : "Collapse slides panel"}
            title={sidebarCollapsed ? "Expand slides" : "Collapse slides"}
          >
            {sidebarCollapsed ? <PanelLeft className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </Button>
        </div>

        <div className="min-w-0 flex-1">
          <Input
            value={presentation.title}
            onChange={(e) => {
              setPresentation({ ...presentation, title: e.target.value });
              markUnsaved();
            }}
            className="text-base font-semibold border-none bg-transparent focus-visible:ring-0 p-0 h-8 max-w-full"
            aria-label="Presentation title"
            placeholder="Untitled Presentation"
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{slides.length} slides · {formatSourceType(presentation.sourceType)}</span>
            <Badge variant={presentation.status === "ready" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 h-4 shrink-0">
              {presentation.status}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant={sessionDrawerOpen ? "secondary" : "outline"}
            size="sm"
            className="h-9"
            onClick={() => setSessionDrawerOpen((v) => !v)}
            aria-label="Toggle session controls"
            aria-expanded={sessionDrawerOpen}
          >
            <Users className="w-4 h-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Session</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => void handleRegenerateVisuals()}
            disabled={repairingVisuals}
            aria-label="Regenerate slide visuals"
          >
            <RefreshCw className={`w-4 h-4 sm:mr-1.5 ${repairingVisuals ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{repairingVisuals ? "Repairing…" : "Regenerate visuals"}</span>
          </Button>

          <Button
            variant={saveState === "error" ? "destructive" : saveState === "unsaved" ? "secondary" : "outline"}
            size="sm"
            className="h-9 min-w-[5.5rem]"
            onClick={() => void handleSave()}
            disabled={saveState === "saving"}
            aria-label="Save presentation"
          >
            <Save className="w-4 h-4 sm:mr-1.5" />
            <span className="text-xs sm:text-sm">{saveLabel}</span>
          </Button>

          <Button
            onClick={() => void handleStartSession()}
            disabled={startingSession}
            size="sm"
            className="h-9"
          >
            <Play className="w-4 h-4 sm:mr-1.5" />
            {activeSession ? (
              <>
                <span className="hidden md:inline">{startingSession ? "Opening…" : "Open Live Session"}</span>
                <span className="md:hidden">{startingSession ? "…" : "Live"}</span>
              </>
            ) : (
              <>
                <span className="hidden md:inline">{startingSession ? "Starting…" : "Start Session"}</span>
                <span className="md:hidden">{startingSession ? "…" : "Start"}</span>
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Workspace */}
      <div ref={workspaceRef} className="flex flex-1 min-h-0">
        {/* Slides sidebar */}
        <aside
          className={`shrink-0 border-r bg-card/50 flex flex-col transition-[width] duration-200 ${
            sidebarCollapsed ? "w-14" : "w-64"
          }`}
        >
          {!sidebarCollapsed && (
            <div className="px-3 py-2 border-b">
              <h2 className="text-sm font-semibold">Slides</h2>
            </div>
          )}
          <ScrollArea className="flex-1">
            <div className={`p-2 space-y-1 ${sidebarCollapsed ? "px-1" : ""}`}>
              {slides.map((slide) => {
                const isSelected = selectedSlideId === slide.id;
                const title = getSlideDisplayTitle(slide);
                return (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => selectSlideById(slide.id)}
                    title={title}
                    aria-label={`Slide ${slide.order}: ${title}`}
                    aria-current={isSelected ? "true" : undefined}
                    className={`w-full text-left rounded-md transition-all border ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-transparent hover:bg-muted/60"
                    } ${slide.isHidden ? "opacity-60" : ""} ${
                      sidebarCollapsed ? "p-2 flex justify-center" : "p-2.5"
                    }`}
                  >
                    {sidebarCollapsed ? (
                      <span className={`text-xs font-semibold tabular-nums ${isSelected ? "text-primary" : ""}`}>
                        {formatSlideNumber(slide.order)}
                      </span>
                    ) : (
                      <div className="flex items-start gap-2 min-w-0">
                        <span
                          className={`text-xs font-semibold tabular-nums shrink-0 mt-0.5 ${
                            isSelected ? "text-primary" : "text-muted-foreground"
                          }`}
                        >
                          {formatSlideNumber(slide.order)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{title}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {slide.isHidden && (
                              <EyeOff className="w-3 h-3 text-muted-foreground" aria-label="Hidden during session" />
                            )}
                            {slide.isLocked && <Lock className="w-3 h-3 text-muted-foreground" />}
                            {slide.isImportant && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
                            {slide.interactions.length > 0 && (
                              <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                                {slide.interactions.length}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </aside>

        {/* Slide canvas workspace */}
        <main className="flex-1 min-w-0 flex flex-col min-h-0 bg-muted/20">
          {selectedSlide ? (
            <>
              <div className="h-11 shrink-0 border-b bg-card px-2 sm:px-3 flex items-center gap-2 min-w-0">
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => navigateSlide("prev")}
                    disabled={currentSlideIndex <= 0}
                    aria-label="Previous slide"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums w-14 text-center shrink-0">
                    {formatSlideNumber(selectedSlide.order)}/{formatSlideNumber(slides.length)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => navigateSlide("next")}
                    disabled={currentSlideIndex >= slides.length - 1}
                    aria-label="Next slide"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                <Separator orientation="vertical" className="h-5 shrink-0" />

                <Input
                  value={selectedSlide.title}
                  onChange={(e) => autosaveSlideTitle(selectedSlide, e.target.value)}
                  className="h-8 text-sm font-medium border-none bg-transparent focus-visible:ring-0 px-1 min-w-0 flex-1"
                  aria-label="Slide title"
                  title={getSlideDisplayTitle(selectedSlide)}
                />

                <Separator orientation="vertical" className="h-5 shrink-0 hidden sm:block" />

                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    variant={selectedSlide.isHidden ? "secondary" : "ghost"}
                    size="icon"
                    className="h-8 w-8"
                    title={selectedSlide.isHidden ? "Show in session" : "Hide in session"}
                    aria-label={selectedSlide.isHidden ? "Show slide in session" : "Hide slide in session"}
                    onClick={() => void handleToggleSlideFlag(selectedSlide, "isHidden")}
                  >
                    {selectedSlide.isHidden ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={selectedSlide.isLocked ? "Unlock slide" : "Lock slide"}
                    aria-label={selectedSlide.isLocked ? "Unlock slide" : "Lock slide"}
                    onClick={() => void handleToggleSlideFlag(selectedSlide, "isLocked")}
                  >
                    {selectedSlide.isLocked ? (
                      <Lock className="w-4 h-4 text-amber-500" />
                    ) : (
                      <Unlock className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hidden sm:inline-flex"
                    title={selectedSlide.isImportant ? "Unmark important" : "Mark important"}
                    aria-label={selectedSlide.isImportant ? "Unmark important" : "Mark important"}
                    onClick={() => void handleToggleSlideFlag(selectedSlide, "isImportant")}
                  >
                    <Star className={`w-4 h-4 ${selectedSlide.isImportant ? "text-yellow-500 fill-yellow-500" : ""}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Duplicate slide"
                    aria-label="Duplicate slide"
                    onClick={() => void handleDuplicateSlide(selectedSlide)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Delete slide"
                    aria-label="Delete slide"
                    onClick={() => void handleDeleteSlide(selectedSlide)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden">
                <SlideRenderer
                  key={selectedSlide.id}
                  content={selectedSlide.content}
                  title={getSlideDisplayTitle(selectedSlide)}
                  slideNumber={selectedSlide.order}
                  presentationId={presentationId}
                  slideId={selectedSlide.id}
                  className="w-full h-full max-h-full"
                  canRepair
                  repairing={repairingVisuals}
                  pipelineStatus={presentation.status}
                  slideCount={slides.length}
                  renderProgressSlide={presentation.renderProgress?.currentSlide}
                  onRepair={() => void handleRegenerateVisuals()}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-muted-foreground">Select a slide to begin</p>
            </div>
          )}
        </main>
      </div>

      {/* Session drawer overlay */}
      {sessionDrawerOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 bg-black/30 z-40"
            aria-label="Close session panel"
            onClick={() => setSessionDrawerOpen(false)}
          />
          <aside className="fixed top-14 right-0 bottom-0 w-80 max-w-[90vw] bg-card border-l z-50 shadow-xl flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">Session Controls</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSessionDrawerOpen(false)}
                aria-label="Close session controls"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {!activeSession && !loadingSession && (
                  <div className="rounded-lg border border-dashed p-4 text-center space-y-3">
                    <p className="text-sm text-muted-foreground">No active session for this presentation.</p>
                    <Button size="sm" onClick={() => void handleStartSession()} disabled={startingSession}>
                      <Play className="w-4 h-4 mr-2" />
                      Start Session
                    </Button>
                  </div>
                )}

                {activeSession && (
                  <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center justify-between gap-2">
                    <span>
                      Room <span className="font-mono font-semibold text-foreground">{activeSession.roomCode}</span>
                    </span>
                    <Badge variant="default" className="text-[10px] capitalize">{activeSession.status}</Badge>
                  </div>
                )}

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <Users className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Participants</p>
                        <p className="text-2xl font-bold tabular-nums">
                          {loadingSession ? "…" : getParticipantCount(activeSession)}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      size="sm"
                      onClick={() => void handleShowQrCode()}
                      disabled={loadingSession}
                    >
                      <QrCode className="w-4 h-4 mr-2" />
                      Show QR Code
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full justify-start h-9"
                      size="sm"
                      onClick={() => {
                        setShowSettings(true);
                        setSessionDrawerOpen(false);
                      }}
                    >
                      <Settings className="w-4 h-4 mr-2 shrink-0" />
                      Presentation Settings
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start h-9"
                      size="sm"
                      onClick={() => void handleManageParticipants()}
                      disabled={loadingSession}
                    >
                      <Users className="w-4 h-4 mr-2 shrink-0" />
                      {activeSession ? "Open Live Session" : "Manage Participants"}
                    </Button>
                    <div className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          Timer
                        </span>
                        <span className="font-mono text-lg tabular-nums">{formatTimer(timerSeconds)}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button variant="outline" size="sm" className="h-8" onClick={() => startTimer(1)}>1 min</Button>
                        <Button variant="outline" size="sm" className="h-8" onClick={() => startTimer(5)}>5 min</Button>
                        {timerRunning ? (
                          <Button variant="secondary" size="sm" className="h-8" onClick={() => setTimerRunning(false)}>Pause</Button>
                        ) : timerSeconds > 0 ? (
                          <Button variant="secondary" size="sm" className="h-8" onClick={() => setTimerRunning(true)}>Resume</Button>
                        ) : null}
                        {timerSeconds > 0 && (
                          <Button variant="ghost" size="sm" className="h-8" onClick={() => { setTimerSeconds(0); setTimerRunning(false); }}>Reset</Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </aside>
        </>
      )}

      {/* QR Code dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Join Session</DialogTitle>
          </DialogHeader>
          {activeSession?.roomCode ? (
            <SessionQrPanel roomCode={activeSession.roomCode} />
          ) : (
            <p className="text-sm text-muted-foreground">Start a session to generate a QR code.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Settings dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Presentation Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Presentation Title</label>
              <Input
                value={presentation.title}
                onChange={(e) => {
                  setPresentation({ ...presentation, title: e.target.value });
                  markUnsaved();
                }}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={presentation.description || ""}
                onChange={(e) => {
                  setPresentation({ ...presentation, description: e.target.value });
                  markUnsaved();
                }}
                className="mt-1"
                placeholder="Add a description…"
              />
            </div>
            <Button onClick={() => void handleSave()} disabled={saveState === "saving"} className="w-full">
              {saveState === "saving" ? "Saving…" : "Save Settings"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
