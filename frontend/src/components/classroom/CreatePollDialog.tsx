import React, { useMemo, useState } from 'react';
import { GripVertical, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  MAX_POLL_OPTIONS,
  MIN_POLL_OPTIONS,
  createEmptyOption,
  defaultOptionsForKind,
  relabelPollOptions,
  usesChoiceOptions,
  validatePollForm,
  type LivePollKind,
  type PollOption,
} from '@/lib/classroom/pollOptions';

export interface CreatePollPayload {
  title?: string;
  question: string;
  description?: string;
  pollKind: LivePollKind;
  type: LivePollKind;
  options: PollOption[];
  anonymous: boolean;
  showResults: boolean;
  allowChangeAnswer: boolean;
  required: boolean;
  shuffleOptions: boolean;
  timerEnabled: boolean;
  durationSeconds: number | null;
  launch: boolean;
}

interface CreatePollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<CreatePollPayload> & { question?: string; options?: PollOption[] };
  saving?: boolean;
  onSubmit: (payload: CreatePollPayload) => Promise<void>;
}

const TIMER_CHOICES = [
  { value: 'off', label: 'No timer' },
  { value: '10', label: '10 seconds' },
  { value: '30', label: '30 seconds' },
  { value: '60', label: '1 minute' },
  { value: '120', label: '2 minutes' },
  { value: '300', label: '5 minutes' },
  { value: 'custom', label: 'Custom duration' },
];

export function CreatePollDialog({ open, onOpenChange, initial, saving, onSubmit }: CreatePollDialogProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [question, setQuestion] = useState(initial?.question ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [pollKind, setPollKind] = useState<LivePollKind>(initial?.pollKind ?? 'single_choice');
  const [options, setOptions] = useState<PollOption[]>(initial?.options?.length ? relabelPollOptions(initial.options) : defaultOptionsForKind('single_choice'));
  const [anonymous, setAnonymous] = useState(Boolean(initial?.anonymous));
  const [showResults, setShowResults] = useState(initial?.showResults !== false);
  const [allowChangeAnswer, setAllowChangeAnswer] = useState(Boolean(initial?.allowChangeAnswer));
  const [required, setRequired] = useState(Boolean(initial?.required));
  const [shuffleOptions, setShuffleOptions] = useState(Boolean(initial?.shuffleOptions));
  const [timerChoice, setTimerChoice] = useState(initial?.timerEnabled ? String(initial.durationSeconds ?? 30) : 'off');
  const [customSeconds, setCustomSeconds] = useState(initial?.durationSeconds ?? 45);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? '');
    setQuestion(initial?.question ?? '');
    setDescription(initial?.description ?? '');
    const kind = initial?.pollKind ?? 'single_choice';
    setPollKind(kind);
    setOptions(initial?.options?.length ? relabelPollOptions(initial.options) : defaultOptionsForKind(kind));
    setAnonymous(Boolean(initial?.anonymous));
    setShowResults(initial?.showResults !== false);
    setAllowChangeAnswer(Boolean(initial?.allowChangeAnswer));
    setRequired(Boolean(initial?.required));
    setShuffleOptions(Boolean(initial?.shuffleOptions));
    setTimerChoice(initial?.timerEnabled ? String(initial.durationSeconds ?? 30) : 'off');
    setCustomSeconds(initial?.durationSeconds ?? 45);
    setError(null);
  }, [open, initial]);

  const durationSeconds = useMemo(() => {
    if (timerChoice === 'off') return null;
    if (timerChoice === 'custom') return Number(customSeconds) || null;
    return Number(timerChoice);
  }, [timerChoice, customSeconds]);

  const choiceMode = usesChoiceOptions(pollKind);

  const applyKind = (kind: LivePollKind) => {
    setPollKind(kind);
    if (kind === 'true_false' || kind === 'yes_no') {
      setOptions(defaultOptionsForKind(kind));
    } else if (!usesChoiceOptions(kind)) {
      setOptions([]);
    } else if (options.length < MIN_POLL_OPTIONS) {
      setOptions(defaultOptionsForKind(kind));
    }
  };

  const updateOption = (index: number, patch: Partial<PollOption>) => {
    setOptions((current) =>
      relabelPollOptions(
        current.map((option, i) => {
          if (i !== index) {
            if (pollKind !== 'multiple_choice' && patch.isCorrect && option.isCorrect) {
              return { ...option, isCorrect: false };
            }
            return option;
          }
          return { ...option, ...patch };
        }),
      ),
    );
  };

  const addOption = () => {
    if (options.length >= MAX_POLL_OPTIONS) return;
    setOptions((current) => relabelPollOptions([...current, createEmptyOption(current.length)]));
  };

  const removeOption = (index: number) => {
    if (options.length <= MIN_POLL_OPTIONS) return;
    setOptions((current) => relabelPollOptions(current.filter((_, i) => i !== index)));
  };

  const moveOption = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= options.length) return;
    setOptions((current) => {
      const copy = [...current];
      const item = copy[index]!;
      copy[index] = copy[next]!;
      copy[next] = item;
      return relabelPollOptions(copy);
    });
  };

  const buildPayload = (launch: boolean): CreatePollPayload | null => {
    const errors = validatePollForm({
      question,
      pollKind,
      options,
      timerEnabled: timerChoice !== 'off',
      durationSeconds,
    });
    if (errors.length > 0) {
      setError(errors[0]!);
      return null;
    }
    setError(null);
    return {
      title: title.trim() || question.trim(),
      question: question.trim(),
      description: description.trim() || undefined,
      pollKind,
      type: pollKind,
      options: choiceMode ? relabelPollOptions(options) : [],
      anonymous,
      showResults,
      allowChangeAnswer,
      required,
      shuffleOptions,
      timerEnabled: timerChoice !== 'off',
      durationSeconds,
      launch,
    };
  };

  const submit = async (launch: boolean) => {
    const payload = buildPayload(launch);
    if (!payload) return;
    await onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto bg-slate-950 text-slate-100 border-white/15">
        <DialogHeader>
          <DialogTitle className="text-white">{initial?.question ? 'Edit live poll' : 'Create live poll'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-slate-300">Poll title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional title" className="bg-white/5 border-white/15 text-white" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300">Question</Label>
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What is the first phase of a compiler?"
              className="bg-white/5 border-white/15 text-white min-h-[72px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300">Description / instructions</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" className="bg-white/5 border-white/15 text-white" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300">Question type</Label>
            <Select value={pollKind} onValueChange={(value) => applyKind(value as LivePollKind)}>
              <SelectTrigger className="bg-white/5 border-white/15 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single_choice">Single choice</SelectItem>
                <SelectItem value="multiple_choice">Multiple choice</SelectItem>
                <SelectItem value="true_false">True / False</SelectItem>
                <SelectItem value="yes_no">Yes / No</SelectItem>
                <SelectItem value="rating">Rating</SelectItem>
                <SelectItem value="short_answer">Short answer</SelectItem>
                <SelectItem value="numeric">Numeric answer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {choiceMode && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-slate-300">Options</Label>
                <span className="text-[11px] text-slate-500">{options.length} / {MAX_POLL_OPTIONS}</span>
              </div>
              <div className="space-y-2">
                {options.map((option, index) => (
                  <div key={option.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2">
                    <GripVertical className="h-4 w-4 text-slate-500 shrink-0" />
                    <span className="w-6 text-xs font-semibold text-violet-300">{option.label}</span>
                    <Input
                      value={option.text}
                      onChange={(e) => updateOption(index, { text: e.target.value })}
                      placeholder={`Option ${option.label}`}
                      className="h-8 bg-transparent border-white/10 text-white"
                    />
                    <label className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0">
                      <Checkbox
                        checked={Boolean(option.isCorrect)}
                        onCheckedChange={(checked) => updateOption(index, { isCorrect: Boolean(checked) })}
                      />
                      Correct
                    </label>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-slate-400" onClick={() => moveOption(index, -1)} disabled={index === 0}>
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-slate-400" onClick={() => moveOption(index, 1)} disabled={index === options.length - 1}>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-rose-400" onClick={() => removeOption(index)} disabled={options.length <= MIN_POLL_OPTIONS}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addOption} disabled={options.length >= MAX_POLL_OPTIONS} className="border-white/15 text-white">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add option
              </Button>
              <p className="text-[11px] text-slate-500">Leave correct answers unchecked for opinion / pulse questions.</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-white/10 p-3">
            <SettingRow label="Anonymous responses" checked={anonymous} onChange={setAnonymous} />
            <SettingRow label="Show results to students" checked={showResults} onChange={setShowResults} />
            <SettingRow label="Allow changing answers" checked={allowChangeAnswer} onChange={setAllowChangeAnswer} />
            <SettingRow label="Require response" checked={required} onChange={setRequired} />
            <SettingRow label="Shuffle options" checked={shuffleOptions} onChange={setShuffleOptions} />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Timer</Label>
            <Select value={timerChoice} onValueChange={setTimerChoice}>
              <SelectTrigger className="bg-white/5 border-white/15 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMER_CHOICES.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {timerChoice === 'custom' && (
              <Input
                type="number"
                min={1}
                value={customSeconds}
                onChange={(e) => setCustomSeconds(Number(e.target.value))}
                className="bg-white/5 border-white/15 text-white"
                placeholder="Seconds"
              />
            )}
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-300">Cancel</Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => void submit(false)} className="border-white/15 text-white">Save draft</Button>
            <Button type="button" disabled={saving} onClick={() => void submit(true)} className="bg-violet-600 hover:bg-violet-500 text-white">Launch now</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm text-slate-200">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
