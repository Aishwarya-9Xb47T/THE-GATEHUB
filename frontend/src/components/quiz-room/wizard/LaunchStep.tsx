import { Rocket, Calendar, Save, Copy, LayoutTemplate, Eye, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { QuizRoomPreview } from "@/lib/liveSession/types";
import { SESSION_TYPE_LABELS, type LiveSessionType } from "@/lib/liveSession/types";
import {
  defaultScheduleDatetimeLocal,
  formatScheduleDisplay,
  minScheduleDatetimeLocal,
  validateScheduleDatetime,
} from "@/lib/liveSession/scheduleUtils";
import { cn } from "@/lib/utils";

interface LaunchStepProps {
  roomTitle: string;
  sessionType: LiveSessionType;
  preview: QuizRoomPreview | null;
  scheduledAt: string | null;
  templateName: string;
  submitting: boolean;
  onTemplateNameChange: (v: string) => void;
  onScheduledAtChange: (v: string) => void;
  onLaunch: () => void;
  onSchedule: () => void;
  onDraft: () => void;
  onSaveTemplate: () => void;
}

export function LaunchStep({
  roomTitle,
  sessionType,
  preview,
  scheduledAt,
  templateName,
  submitting,
  onTemplateNameChange,
  onScheduledAtChange,
  onLaunch,
  onSchedule,
  onDraft,
  onSaveTemplate,
}: LaunchStepProps) {
  const scheduleValidation = scheduledAt ? validateScheduleDatetime(scheduledAt) : null;
  const scheduleError =
    scheduledAt && scheduleValidation && !scheduleValidation.ok ? scheduleValidation.message : null;
  const canSchedule = !!scheduledAt && scheduleValidation?.ok === true;

  const handlePickDefault = () => {
    onScheduledAtChange(defaultScheduleDatetimeLocal());
  };

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary">
        <Eye className="h-4 w-4" />
        Ready to go live
      </div>

      <h2 className="text-3xl font-bold sm:text-4xl">{roomTitle || preview?.title || "Your Quiz Room"}</h2>
      <p className="mt-3 text-white/60">
        {preview?.questionCount ?? "—"} questions · ~{preview?.estimatedMinutes ?? "—"} min ·{" "}
        {SESSION_TYPE_LABELS[sessionType]}
      </p>

      <div className="mt-8 w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-5 text-left">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
          <Clock className="h-4 w-4 text-primary" />
          Schedule for later
        </div>
        <p className="mb-3 text-xs text-white/50">
          Pick when students can join. Room code and PIN are generated when you schedule.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <Label className="text-xs text-white/50">Date & time</Label>
            <Input
              type="datetime-local"
              value={scheduledAt || ""}
              min={minScheduleDatetimeLocal()}
              onChange={(e) => onScheduledAtChange(e.target.value)}
              className={cn(
                "border-white/10 bg-white/5 text-white",
                scheduleError && "border-destructive/50"
              )}
            />
          </div>
          {!scheduledAt && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 border-white/20 text-white hover:bg-white/10"
              onClick={handlePickDefault}
            >
              Suggest +1h
            </Button>
          )}
        </div>
        {scheduleError && <p className="mt-2 text-xs text-destructive">{scheduleError}</p>}
        {canSchedule && (
          <p className="mt-2 text-xs text-primary">
            Scheduled for {formatScheduleDisplay(scheduledAt)}
          </p>
        )}
      </div>

      <div className="mt-8 flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
        <Button
          size="lg"
          className="h-14 flex-1 min-w-[200px] text-base shadow-xl shadow-primary/30"
          onClick={onLaunch}
          disabled={submitting}
        >
          <Rocket className="mr-2 h-5 w-5" />
          {submitting ? "Launching…" : "Launch Now"}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="h-14 flex-1 min-w-[160px] bg-white/10 text-white hover:bg-white/20"
          onClick={onSchedule}
          disabled={submitting || !canSchedule}
          title={!scheduledAt ? "Pick a date and time above" : scheduleError || undefined}
        >
          <Calendar className="mr-2 h-5 w-5" />
          {submitting ? "Scheduling…" : "Schedule"}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-14 flex-1 min-w-[160px] border-white/20 bg-transparent text-white hover:bg-white/10"
          onClick={onDraft}
          disabled={submitting}
        >
          <Save className="mr-2 h-5 w-5" />
          Save Draft
        </Button>
      </div>

      <div className="mt-12 w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-5 text-left">
        <p className="mb-3 text-sm font-medium text-white/80">More options</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" className="text-white/70" disabled>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </Button>
          <Button variant="ghost" size="sm" className="text-white/70" onClick={onSaveTemplate}>
            <LayoutTemplate className="mr-2 h-4 w-4" />
            Save Template
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          <Label className="text-xs text-white/50">Template name</Label>
          <Input
            value={templateName}
            onChange={(e) => onTemplateNameChange(e.target.value)}
            placeholder="My live quiz template"
            className="border-white/10 bg-white/5 text-white"
          />
        </div>
      </div>
    </div>
  );
}
