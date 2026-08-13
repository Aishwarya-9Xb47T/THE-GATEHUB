import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TemplateMergeMode } from "@/lib/quizBranding/types";

interface TemplateMergeDialogProps {
  open: boolean;
  templateTitle: string;
  onSelect: (mode: TemplateMergeMode) => void;
  onCancel: () => void;
}

export function TemplateMergeDialog({ open, templateTitle, onSelect, onCancel }: TemplateMergeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="border-white/10 bg-slate-900 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Use template: {templateTitle}</DialogTitle>
          <DialogDescription className="text-white/60">
            Your banner and theme are preserved by default. Template contributes questions and settings only.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button variant="outline" className="border-white/20 text-white" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onSelect("merge")}>Keep my branding</Button>
          <Button variant="destructive" onClick={() => onSelect("replace")}>Replace branding</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
