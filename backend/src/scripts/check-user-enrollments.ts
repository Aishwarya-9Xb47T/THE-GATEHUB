import { prisma } from "../utils/prisma.js";
import { downloadCompleteLearningUniverse, downloadCompleteCourse } from "../controllers/enhancedCourseDownloadController.js";
import { Writable } from "stream";
import fs from "fs";
import path from "path";

class NullWritable extends Writable {
  _write(chunk: any, encoding: string, callback: (error?: Error | null) => void) {
    callback();
  }
}

async function main() {
  // Find user by name
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { firstName: { contains: "Komala" } },
        { lastName: { contains: "Komala" } },
        { firstName: { contains: "N S" } },
      ]
    }
  });

  if (!user) {
    console.error("User N S Komala not found in database.");
    return;
  }

  console.log(`Found user: ${user.firstName} ${user.lastName} (ID: ${user.id}, Role: ${user.role})`);

  // Find course enrollments
  const courseEnrollments = await prisma.enrollment.findMany({
    where: { userId: user.id },
    include: { course: true }
  });

  console.log(`Course enrollments: ${courseEnrollments.length}`);
  for (const ce of courseEnrollments) {
    console.log(`- Course: ${ce.course.title} (ID: ${ce.course.id})`);
    try {
      const mockReq: any = {
        params: { id: ce.course.id },
        user: { id: user.id, role: user.role }
      };
      const mockRes: any = new NullWritable();
      mockRes.setHeader = () => {};
      mockRes.status = () => mockRes;
      mockRes.send = () => {};
      mockRes.json = () => {};

      await downloadCompleteCourse(mockReq, mockRes);
      console.log(`  Course download SUCCESS!`);
    } catch (e: any) {
      console.error(`  Course download FAILED:`, e.message, e.stack);
    }
  }

  // Find LU enrollments
  const luEnrollments = await prisma.learningUniverseEnrollment.findMany({
    where: { userId: user.id },
    include: { learningUniverse: true }
  });

  console.log(`Learning Universe enrollments: ${luEnrollments.length}`);
  for (const lue of luEnrollments) {
    console.log(`- LU: ${lue.learningUniverse.title} (ID: ${lue.learningUniverse.id})`);
    try {
      const mockReq: any = {
        params: { id: lue.learningUniverse.id },
        user: { id: user.id, role: user.role }
      };
      const mockRes: any = new NullWritable();
      mockRes.setHeader = () => {};
      mockRes.status = () => mockRes;
      mockRes.send = () => {};
      mockRes.json = () => {};

      await downloadCompleteLearningUniverse(mockReq, mockRes);
      console.log(`  LU download SUCCESS!`);
    } catch (e: any) {
      console.error(`  LU download FAILED:`, e.message, e.stack);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
