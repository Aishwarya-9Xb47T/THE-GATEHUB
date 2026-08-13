import { useCallback, useState } from "react";
import { TemplateLibrary } from "@/components/template-library/TemplateLibrary";
import { TemplateMergeDialog } from "@/components/quiz-branding/TemplateMergeDialog";
import { useTemplateWithIdentity } from "@/lib/quizBranding/identityApi";
import type { QuizIdentity, TemplateMergeMode } from "@/lib/quizBranding/types";
import type { QuizTemplateSummary } from "@/lib/templateLibrary/types";
import { useToastStore } from "@/store/toastStore";

interface TemplatePickStepProps {
  identity: QuizIdentity;
  onUseTemplate: (quizId: string) => void;
}

export function TemplatePickStep({ identity, onUseTemplate }: TemplatePickStepProps) {
  const toast = useToastStore((s) => s.add);
  const [pendingTemplate, setPendingTemplate] = useState<QuizTemplateSummary | null>(null);
  const [applying, setApplying] = useState(false);

  const handleUseRequest = useCallback((template: QuizTemplateSummary) => {
    setPendingTemplate(template);
  }, []);

  const handleMergeChoice = async (mode: TemplateMergeMode) => {
    if (!pendingTemplate) return;
    setApplying(true);
    const res = await useTemplateWithIdentity(pendingTemplate.id, identity, mode);
    setApplying(false);
    const tpl = pendingTemplate;
    setPendingTemplate(null);
    if (res.error || !res.data?.data?.quizId) {
      toast({ title: "Could not use template", description: res.error, variant: "destructive" });
      return;
    }
    toast({ title: mode === "merge" ? "Template merged" : "Template applied", variant: "success" });
    onUseTemplate(res.data.data.quizId);
  };

  return (
    <>
      <TemplateLibrary embedded onUseTemplateRequest={handleUseRequest} applying={applying} />
      <TemplateMergeDialog
        open={!!pendingTemplate}
        templateTitle={pendingTemplate?.title || ""}
        onSelect={handleMergeChoice}
        onCancel={() => !applying && setPendingTemplate(null)}
      />
    </>
  );
}
