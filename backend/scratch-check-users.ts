import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Listing all users in database:");
  const allUsers = await prisma.user.findMany({
    select: { id: true, email: true, role: true, suspended: true, deletedAt: true }
  });
  allUsers.forEach(u => console.log(`- ${u.email} (${u.role}) - Suspended: ${u.suspended}, Deleted: ${u.deletedAt}`));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
