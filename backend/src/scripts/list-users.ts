import { prisma } from "../utils/prisma.js";

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
    }
  });

  console.log("=== ALL USERS ===");
  for (const u of users) {
    console.log(`User: ${u.firstName} ${u.lastName} (ID: ${u.id}, Role: ${u.role})`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
