/**
 * Minimal release auth/authorization smoke — no demo content created.
 */
import "dotenv/config";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const BASE = process.env.API_BASE || "http://localhost:5000/api";

function mint(user: { id: string; email: string; role: string; tokenVersion?: number | null }) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
    },
    process.env.JWT_SECRET!,
    { expiresIn: "15m" }
  );
}

async function hit(path: string, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return res.status;
}

async function main() {
  const results: Record<string, unknown> = {};

  results.unauthAdmin = await hit("/admin/users?limit=1");
  results.unauthSettings = await hit("/admin/settings");

  // Temporary role fixtures for authorization only — deleted at end
  const stamp = Date.now();
  const hash = await bcrypt.hash("TempRelease!234", 10);
  const instructor = await prisma.user.create({
    data: {
      email: `release.instr.${stamp}@gatehub.test`,
      passwordHash: hash,
      firstName: "Release",
      lastName: "Instructor",
      role: "instructor",
      emailVerified: true,
    },
  });
  const student = await prisma.user.create({
    data: {
      email: `release.stu.${stamp}@gatehub.test`,
      passwordHash: hash,
      firstName: "Release",
      lastName: "Student",
      role: "student",
      emailVerified: true,
    },
  });
  const admin =
    (await prisma.user.findFirst({ where: { role: { in: ["admin", "super_admin"] } } })) ||
    (await prisma.user.create({
      data: {
        email: `release.admin.${stamp}@gatehub.test`,
        passwordHash: hash,
        firstName: "Release",
        lastName: "Admin",
        role: "admin",
        emailVerified: true,
      },
    }));

  const a = mint(admin);
  const i = mint(instructor);
  const s = mint(student);

  results.adminMe = await hit("/auth/me", a);
  results.instructorMe = await hit("/auth/me", i);
  results.studentMe = await hit("/auth/me", s);
  results.studentBlockedAdmin = await hit("/admin/users?limit=1", s);
  results.instructorBlockedAdmin = await hit("/admin/settings", i);
  results.adminAllowed = await hit("/admin/settings", a);

  // Cleanup ephemeral release fixtures
  await prisma.userSession.deleteMany({
    where: { userId: { in: [instructor.id, student.id] } },
  }).catch(() => {});
  await prisma.user.delete({ where: { id: instructor.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: student.id } }).catch(() => {});
  if (admin.email.includes("@gatehub.test")) {
    await prisma.user.delete({ where: { id: admin.id } }).catch(() => {});
  }

  const pass =
    results.unauthAdmin === 401 &&
    results.studentBlockedAdmin === 403 &&
    results.instructorBlockedAdmin === 403 &&
    results.adminMe === 200 &&
    results.studentMe === 200;

  console.log(JSON.stringify({ pass, results }, null, 2));
  if (!pass) process.exit(1);
}

main().finally(() => prisma.$disconnect());
