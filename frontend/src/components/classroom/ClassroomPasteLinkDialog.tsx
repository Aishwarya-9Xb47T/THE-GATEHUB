import { useState } from 'react';
import { Link as LinkIcon, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseClassroomJoinInput, classroomJoinTargetPath } from '@/lib/classroom/joinUrls';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJoinPath: (path: string) => void;
};

export function ClassroomPasteLinkDialog({ open, onOpenChange, onJoinPath }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = () => {
    setBusy(true);
    setError(null);
    const parsed = parseClassroomJoinInput(value);
    if (!parsed.ok) {
      setError(parsed.reason || 'Invalid classroom link.');
      setBusy(false);
      return;
    }
    const path = classroomJoinTargetPath(parsed);
    onJoinPath(path);
    setBusy(false);
    setValue('');
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setValue('');
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join Classroom</DialogTitle>
          <DialogDescription>
            Paste the classroom link from your instructor, or enter the session code.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Classroom link or code
          </label>
          <Input
            autoFocus
            placeholder="https://…/student/classroom/join/833366"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className="h-11"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full h-11" onClick={submit} disabled={!value.trim() || busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Joining…
              </>
            ) : (
              <>
                <LinkIcon className="h-4 w-4 mr-2" /> Join Classroom
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
