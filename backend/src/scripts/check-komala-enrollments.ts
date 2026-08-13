import { prisma } from "../utils/prisma.js";
import { downloadCompleteLearningUniverse, downloadCompleteCourse } from "../controllers/enhancedCourseDownloadController.js";
import { Writable } from "stream";

class NullWritable extends Writable {
  _write(chunk: any, encoding: string, callback: (error?: Error | null) => void) {
    callback();
  }
}

async function main() {
  const userId = "cmoi97hzt0000tlh83u1agzee";
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    console.error("User N S Komala not found in database.");
    return;
  }

  console.log(`Found user: ${user.firstName} ${user.lastName} (ID: ${user.id}, Role: ${user.role})`);

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
