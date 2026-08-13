import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { LayoutTemplate } from "lucide-react";
import { saveQuizAsTemplate } from "@/lib/templateLibrary/api";
import { TEMPLATE_CATEGORY_CHIPS } from "@/lib/templateLibrary/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToastStore } from "@/store/toastStore";

interface SaveTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quizId: string;
  defaultTitle: string;
  defaultDescription?: string;
  defaultSubject?: string;
  onSaved?: (templateId: string) => void;
}

export function SaveTemplateDialog({
  open,
  onOpenChange,
  quizId,
  defaultTitle,
  defaultDescription,
  defaultSubject,
  onSaved,
}: SaveTemplateDialogProps) {
  const toast = useToastStore((s) => s.add);
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription || "");
  const [category, setCategory] = useState<string>(TEMPLATE_CATEGORY_CHIPS[0]);
  const [subject, setSubject] = useState(defaultSubject || "");
  const [gradeLevel, setGradeLevel] = useState("University");
  const [difficulty, setDifficulty] = useState("medium");
  const [visibility, setVisibility] = useState("private");
  const [tags, setTags] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      saveQuizAsTemplate({
        quizId,
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        subject: subject.trim() || undefined,
        gradeLevel,
        difficulty,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        visibility,
      }),
    onSuccess: (res) => {
      const id = res.data?.data?.id;
      toast({
        title: "Template saved",
        description: `"${title}" is in your Template Library.`,
        variant: "success",
      });
      onOpenChange(false);
      if (id) onSaved?.(id);
    },
    onError: () => {
      toast({
        title: "Could not save template",
        description: "Ensure the quiz is saved and the database migration has run.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-primary" />
            Save as template
          </DialogTitle>
          <DialogDescription>
            Reuse this quiz layout in the Template Library — customize title, category, and visibility.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Template title" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What is this template best for?"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {TEMPLATE_CATEGORY_CHIPS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Computer Science" />
            </div>
            <div className="space-y-2">
              <Label>Grade level</Label>
              <Select value={gradeLevel} onValueChange={setGradeLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="School">School</SelectItem>
                  <SelectItem value="University">University</SelectItem>
                  <SelectItem value="Corporate">Corporate</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Tags (comma-separated)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="midterm, python, review" />
          </div>
          <div className="space-y-2">
            <Label>Visibility</Label>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private — only you</SelectItem>
                <SelectItem value="organization">Organization</SelectItem>
                <SelectItem value="public">Public gallery</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!title.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : "Save template"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
