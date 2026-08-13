import { Clock } from "lucide-react";
import { QuizCoverBanner } from "@/components/quiz-branding/QuizCoverBanner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  resolveAccentHex,
  type QuizBrandingData,
  type QuizDetailsData,
} from "@/lib/quizBranding/types";

interface QuizIdentityPreviewProps {
  branding: Partial<QuizBrandingData>;
  details?: Partial<QuizDetailsData>;
  dark?: boolean;
}

export function QuizIdentityPreview({ branding, details, dark = true }: QuizIdentityPreviewProps) {
  const title = details?.title?.trim() || "Your Quiz Title";
  const subtitle = details?.subtitle?.trim();
  const accent = resolveAccentHex(branding as QuizBrandingData);

  return (
    <div className={cn("overflow-hidden rounded-2xl border shadow-xl", dark ? "border-white/10 bg-white/5" : "border-border bg-card")}>
      <QuizCoverBanner
        bannerUrl={branding.bannerUrl}
        thumbnailUrl={branding.thumbnailUrl}
        theme={branding.theme}
        alt={title}
        icon={branding as QuizBrandingData}
        className="h-36 sm:h-44"
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="truncate text-lg font-bold text-white">{title}</h3>
          {subtitle && <p className="truncate text-sm text-white/80">{subtitle}</p>}
        </div>
      </QuizCoverBanner>
      <div className={cn("space-y-2 p-4 text-sm", dark ? "text-white/70" : "text-muted-foreground")}>
        {details?.description && <p className="line-clamp-2">{details.description}</p>}
        <div className="flex flex-wrap gap-2 text-xs">
          {details?.estimatedMinutes != null && details.estimatedMinutes > 0 && (
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{details.estimatedMinutes}m</span>
          )}
          {details?.difficulty && <Badge variant="outline" className="capitalize text-[10px]">{details.difficulty}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: accent }} />
          <span className="text-[10px] capitalize">{branding.theme?.replace("-", " ") || "dark"} theme</span>
        </div>
      </div>
    </div>
  );
}
