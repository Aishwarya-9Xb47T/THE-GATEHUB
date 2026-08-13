import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface DuplicateBrandingDialogProps {
  open: boolean;
  quizTitle: string;
  onSelect: (keepOriginalBranding: boolean) => void;
  onCancel: () => void;
}

export function DuplicateBrandingDialog({ open, quizTitle, onSelect, onCancel }: DuplicateBrandingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="border-white/10 bg-slate-900 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Duplicate: {quizTitle}</DialogTitle>
          <DialogDescription className="text-white/60">Keep the original quiz branding, or use your newly selected banner?</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button variant="outline" className="border-white/20 text-white" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onSelect(true)}>Yes — keep original branding</Button>
          <Button onClick={() => onSelect(false)}>No — use my branding</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
