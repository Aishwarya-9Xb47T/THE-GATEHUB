import { getAcademicStudioPath, PRODUCT_TYPES } from "@/lib/productTypes";

export interface CourseAcademicStudioEdit {
  learningUniverseId?: string;
  sourceProjectId?: string;
}

export interface InstructorCourseEditInput {
  id: string;
  academicStudioEdit?: CourseAcademicStudioEdit | null;
}

/** Resolve Edit destination: Academic Studio when a project exists, else Curriculum Builder. */
export function getInstructorCourseEditPath(course: InstructorCourseEditInput): string {
  const edit = course.academicStudioEdit;
  if (edit?.learningUniverseId) {
    return getAcademicStudioPath(edit.learningUniverseId, PRODUCT_TYPES.PREMIUM_COURSE);
  }
  if (edit?.sourceProjectId) {
    return `/instructor/learning-universe/new/academic?project=${encodeURIComponent(edit.sourceProjectId)}`;
  }
  return `/instructor/course/${course.id}/edit`;
}

export function courseHasAcademicStudioProject(course: InstructorCourseEditInput): boolean {
  const edit = course.academicStudioEdit;
  return Boolean(edit?.learningUniverseId || edit?.sourceProjectId);
}
