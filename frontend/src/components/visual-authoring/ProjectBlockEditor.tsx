import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PROJECT_SUBMISSION_TYPES } from "@/lib/visualBuilder/blockToolbar";
import { validateColabUrl } from "@/lib/colabUrlValidator";

interface ProjectContent {
  title?: string;
  description?: string;
  instructions?: string;
  rubric?: string;
  maxMarks?: number;
  difficulty?: string;
  colabUrl?: string;
  githubUrl?: string;
  submissionType?: string;
  expectedDeliverables?: string;
}

interface ProjectBlockEditorProps {
  content: ProjectContent;
  onChange: (patch: Partial<ProjectContent>) => void;
  variant?: "project" | "colab" | "github";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function ProjectBlockEditor({ content, onChange, variant = "project" }: ProjectBlockEditorProps) {
  const showColab = variant === "colab" || !!content.colabUrl;
  const showGithub = variant === "github" || !!content.githubUrl;

  return (
    <div className="space-y-3">
      <Field label="Project Title">
        <Input value={content.title || ""} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      <Field label="Description">
        <Textarea value={content.description || ""} onChange={(e) => onChange({ description: e.target.value })} className="min-h-20" />
      </Field>
      <Field label="Instructions">
        <Textarea value={content.instructions || ""} onChange={(e) => onChange({ instructions: e.target.value })} className="min-h-24" />
      </Field>
      <Field label="Rubric">
        <Textarea value={content.rubric || ""} onChange={(e) => onChange({ rubric: e.target.value })} placeholder="Grading criteria..." className="min-h-20" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Maximum Marks">
          <Input type="number" value={content.maxMarks ?? ""} onChange={(e) => onChange({ maxMarks: Number(e.target.value) || undefined })} />
        </Field>
        <Field label="Difficulty">
          <Select value={content.difficulty || "Intermediate"} onValueChange={(v) => onChange({ difficulty: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Beginner">Beginner</SelectItem>
              <SelectItem value="Intermediate">Intermediate</SelectItem>
              <SelectItem value="Advanced">Advanced</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Submission Type">
        <Select value={content.submissionType || "zip"} onValueChange={(v) => onChange({ submissionType: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {PROJECT_SUBMISSION_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {showColab && (
        <>
          <Field label="Notebook URL">
            <Input value={content.colabUrl || ""} onChange={(e) => onChange({ colabUrl: e.target.value })} placeholder="https://colab.research.google.com/..." />
            {content.colabUrl && !validateColabUrl(content.colabUrl).valid && (
              <p className="text-xs text-destructive mt-1">Invalid Google Colab notebook URL</p>
            )}
          </Field>
          <Field label="Expected Deliverables">
            <Textarea value={content.expectedDeliverables || ""} onChange={(e) => onChange({ expectedDeliverables: e.target.value })} />
          </Field>
        </>
      )}
      {showGithub && (
        <Field label="Repository URL">
          <Input value={content.githubUrl || ""} onChange={(e) => onChange({ githubUrl: e.target.value })} placeholder="https://github.com/user/repo" />
        </Field>
      )}
      {variant === "project" && !showColab && !showGithub && (
        <>
          <Field label="Colab URL (optional)">
            <Input value={content.colabUrl || ""} onChange={(e) => onChange({ colabUrl: e.target.value })} />
          </Field>
          <Field label="GitHub URL (optional)">
            <Input value={content.githubUrl || ""} onChange={(e) => onChange({ githubUrl: e.target.value })} />
          </Field>
        </>
      )}
    </div>
  );
}
