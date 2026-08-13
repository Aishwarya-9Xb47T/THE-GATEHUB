import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { EditorSettings } from "./types";

interface EditorSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: EditorSettings;
  onChange: (patch: Partial<EditorSettings>) => void;
}

export function EditorSettingsDialog({
  open,
  onOpenChange,
  settings,
  onChange,
}: EditorSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#252526] border-slate-700 text-slate-200">
        <DialogHeader>
          <DialogTitle>Editor Settings</DialogTitle>
          <DialogDescription className="text-slate-400">
            Configure compile and preview behavior (Overleaf-style).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <Label className="text-slate-200">Auto Compile</Label>
              <p className="text-xs text-slate-500">Recompile after you stop typing</p>
            </div>
            <input
              type="checkbox"
              checked={settings.autoCompile}
              onChange={(e) => onChange({ autoCompile: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
          </label>

          {settings.autoCompile && (
            <div>
              <Label className="text-slate-300 text-xs">Auto compile delay (seconds)</Label>
              <input
                type="range"
                min={1}
                max={10}
                value={settings.autoCompileDelayMs / 1000}
                onChange={(e) => onChange({ autoCompileDelayMs: Number(e.target.value) * 1000 })}
                className="w-full mt-1 accent-primary"
              />
              <p className="text-[10px] text-slate-500 mt-1">{settings.autoCompileDelayMs / 1000}s after last edit</p>
            </div>
          )}

          <label className="flex items-center justify-between gap-4 opacity-80">
            <div>
              <Label className="text-slate-200">Auto Save</Label>
              <p className="text-xs text-slate-500">Always on — all edited files save automatically</p>
            </div>
            <input
              type="checkbox"
              checked
              disabled
              readOnly
              className="h-4 w-4 accent-primary"
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-600">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
