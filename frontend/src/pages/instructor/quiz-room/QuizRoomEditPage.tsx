import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Rocket, Save } from "lucide-react";
import {
  getLiveSession,
  updateQuizRoom,
  launchQuizRoom,
  getQuizRoomPreview,
} from "@/lib/liveSession/api";
import {
  DEFAULT_SETTINGS,
  type LiveSessionSettings,
  type LiveSessionStatus,
  type LiveSessionType,
  type QuizRoomPreview,
  type QuizRoomSourceType,
} from "@/lib/liveSession/types";
import { QuizRoomSettingsForm } from "@/components/quiz-room/QuizRoomSettingsForm";
import { QuizRoomPreviewCard } from "@/components/quiz-room/QuizRoomPreviewCard";
import { QuizRoomStatusBadge } from "@/components/quiz-room/QuizRoomStatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToastStore } from "@/store/toastStore";

interface RoomDetail {
  id: string;
  title: string;
  status: LiveSessionStatus;
  sessionType: LiveSessionType;
  sourceType: QuizRoomSourceType;
  quizId: string;
  courseId: string | null;
  lectureId: string | null;
  settings: LiveSessionSettings;
  scheduledAt: string | null;
  quiz: { id: string; title: string };
}

export function QuizRoomEditPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.add);

  const [title, setTitle] = useState("");
  const [sessionType, setSessionType] = useState<LiveSessionType>("live_classroom");
  const [sourceType, setSourceType] = useState<QuizRoomSourceType>("existing_quiz");
  const [settings, setSettings] = useState<LiveSessionSettings>(DEFAULT_SETTINGS);
  const [scheduledAt, setScheduledAt] = useState("");
  const [preview, setPreview] = useState<QuizRoomPreview | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: room, isLoading } = useQuery({
    queryKey: ["quiz-room-edit", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const res = await getLiveSession(sessionId!);
      return res.data?.data as RoomDetail;
    },
  });

  useEffect(() => {
    if (!room) return;
    setTitle(room.title);
    setSessionType(room.sessionType);
    setSourceType(room.sourceType);
    setSettings({ ...DEFAULT_SETTINGS, ...room.settings });
    if (room.scheduledAt) {
      const d = new Date(room.scheduledAt);
      setScheduledAt(d.toISOString().slice(0, 16));
    }
    getQuizRoomPreview(room.quizId).then((res) => {
      if (res.data?.data) setPreview(res.data.data);
    });
  }, [room]);

  const handleSave = async () => {
    if (!sessionId) return;
    setSaving(true);
    const res = await updateQuizRoom(sessionId, {
      title,
      sessionType,
      sourceType,
      settings,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    });
    setSaving(false);
    if (res.error) return toast({ title: "Save failed", description: res.error, variant: "destructive" });
    toast({ title: "Room updated", variant: "success" });
  };

  const handleLaunch = async () => {
    if (!sessionId) return;
    await handleSave();
    const res = await launchQuizRoom(sessionId);
    if (res.error) return toast({ title: "Launch failed", description: res.error, variant: "destructive" });
    toast({ title: "Room launched!", variant: "success" });
    navigate(`/instructor/quiz-room/${sessionId}/host`);
  };

  if (isLoading || !room) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">Loading room…</p>
      </div>
    );
  }

  if (!["draft", "scheduled", "lobby"].includes(room.status)) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center">
        <p className="text-muted-foreground">This room cannot be edited in its current state.</p>
        <Button className="mt-4" asChild>
          <Link to={`/instructor/quiz-room/${sessionId}/host`}>Open Host Dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/instructor/quiz-room">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-title">Edit Quiz Room</h1>
            <QuizRoomStatusBadge status={room.status} />
          </div>
          <p className="text-sm text-muted-foreground">{room.quiz.title}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button onClick={handleLaunch}>
            <Rocket className="mr-2 h-4 w-4" />
            Launch
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Room Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <QuizRoomSettingsForm
            title={title}
            sessionType={sessionType}
            settings={settings}
            onTitleChange={setTitle}
            onSessionTypeChange={setSessionType}
            onSettingsChange={setSettings}
            scheduledAt={scheduledAt}
            onScheduledAtChange={setScheduledAt}
            showSchedule
          />
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <QuizRoomPreviewCard preview={preview} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
