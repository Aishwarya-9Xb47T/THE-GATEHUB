import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Fetching all courses...");
  const courses = await prisma.course.findMany({
    include: { instructor: true }
  });
  
  console.log(`Found ${courses.length} total courses.`);

  const toDelete = courses.filter(course => {
    const fn = course.instructor.firstName.toLowerCase();
    const ln = course.instructor.lastName.toLowerCase();
    return !fn.includes('aishw') && !ln.includes('aishw');
  });

  console.log(`Found ${toDelete.length} courses NOT by Aishwarya. Deleting...`);

  for (const course of toDelete) {
    console.log(`Deleting: ${course.title} (by ${course.instructor.firstName} ${course.instructor.lastName})`);
    
    try {
      // Need to delete related entities first in case Cascade is not fully supported on some manual relations
      await prisma.enrollment.deleteMany({ where: { courseId: course.id } });
      await prisma.review.deleteMany({ where: { courseId: course.id } });
      
      const sections = await prisma.section.findMany({ where: { courseId: course.id } });
      for (const section of sections) {
         const lectures = await prisma.lecture.findMany({ where: { sectionId: section.id } });
         for (const lec of lectures) {
           await prisma.lectureProgress.deleteMany({ where: { lectureId: lec.id } });
           await prisma.quiz.deleteMany({ where: { lectureId: lec.id } });
           await prisma.lecture.delete({ where: { id: lec.id } });
         }
         await prisma.section.delete({ where: { id: section.id } });
      }

      // Finally delete the course
      await prisma.course.delete({ where: { id: course.id } });
      console.log(`-> Successfully deleted ${course.title}`);
    } catch(err: any) {
      console.error(`Failed to delete ${course.title}: ${err.message}`);
    }
  }

  console.log("Cleanup complete!");
}

main().finally(() => prisma.$disconnect());
