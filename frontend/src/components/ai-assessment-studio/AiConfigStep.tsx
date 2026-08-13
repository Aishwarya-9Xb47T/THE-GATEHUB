import { motion } from "framer-motion";
import { Upload, Link as LinkIcon } from "lucide-react";
import type { AiAssessmentConfig, AiSourceType } from "@/lib/aiAssessmentStudio";
import {
  AUDIENCE_OPTIONS,
  BLOOM_OPTIONS,
  COUNT_PRESETS,
  DIFFICULTY_OPTIONS,
  EXAM_TYPES,
  QUESTION_TYPE_OPTIONS,
  TONE_OPTIONS,
} from "@/lib/aiAssessmentStudio/constants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const URL_SOURCES = new Set(["website", "youtube", "google_docs"]);
const FILE_SOURCES = new Set(["pdf", "docx", "pptx", "markdown", "image"]);
const TEXT_SOURCES = new Set(["topic", "text", "syllabus", "notes", "research_paper"]);

interface AiConfigStepProps {
  source: AiSourceType;
  config: AiAssessmentConfig;
  url: string;
  text: string;
  file: File | null;
  onPatch: (p: Partial<AiAssessmentConfig>) => void;
  onUrl: (u: string) => void;
  onText: (t: string) => void;
  onFile: (f: File | null) => void;
}

export function AiConfigStep({
  source,
  config,
  url,
  text,
  file,
  onPatch,
  onUrl,
  onText,
  onFile,
}: AiConfigStepProps) {
  const toggleType = (id: string) => {
    if (id === "mixed") {
      onPatch({ questionTypes: ["mixed"] });
      return;
    }
    const cur = config.questionTypes.filter((t) => t !== "mixed");
    const next = cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id];
    onPatch({ questionTypes: next.length ? next : ["mixed"] });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-white">AI configuration</h2>
        <p className="mt-1 text-sm text-white/50">Fine-tune how your assessment is generated.</p>
      </div>

      {/* Source input */}
      <Section title="Source content">
        {URL_SOURCES.has(source) && (
          <div className="space-y-2">
            <Label className="text-white/80">URL</Label>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <Input
                value={url}
                onChange={(e) => onUrl(e.target.value)}
                placeholder="https://..."
                className="border-white/10 bg-white/5 pl-10 text-white"
              />
            </div>
          </div>
        )}
        {FILE_SOURCES.has(source) && (
          <label className="flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-white/20 bg-white/5 px-6 py-10 transition-colors hover:border-primary/40">
            <Upload className="mb-2 h-8 w-8 text-primary" />
            <span className="text-sm text-white/70">{file ? file.name : "Drop file or click to browse"}</span>
            <input type="file" className="hidden" onChange={(e) => onFile(e.target.files?.[0] || null)} />
          </label>
        )}
        {TEXT_SOURCES.has(source) && (
          <Textarea
            value={text}
            onChange={(e) => onText(e.target.value)}
            rows={5}
            placeholder={source === "topic" ? "Describe the topic, concepts, and what students should know…" : "Paste content…"}
            className="border-white/10 bg-white/5 text-white"
          />
        )}
      </Section>

      <Section title="Basic">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Quiz name">
            <Input value={config.quizName} onChange={(e) => onPatch({ quizName: e.target.value })} className="border-white/10 bg-white/5 text-white" />
          </Field>
          <Field label="Subject">
            <Input value={config.subject || ""} onChange={(e) => onPatch({ subject: e.target.value })} className="border-white/10 bg-white/5 text-white" />
          </Field>
          <Field label="Topic focus">
            <Input value={config.topic || ""} onChange={(e) => onPatch({ topic: e.target.value })} className="border-white/10 bg-white/5 text-white" />
          </Field>
          <Field label="Learning outcome">
            <Input value={config.learningOutcome || ""} onChange={(e) => onPatch({ learningOutcome: e.target.value })} className="border-white/10 bg-white/5 text-white" />
          </Field>
        </div>
      </Section>

      <Section title="Difficulty & count">
        <div className="flex flex-wrap gap-2">
          {DIFFICULTY_OPTIONS.map((d) => (
            <Chip key={d} active={config.difficulty === d} onClick={() => onPatch({ difficulty: d })} label={d.replace("_", " ")} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {COUNT_PRESETS.map((n) => (
            <Chip key={n} active={config.questionCount === n} onClick={() => onPatch({ questionCount: n })} label={String(n)} />
          ))}
          <Input
            type="number"
            min={1}
            max={100}
            value={config.questionCount}
            onChange={(e) => onPatch({ questionCount: Number(e.target.value) })}
            className="w-20 border-white/10 bg-white/5 text-white"
          />
        </div>
      </Section>

      <Section title="Question types">
        <div className="flex flex-wrap gap-2">
          {QUESTION_TYPE_OPTIONS.map((t) => (
            <Chip
              key={t.id}
              active={config.questionTypes.includes(t.id)}
              onClick={() => toggleType(t.id)}
              label={t.label}
            />
          ))}
        </div>
      </Section>

      <Section title="Bloom & tone">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-wrap gap-2">
            {BLOOM_OPTIONS.map((b) => (
              <Chip key={b} active={config.bloomLevel === b} onClick={() => onPatch({ bloomLevel: b })} label={b} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {TONE_OPTIONS.map((t) => (
              <Chip key={t} active={config.tone === t} onClick={() => onPatch({ tone: t })} label={t} />
            ))}
          </div>
        </div>
      </Section>

      <Section title="Advanced AI options">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { key: "generateExplanations" as const, label: "Generate explanations" },
            { key: "generateHints" as const, label: "Generate hints" },
            { key: "generateTags" as const, label: "Generate tags" },
            { key: "shuffleOptions" as const, label: "Shuffle options" },
            { key: "negativeMarking" as const, label: "Negative marking" },
          ].map((opt) => (
            <label key={opt.key} className="flex items-center gap-2 text-sm text-white/70">
              <Checkbox checked={Boolean(config[opt.key])} onCheckedChange={(v) => onPatch({ [opt.key]: Boolean(v) })} />
              {opt.label}
            </label>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Exam type">
            <select
              value={config.examType || "quiz"}
              onChange={(e) => onPatch({ examType: e.target.value })}
              className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
            >
              {EXAM_TYPES.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </Field>
          <Field label="Audience">
            <select
              value={config.targetAudience || "university"}
              onChange={(e) => onPatch({ targetAudience: e.target.value })}
              className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
            >
              {AUDIENCE_OPTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </Field>
        </div>
      </Section>
    </motion.div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-primary">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-white/70">{label}</Label>
      {children}
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs capitalize transition-colors",
        active ? "border-primary bg-primary/20 text-primary" : "border-white/10 text-white/60 hover:border-white/20"
      )}
    >
      {label}
    </button>
  );
}
