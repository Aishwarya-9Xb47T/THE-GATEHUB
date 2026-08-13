import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BLOCK_TOOLBAR_GROUPS, createBlockFromToolbarItem } from "@/lib/visualBuilder/blockToolbar";
import type { LuContentBlock } from "@/lib/learningUniverseSchema";

interface BlockTypeToolbarProps {
  onAdd: (block: LuContentBlock) => void;
}

export function BlockTypeToolbar({ onAdd }: BlockTypeToolbarProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" className="gap-1">
          <Plus className="w-4 h-4" /> Add Block
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Content Block</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 pt-2">
          {BLOCK_TOOLBAR_GROUPS.map((group) => (
            <div key={group.label}>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">{group.label}</h4>
              <div className="flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onAdd(createBlockFromToolbarItem(item));
                      setOpen(false);
                    }}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
