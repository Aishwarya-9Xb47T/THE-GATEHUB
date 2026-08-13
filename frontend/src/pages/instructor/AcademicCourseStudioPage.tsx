import { useCallback } from "react";
import { useLocation } from "react-router-dom";
import { GateHubEditor } from "@/components/overleaf/GateHubEditor";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAcademicStudioProject } from "@/components/academic-studio/useAcademicStudioProject";
import { ACADEMIC_COURSE_SAMPLE_TEX } from "@/components/academic-studio/sampleTemplates";
import { loadBrandingSession } from "@/lib/courseBranding/types";

function parseAcademicStudioMeta(aiContent: unknown): { dslSource?: string; sourceProjectId?: string } {
  if (!aiContent || typeof aiContent !== "string") return {};
  try {
    const parsed = JSON.parse(aiContent) as { academicStudio?: { dslSource?: string; sourceProjectId?: string } };
    return parsed.academicStudio || {};
  } catch {
    return {};
  }
}

export function AcademicCourseStudioPage() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const editId = searchParams.get("edit");
  const branding = loadBrandingSession();

  const fetchExisting = useCallback(async (courseId: string) => {
    const courseRes = await api<{ course: { title: string; aiContent?: string } }>(`/courses/${courseId}`);
    if (courseRes.error || !courseRes.data?.course) return null;

    const course = courseRes.data.course;
    const meta = parseAcademicStudioMeta(course.aiContent);

    return {
      title: course.title,
      dslSource: meta.dslSource || ACADEMIC_COURSE_SAMPLE_TEX,
      sourceProjectId: meta.sourceProjectId,
    };
  }, []);

  const rehydratePath = useCallback((id: string) => `/courses/${id}/rehydrate-project`, []);

  const { projectId, isLoading } = useAcademicStudioProject({
    template: "academic-course",
    sampleMainTex: ACADEMIC_COURSE_SAMPLE_TEX,
    sourceId: editId,
    branding: branding ? { title: branding.title } : undefined,
    fetchExisting,
    rehydratePath,
  });

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#1e1e1e]">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!projectId) {
    return <div>Failed to load</div>;
  }

  return (
    <div className="h-screen w-full overflow-hidden">
      <GateHubEditor
        mode="academic-course"
        projectId={projectId}
        courseId={editId || undefined}
      />
    </div>
  );
}
