import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
    },
  });

  console.log("=== USERS IN DATABASE ===");
  users.forEach((user) => {
    console.log(
      `ID: ${user.id} | Name: ${user.firstName} ${user.lastName} | Email: ${user.email} | Role: ${user.role}`
    );
  });

  const universes = await prisma.learningUniverse.findMany({
    select: {
      id: true,
      title: true,
    },
  });

  console.log("\n=== LEARNING UNIVERSES IN DATABASE ===");
  universes.forEach((u) => {
    console.log(`ID: ${u.id} | Title: ${u.title}`);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });