import bcrypt from "bcryptjs";
import { prisma } from "../utils/prisma.js";
import { ROLES } from "../utils/roles.js";

export async function ensureSuperAdminExists() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn("[BOOTSTRAP] SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD not set — skipping super admin creation");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.role !== ROLES.SUPER_ADMIN) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: ROLES.SUPER_ADMIN },
      });
      console.log(`[BOOTSTRAP] Promoted existing user ${email} to super_admin`);
    } else {
      console.log(`[BOOTSTRAP] Super admin already exists: ${email}`);
    }
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: "Super",
      lastName: "Admin",
      role: ROLES.SUPER_ADMIN,
    },
  });
  console.log(`[BOOTSTRAP] Created super admin: ${email}`);
}
