import { prisma } from "./src/utils/prisma.js";
import { ROLES } from "./src/utils/roles.js";

async function main() {
  const superAdmin = await prisma.user.findUnique({ where: { email: "superadmin@platform.local" } });
  if (!superAdmin) {
    console.log("❌ No super admin found!");
    return;
  }

  const universeId = "cmqnkt1fl000jwyp5mo4f1kdc";
  const universe = await prisma.learningUniverse.findUnique({ where: { id: universeId } });
  if (!universe) {
    console.log("❌ Learning Universe not found!");
    return;
  }

  const existingEnrollment = await prisma.learningUniverseEnrollment.findFirst({
    where: {
      learningUniverseId: universeId,
      userId: superAdmin.id
    }
  });

  if (existingEnrollment) {
    console.log("✅ Super admin is already enrolled in this learning universe!");
  } else {
    await prisma.learningUniverseEnrollment.create({
      data: {
        learningUniverseId: universeId,
        userId: superAdmin.id
      }
    });
    console.log("✅ Enrolled super admin in learning universe!");
  }
}

main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
});
