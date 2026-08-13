import { StudentLearningPlatform } from "@/learning-engine/StudentLearningPlatform";

/** Canonical course player delegating to the single StudentLearningPlatform engine. */
export function CoursePlayerPage() {
  return <StudentLearningPlatform />;
}
