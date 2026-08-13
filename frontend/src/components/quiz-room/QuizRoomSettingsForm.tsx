import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SESSION_TYPE_LABELS, type LiveSessionSettings, type LiveSessionType } from "@/lib/liveSession/types";

interface QuizRoomSettingsFormProps {
  title: string;
  sessionType: LiveSessionType;
  settings: LiveSessionSettings;
  onTitleChange: (v: string) => void;
  onSessionTypeChange: (v: LiveSessionType) => void;
  onSettingsChange: (s: LiveSessionSettings) => void;
  scheduledAt?: string;
  onScheduledAtChange?: (v: string) => void;
  showSchedule?: boolean;
}

function SettingToggle({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <div>
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
    </div>
  );
}

export function QuizRoomSettingsForm({
  title,
  sessionType,
  settings,
  onTitleChange,
  onSessionTypeChange,
  onSettingsChange,
  scheduledAt = "",
  onScheduledAtChange,
  showSchedule = false,
}: QuizRoomSettingsFormProps) {
  const patch = (partial: Partial<LiveSessionSettings>) => onSettingsChange({ ...settings, ...partial });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>Room Name</Label>
          <Input value={title} onChange={(e) => onTitleChange(e.target.value)} placeholder="e.g. Week 3 Review" />
        </div>
        <div className="space-y-2">
          <Label>Session Type</Label>
          <Select value={sessionType} onValueChange={(v) => onSessionTypeChange(v as LiveSessionType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SESSION_TYPE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showSchedule && onScheduledAtChange && (
          <div className="space-y-2">
            <Label>Schedule For (optional)</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => onScheduledAtChange(e.target.value)}
            />
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Timing</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>Question Timer (seconds)</Label>
            <Input
              type="number"
              min={5}
              max={300}
              value={settings.questionTimerSeconds}
              onChange={(e) => patch({ questionTimerSeconds: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Break Between Questions (sec)</Label>
            <Input
              type="number"
              min={0}
              max={120}
              value={settings.breakBetweenQuestionsSeconds ?? 5}
              onChange={(e) => patch({ breakBetweenQuestionsSeconds: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Max Players</Label>
            <Input
              type="number"
              min={2}
              max={500}
              value={settings.maxPlayers ?? 100}
              onChange={(e) => patch({ maxPlayers: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Gameplay</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <SettingToggle
            id="show-lb"
            label="Show Leaderboard"
            checked={settings.showLeaderboard}
            onChange={(v) => patch({ showLeaderboard: v })}
          />
          <SettingToggle
            id="rand-q"
            label="Shuffle Questions"
            checked={settings.randomizeQuestions}
            onChange={(v) => patch({ randomizeQuestions: v })}
          />
          <SettingToggle
            id="rand-o"
            label="Shuffle Options"
            checked={settings.randomizeOptions}
            onChange={(v) => patch({ randomizeOptions: v })}
          />
          <SettingToggle
            id="neg"
            label="Negative Marking"
            checked={settings.negativeMarking}
            onChange={(v) => patch({ negativeMarking: v })}
          />
          <SettingToggle
            id="explain"
            label="Show Explanations"
            checked={settings.showExplanations}
            onChange={(v) => patch({ showExplanations: v })}
          />
          <SettingToggle
            id="correct"
            label="Show Correct Answer"
            checked={settings.showCorrectAnswer}
            onChange={(v) => patch({ showCorrectAnswer: v })}
          />
          <SettingToggle
            id="rejoin"
            label="Allow Rejoin"
            checked={settings.allowRejoin}
            onChange={(v) => patch({ allowRejoin: v })}
          />
          <SettingToggle
            id="late"
            label="Lock Late Join"
            description="Students cannot join after session starts"
            checked={settings.lockLateJoin}
            onChange={(v) => patch({ lockLateJoin: v })}
          />
          <SettingToggle
            id="anon"
            label="Anonymous Mode"
            checked={settings.anonymousMode}
            onChange={(v) => patch({ anonymousMode: v })}
          />
          <SettingToggle
            id="team"
            label="Team Mode"
            checked={settings.teamMode}
            onChange={(v) => patch({ teamMode: v })}
          />
          <SettingToggle
            id="auto-next"
            label="Auto-advance Questions"
            checked={settings.autoNextQuestion}
            onChange={(v) => patch({ autoNextQuestion: v })}
          />
          <SettingToggle
            id="multi"
            label="Multiple Attempts"
            checked={settings.multipleAttempts}
            onChange={(v) => patch({ multipleAttempts: v })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Room Password (optional)</Label>
        <Input
          value={settings.roomPassword ?? ""}
          onChange={(e) => patch({ roomPassword: e.target.value || undefined })}
          placeholder="Leave empty for open access"
          maxLength={32}
        />
      </div>
    </div>
  );
}
