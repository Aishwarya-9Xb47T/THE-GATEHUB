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
import { useEffect, useState } from "react";
import type { LuExplorerNode } from "@/lib/luAuthoring/types";
import { NODE_ICONS } from "@/lib/luAuthoring/nodeMeta";

interface LuRenameDialogProps {
  node: LuExplorerNode | null;
  onClose: () => void;
  onSubmit: (title: string) => void;
}

export function LuRenameDialog({ node, onClose, onSubmit }: LuRenameDialogProps) {
  const [title, setTitle] = useState("");

  useEffect(() => {
    setTitle(node?.title || "");
  }, [node]);

  if (!node) return null;

  return (
    <Dialog open={!!node} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename {node.kind}</DialogTitle>
          <DialogDescription>Update the display title for this {node.kind}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="rename-title">Title</Label>
          <Input
            id="rename-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && title.trim()) {
                onSubmit(title.trim());
                onClose();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!title.trim()}
            onClick={() => {
              onSubmit(title.trim());
              onClose();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface LuPropertiesDialogProps {
  node: LuExplorerNode | null;
  onClose: () => void;
}

export function LuPropertiesDialog({ node, onClose }: LuPropertiesDialogProps) {
  if (!node) return null;

  return (
    <Dialog open={!!node} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {NODE_ICONS[node.kind]} Properties
          </DialogTitle>
          <DialogDescription>{node.title}</DialogDescription>
        </DialogHeader>
        <dl className="space-y-2 text-sm py-2">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Type</dt>
            <dd className="text-slate-200 capitalize">{node.kind}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Status</dt>
            <dd className="text-slate-200 capitalize">{node.status}</dd>
          </div>
          {node.filePath && (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500 shrink-0">Source</dt>
              <dd className="text-slate-400 text-xs font-mono text-right break-all">{node.filePath}</dd>
            </div>
          )}
          {node.issues.length > 0 && (
            <div>
              <dt className="text-slate-500 mb-1">Issues</dt>
              <dd className="text-amber-400 text-xs space-y-1">
                {node.issues.map((i, idx) => (
                  <p key={idx}>{i.message}</p>
                ))}
              </dd>
            </div>
          )}
        </dl>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
