import { useMemo, useState } from "react";
import { Search, Star, Clock } from "lucide-react";
import {
  QUESTION_TYPE_CATALOG,
  TYPE_CATEGORIES,
  getRecentTypes,
  getFavoriteTypes,
  toggleFavoriteType,
} from "@/lib/quizBuilder/questionTypeCatalog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface AddQuestionTypeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (typeId: string) => void;
}

export function AddQuestionTypeModal({ open, onOpenChange, onSelect }: AddQuestionTypeModalProps) {
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState(getFavoriteTypes);

  const filtered = useMemo(() => {
    if (!search.trim()) return QUESTION_TYPE_CATALOG;
    const s = search.toLowerCase();
    return QUESTION_TYPE_CATALOG.filter(
      (t) => t.label.toLowerCase().includes(s) || t.description.toLowerCase().includes(s) || t.category.toLowerCase().includes(s)
    );
  }, [search]);

  const recent = getRecentTypes()
    .map((id) => QUESTION_TYPE_CATALOG.find((t) => t.id === id))
    .filter(Boolean);

  const favTypes = favorites
    .map((id) => QUESTION_TYPE_CATALOG.find((t) => t.id === id))
    .filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-xl">Choose question type</DialogTitle>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search types…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </DialogHeader>

        <div className="max-h-[calc(90vh-8rem)] overflow-y-auto px-6 py-4">
          {!search && favTypes.length > 0 && (
            <TypeSection title="Favorites" icon={Star}>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {favTypes.map((t) => t && (
                  <TypeCard
                    key={t.id}
                    type={t}
                    isFavorite
                    onSelect={() => { onSelect(t.id); onOpenChange(false); }}
                    onToggleFavorite={() => setFavorites(toggleFavoriteType(t.id))}
                  />
                ))}
              </div>
            </TypeSection>
          )}

          {!search && recent.length > 0 && (
            <TypeSection title="Recently used" icon={Clock}>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {recent.map((t) => t && (
                  <TypeCard
                    key={t.id}
                    type={t}
                    isFavorite={favorites.includes(t.id)}
                    onSelect={() => { onSelect(t.id); onOpenChange(false); }}
                    onToggleFavorite={() => setFavorites(toggleFavoriteType(t.id))}
                  />
                ))}
              </div>
            </TypeSection>
          )}

          {TYPE_CATEGORIES.map((cat) => {
            const items = filtered.filter((t) => t.category === cat);
            if (!items.length) return null;
            return (
              <TypeSection key={cat} title={cat}>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((t) => (
                    <TypeCard
                      key={t.id}
                      type={t}
                      isFavorite={favorites.includes(t.id)}
                      onSelect={() => { onSelect(t.id); onOpenChange(false); }}
                      onToggleFavorite={() => setFavorites(toggleFavoriteType(t.id))}
                    />
                  ))}
                </div>
              </TypeSection>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TypeSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: typeof Star;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        {Icon && <Icon className="h-4 w-4" />}
        {title}
      </h3>
      {children}
    </section>
  );
}

function TypeCard({
  type,
  isFavorite,
  onSelect,
  onToggleFavorite,
}: {
  type: (typeof QUESTION_TYPE_CATALOG)[number];
  isFavorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  const Icon = type.icon;
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full flex-col items-start gap-2 rounded-xl border border-border/60 bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-md"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <span className="font-medium">{type.label}</span>
        <span className="text-xs text-muted-foreground">{type.description}</span>
      </button>
      <button
        type="button"
        className="absolute right-2 top-2 rounded-md p-1 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
        aria-label="Toggle favorite"
      >
        <Star className={cn("h-4 w-4", isFavorite && "fill-amber-400 text-amber-400")} />
      </button>
    </div>
  );
}
