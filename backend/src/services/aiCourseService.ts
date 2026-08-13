import { prisma } from "../utils/prisma.js";
import { generateUdemyStyleContent, AICourseDetails } from "./aiService.js";

export async function generateCourseDetails(courseId: string): Promise<AICourseDetails> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      sections: {
        include: { lectures: true }
      }
    }
  });

  if (!course) throw new Error("Course not found");

  // Check if already exists
  if (course.aiContent) {
    try {
      return JSON.parse(course.aiContent);
    } catch (e) {
      console.error("Failed to parse cached aiContent", e);
    }
  }

  const contentSummary = course.sections.map(s => {
    return `Section: ${s.title}\nLectures: ${s.lectures.map(l => l.title).join(", ")}\nNotes: ${s.lectures.map(l => l.content || "").join("\n")}`;
  }).join("\n\n");

  const aiContent = await generateUdemyStyleContent(course.title, contentSummary);

  await prisma.course.update({
    where: { id: courseId },
    data: { aiContent: JSON.stringify(aiContent) }
  });

  return aiContent;
}
