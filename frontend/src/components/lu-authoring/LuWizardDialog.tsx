import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type WizardType = "track" | "module" | "lesson" | "quiz" | "project" | "resource";

const TITLES: Record<WizardType, string> = {
  track: "New Track",
  module: "New Module",
  lesson: "New Lesson",
  quiz: "New Quiz",
  project: "New Project",
  resource: "New Resource",
};

const DESCRIPTIONS: Record<WizardType, string> = {
  track: "Add a learning track to organize modules.",
  module: "Add a module with a scaffolded first lesson.",
  lesson: "Add a lesson with overview, practice, quiz, and checkpoint templates.",
  quiz: "Add a quiz block to the last lesson in this module.",
  project: "Add a project with instructions, deliverables, and rubric.",
  resource: "Add resource links and downloads.",
};

interface LuWizardDialogProps {
  open: boolean;
  type: WizardType | null;
  onClose: () => void;
  onSubmit: (data: Record<string, string>) => void;
}

export function LuWizardDialog({ open, type, onClose, onSubmit }: LuWizardDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleOpen = (isOpen: boolean) => {
    if (!isOpen) {
      setTitle("");
      setDescription("");
      onClose();
    }
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), description: description.trim() });
    setTitle("");
    setDescription("");
  };

  if (!type) return null;

  const showDescription = type === "track" || type === "module";

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{TITLES[type]}</DialogTitle>
          <DialogDescription>{DESCRIPTIONS[type]}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="wiz-title">Title</Label>
            <Input
              id="wiz-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                type === "lesson"
                  ? "Introduction to Neural Networks"
                  : type === "quiz"
                    ? "Module Review Quiz"
                    : "Enter title..."
              }
              autoFocus
            />
          </div>
          {showDescription && (
            <div className="space-y-2">
              <Label htmlFor="wiz-desc">Description</Label>
              <Textarea
                id="wiz-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What learners will achieve..."
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!title.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
