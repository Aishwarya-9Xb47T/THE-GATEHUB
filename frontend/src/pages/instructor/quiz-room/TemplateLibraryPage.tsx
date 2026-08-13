import { TemplateLibrary } from "@/components/template-library/TemplateLibrary";
import { StudioFullscreenShell } from "@/components/quiz-room/StudioFullscreenShell";

export function TemplateLibraryPage() {
  return (
    <StudioFullscreenShell
      eyebrow="Quiz Room"
      title="Template Library"
      backTo="/instructor/quiz-room"
    >
      <TemplateLibrary />
    </StudioFullscreenShell>
  );
}
