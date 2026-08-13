import { LayoutGrid, Globe, GraduationCap, Route, Smartphone, Sparkles } from "lucide-react";
import { resolveBannerSrc } from "@/lib/courseBranding/bannerApi";
import { BannerErrorBoundary, BannerImage } from "./BannerImage";
import { CourseCardBanner, CourseBannerThumb } from "@/components/common/CourseCardBanner";
import { cn } from "@/lib/utils";

interface BannerLivePreviewsProps {
  bannerUrl: string;
  thumbnailUrl?: string;
  title: string;
  subtitle?: string;
  categoryName?: string;
  difficulty?: string;
}

export function BannerLivePreviews({
  bannerUrl,
  thumbnailUrl,
  title,
  subtitle,
  categoryName = "Category",
  difficulty,
}: BannerLivePreviewsProps) {
  const src = resolveBannerSrc(bannerUrl);
  const thumb = resolveBannerSrc(thumbnailUrl || bannerUrl);

  if (!bannerUrl) {
    return (
      <div className="rounded-xl border border-dashed border-primary/20 bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        <Sparkles className="w-8 h-8 mx-auto mb-3 text-primary/40" />
        Select or create a banner to see live previews across THE GATE HUB
      </div>
    );
  }

  return (
    <BannerErrorBoundary>
      <div className="space-y-4 sticky top-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider">Live Preview</p>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Real-time</span>
        </div>

        <PreviewPanel icon={LayoutGrid} label="Course Card">
          <div className="rounded-lg overflow-hidden border border-border bg-card max-w-[240px] shadow-md transition-transform hover:scale-[1.02] duration-200">
            <CourseCardBanner
              bannerUrl={bannerUrl}
              thumbnailUrl={thumbnailUrl}
              alt={title}
              placeholderSeed={categoryName}
            />
            <div className="p-2.5 space-y-1">
              <p className="text-[9px] font-bold text-primary uppercase tracking-wide">{categoryName}</p>
              <p className="text-xs font-bold line-clamp-2 leading-tight">{title || "Course Title"}</p>
              {difficulty && (
                <span className="inline-block text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {difficulty}
                </span>
              )}
            </div>
          </div>
        </PreviewPanel>

        <PreviewPanel icon={GraduationCap} label="Student Dashboard">
          <div className="rounded-lg border border-border bg-card p-2.5 flex gap-2.5 items-center shadow-sm transition-transform hover:scale-[1.01] duration-200">
            <CourseBannerThumb
              bannerUrl={bannerUrl}
              thumbnailUrl={thumbnailUrl}
              alt={title}
              placeholderSeed={title}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground">Continue learning</p>
              <p className="text-xs font-semibold truncate">{title || "Your course"}</p>
              <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full w-[38%] bg-gradient-to-r from-primary to-primary/70 rounded-full" />
              </div>
            </div>
          </div>
        </PreviewPanel>

        <PreviewPanel icon={Route} label="Learning Path">
          <div className="rounded-xl overflow-hidden border border-border bg-gradient-to-br from-card to-muted/40 shadow-sm">
            <div className="aspect-[21/9] relative">
              <BannerImage src={src} alt="" className="w-full h-full object-cover opacity-90" />
              <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/50 to-transparent" />
              <div className="absolute inset-y-0 left-0 flex flex-col justify-center p-4 max-w-[75%]">
                <p className="text-[10px] text-primary font-bold uppercase tracking-widest">{categoryName}</p>
                <h4 className="font-bold text-sm line-clamp-2 mt-0.5">{title || "Learning Path"}</h4>
                {subtitle && <p className="text-[11px] text-muted-foreground line-clamp-1 mt-1">{subtitle}</p>}
                <div className="flex gap-1 mt-2">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className={cn("h-1 flex-1 rounded-full", n === 1 ? "bg-primary" : "bg-muted")} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </PreviewPanel>

        <PreviewPanel icon={Globe} label="Landing Page">
          <div className="rounded-lg overflow-hidden border border-border bg-card shadow-md transition-transform hover:scale-[1.01] duration-200">
            <div className="aspect-[16/9] relative">
              <BannerImage src={src} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="text-[10px] font-bold text-primary uppercase tracking-wider">{categoryName}</p>
                <h4 className="text-white font-bold text-sm line-clamp-1 mt-0.5">{title || "Course Title"}</h4>
                {subtitle && <p className="text-white/70 text-[10px] line-clamp-1 mt-0.5">{subtitle}</p>}
              </div>
            </div>
          </div>
        </PreviewPanel>

        <PreviewPanel icon={Smartphone} label="Mobile">
          <div className="mx-auto w-[140px] rounded-[1.25rem] border-4 border-border bg-card shadow-lg overflow-hidden">
            <div className="h-4 bg-muted flex items-center justify-center">
              <div className="w-8 h-1 rounded-full bg-border" />
            </div>
            <div className="aspect-[9/14] relative">
              <BannerImage src={thumb} alt="" className="w-full h-24 object-cover" />
              <div className="p-2 space-y-1">
                <p className="text-[8px] font-bold text-primary uppercase">{categoryName}</p>
                <p className="text-[10px] font-bold line-clamp-2 leading-tight">{title || "Course"}</p>
                <div className="h-1 rounded-full bg-muted mt-1">
                  <div className="h-full w-1/4 bg-primary rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </PreviewPanel>
      </div>
    </BannerErrorBoundary>
  );
}

function PreviewPanel({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 animate-in fade-in-50 duration-300">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="w-3.5 h-3.5 text-primary/70" />
        {label}
      </div>
      <div className="transition-all duration-200">{children}</div>
    </div>
  );
}
