import type { TemplateFilters } from "@/lib/templateLibrary/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface TemplateFiltersPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: TemplateFilters;
  onChange: (filters: TemplateFilters) => void;
  onApply: () => void;
  onClear: () => void;
}

export function TemplateFiltersPanel({
  open,
  onOpenChange,
  filters,
  onChange,
  onApply,
  onClear,
}: TemplateFiltersPanelProps) {
  const set = <K extends keyof TemplateFilters>(key: K, value: TemplateFilters[K]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 bg-slate-950 text-white">
        <DialogHeader>
          <DialogTitle>Filter templates</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <FilterField label="Difficulty">
            <Select value={filters.difficulty || "all"} onValueChange={(v) => set("difficulty", v === "all" ? undefined : v)}>
              <SelectTrigger className="border-white/15 bg-white/5 text-white">
                <SelectValue placeholder="Any difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Sort by">
            <Select value={filters.sort || "popular"} onValueChange={(v) => set("sort", v as TemplateFilters["sort"])}>
              <SelectTrigger className="border-white/15 bg-white/5 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="popular">Most used</SelectItem>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="rating">Highest rated</SelectItem>
                <SelectItem value="trending">Trending</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Language">
            <Select value={filters.language || "all"} onValueChange={(v) => set("language", v === "all" ? undefined : v)}>
              <SelectTrigger className="border-white/15 bg-white/5 text-white">
                <SelectValue placeholder="Any language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
                <SelectItem value="fr">French</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>

          <div className="space-y-2">
            <Label className="text-white/70">Compatibility</Label>
            <div className="grid grid-cols-2 gap-2">
              <ToggleChip label="Live quiz" active={filters.supportsLive} onClick={() => set("supportsLive", filters.supportsLive ? undefined : true)} />
              <ToggleChip label="Homework" active={filters.supportsHomework} onClick={() => set("supportsHomework", filters.supportsHomework ? undefined : true)} />
              <ToggleChip label="AI features" active={filters.supportsAi} onClick={() => set("supportsAi", filters.supportsAi ? undefined : true)} />
              <ToggleChip label="Rich media" active={filters.supportsMedia} onClick={() => set("supportsMedia", filters.supportsMedia ? undefined : true)} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClear}>
            Clear all
          </Button>
          <Button
            type="button"
            onClick={() => {
              onApply();
              onOpenChange(false);
            }}
          >
            Apply filters
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-white/70">{label}</Label>
      {children}
    </div>
  );
}

function ToggleChip({ label, active, onClick }: { label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2 text-left text-xs transition-colors",
        active ? "border-primary bg-primary/20 text-white" : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10"
      )}
    >
      {label}
    </button>
  );
}
