import { PrismaClient } from "../../prisma-client/index.js";
const prisma = new PrismaClient();

async function check() {
  try {
    const users = await prisma.user.findMany();
    console.log("Total users:", users.length);
    if (users.length > 0) {
      console.log("Users in DB:", users.map(u => ({ email: u.email, hasHash: !!u.passwordHash, hashLength: u.passwordHash?.length })));
    } else {
      console.log("No users in database.");
    }
  } catch (err) {
    console.error("Failed to fetch users:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
