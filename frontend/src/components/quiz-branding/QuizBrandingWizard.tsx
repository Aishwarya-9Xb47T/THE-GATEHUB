import { useRef } from "react";
import { Palette } from "lucide-react";
import { BannerStudio } from "@/components/course-branding/BannerStudio";
import { ThemePicker } from "./ThemePicker";
import { AccentColorPicker } from "./AccentColorPicker";
import { QuizIconPicker } from "./QuizIconPicker";
import { QuizIdentityPreview } from "./QuizIdentityPreview";
import type { QuizBrandingData, QuizDetailsData } from "@/lib/quizBranding/types";
import type { BannerType } from "@/lib/courseBranding/types";
import type { QuizCreationMethod } from "@/components/quiz-room/wizard/CreateMethodStep";
import { WORKFLOW_LABELS } from "@/lib/quizBranding/types";

interface QuizBrandingWizardProps {
  workflow: QuizCreationMethod;
  branding: QuizBrandingData;
  detailsPreview?: Partial<QuizDetailsData>;
  onChange: (branding: QuizBrandingData) => void;
}

export function QuizBrandingWizard({ workflow, branding, detailsPreview, onChange }: QuizBrandingWizardProps) {
  const bannerManuallySet = useRef(!!branding.bannerUrl);

  const patch = (p: Partial<QuizBrandingData>) => onChange({ ...branding, ...p });

  const handleBannerChange = (selection: {
    bannerUrl: string;
    thumbnailUrl: string;
    bannerType: BannerType;
    bannerId?: string;
    selectedTemplateId?: string;
    selectedSourceId?: string;
  }) => {
    if (selection.bannerUrl) bannerManuallySet.current = true;
    patch(selection);
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-primary">{WORKFLOW_LABELS[workflow]}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Quiz Branding</h1>
        <p className="mt-3 text-white/60">Choose your banner, theme, and visual identity.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Banner</h2>
            </div>
            <div className="[&_.text-muted-foreground]:text-white/50 [&_input]:border-white/15 [&_input]:bg-white/5 [&_input]:text-white">
              <BannerStudio
                bannerUrl={branding.bannerUrl}
                thumbnailUrl={branding.thumbnailUrl}
                bannerType={branding.bannerType}
                bannerId={branding.bannerId}
                selectedTemplateId={branding.selectedTemplateId}
                selectedSourceId={branding.selectedSourceId}
                onChange={handleBannerChange}
                title={detailsPreview?.title}
                subtitle={detailsPreview?.subtitle}
                categoryName={detailsPreview?.category}
                difficulty={detailsPreview?.difficulty}
                showPreviews={false}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="mb-4 text-lg font-semibold">Theme</h2>
            <ThemePicker value={branding.theme} onChange={(theme) => patch({ theme })} dark />
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="mb-4 text-lg font-semibold">Accent Color</h2>
            <AccentColorPicker value={branding.accentColor} customAccent={branding.customAccent} onChange={(accentColor, customAccent) => patch({ accentColor, customAccent })} dark />
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="mb-4 text-lg font-semibold">Quiz Icon</h2>
            <QuizIconPicker value={branding.icon} customIcon={branding.customIcon} onChange={(icon, customIcon) => patch({ icon, customIcon })} dark />
          </section>
        </div>

        <div className="lg:col-span-2">
          <div className="sticky top-4 space-y-3">
            <p className="text-xs font-medium uppercase tracking-widest text-white/50">Live Preview</p>
            <QuizIdentityPreview branding={branding} details={detailsPreview} />
          </div>
        </div>
      </div>
    </div>
  );
}
