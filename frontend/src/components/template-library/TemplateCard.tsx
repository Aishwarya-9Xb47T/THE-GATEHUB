import { motion } from "framer-motion";
import { Bookmark, Clock, Copy, Eye, Play, Star, Trash2, Users } from "lucide-react";
import type { QuizTemplateSummary } from "@/lib/templateLibrary/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TemplateCardProps {
  template: QuizTemplateSummary;
  onPreview: () => void;
  onUse: () => void;
  onFavorite: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  compact?: boolean;
}

function formatUpdated(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

export function TemplateCard({ template, onPreview, onUse, onFavorite, onDuplicate, onDelete, compact }: TemplateCardProps) {
  const coverStyle = template.coverGradient ? { background: template.coverGradient } : undefined;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-lg backdrop-blur-sm transition-shadow hover:border-primary/40 hover:shadow-primary/10",
        compact && "max-w-xs"
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        {template.coverImageUrl ? (
          <img
            src={template.coverImageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full" style={coverStyle} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1">
          {template.isOfficial && <Badge className="bg-primary/90 text-[10px]">Official</Badge>}
          {template.isFeatured && <Badge className="bg-amber-500/90 text-[10px]">Featured</Badge>}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFavorite();
          }}
          className="absolute right-3 top-3 rounded-full bg-black/40 p-2 backdrop-blur-sm transition-colors hover:bg-black/60"
          aria-label={template.favorited ? "Remove bookmark" : "Bookmark"}
        >
          <Bookmark className={cn("h-4 w-4", template.favorited ? "fill-primary text-primary" : "text-white")} />
        </button>
        <div className="absolute bottom-3 left-3 right-3">
          <p className="line-clamp-2 text-sm font-bold text-white">{template.title}</p>
          <p className="text-[11px] text-white/70">{template.subject || template.category}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {!compact && template.description && (
          <p className="line-clamp-2 text-xs text-white/55">{template.description}</p>
        )}

        {!compact && template.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {template.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[9px]">{tag}</Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="border-white/15 text-[10px] text-white/70">
            {template.questionCount} Q
          </Badge>
          <Badge variant="outline" className="border-white/15 text-[10px] text-white/70">
            <Clock className="mr-0.5 h-3 w-3" />
            {template.durationMinutes ?? "—"}m
          </Badge>
          <Badge variant="outline" className="border-white/15 text-[10px] capitalize text-white/70">
            {template.difficulty}
          </Badge>
        </div>

        {!compact && template.questionTypes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {template.questionTypes.slice(0, 4).map((t) => (
              <span key={t} className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-white/60">{t.replace(/_/g, " ")}</span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-white/50">
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            {template.ratingAvg.toFixed(1)}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {template.useCount.toLocaleString()}
          </span>
          <span className="truncate max-w-[80px]">{template.authorName || "THE GATEHUB"}</span>
        </div>

        {!compact && (
          <p className="text-[10px] text-white/40">Updated {formatUpdated(template.updatedAt)}</p>
        )}

        <div className="mt-auto flex gap-2">
          <Button type="button" variant="outline" size="sm" className="flex-1 border-white/15 bg-white/5" onClick={onPreview}>
            <Eye className="mr-1 h-3.5 w-3.5" />
            Preview
          </Button>
          <Button type="button" size="sm" className="flex-1" onClick={onUse}>
            <Play className="mr-1 h-3.5 w-3.5" />
            Use
          </Button>
          {onDuplicate && (
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onDuplicate} title="Duplicate to My Templates">
              <Copy className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-red-400 hover:text-red-300" onClick={onDelete} title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </motion.article>
  );
}
