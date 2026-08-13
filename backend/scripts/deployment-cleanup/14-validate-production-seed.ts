/**
 * Disposable validation of SEED_* create + idempotency + login roles.
 * Uses @gatehub.test emails only; deletes them at end.
 * Never prints passwords.
 */
import "dotenv/config";
import { spawnSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const BASE = process.env.API_BASE || "http://localhost:5000/api";
const stamp = Date.now();
const INSTR_EMAIL = `seed.instr.${stamp}@gatehub.test`;
const STU_EMAIL = `seed.stu.${stamp}@gatehub.test`;
const PASSWORD = `TempSeed!${stamp}A`;

async function hit(path: string, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return res.status;
}

async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  return { status: res.status, ok: res.ok, role: json?.user?.role, token: json?.token as string | undefined };
}

function runSeed(extraEnv: Record<string, string>) {
  const r = spawnSync("npx", ["tsx", "prisma/seed.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    shell: true,
  });
  return { code: r.status, out: r.stdout || "", err: r.stderr || "" };
}

async function main() {
  const env = {
    SEED_INSTRUCTOR_EMAIL: INSTR_EMAIL,
    SEED_INSTRUCTOR_PASSWORD: PASSWORD,
    SEED_INSTRUCTOR_NAME: "Seed Instructor",
    SEED_STUDENT_EMAIL: STU_EMAIL,
    SEED_STUDENT_PASSWORD: PASSWORD,
    SEED_STUDENT_NAME: "Seed Student",
  };

  const first = runSeed(env);
  const second = runSeed(env);

  const firstCreated =
    /Instructor:\s*\r?\nCREATED/.test(first.out) && /Student:\s*\r?\nCREATED/.test(first.out);
  const secondExists =
    /Instructor:\s*\r?\nALREADY EXISTS/.test(second.out) &&
    /Student:\s*\r?\nALREADY EXISTS/.test(second.out);

  const instrLogin = await login(INSTR_EMAIL, PASSWORD);
  const stuLogin = await login(STU_EMAIL, PASSWORD);

  let adminToken: string | undefined;
  if (process.env.SUPER_ADMIN_EMAIL && process.env.SUPER_ADMIN_PASSWORD) {
    const adminLogin = await login(process.env.SUPER_ADMIN_EMAIL, process.env.SUPER_ADMIN_PASSWORD);
    adminToken = adminLogin.token;
  } else {
    const admin = await prisma.user.findFirst({
      where: { role: { in: ["admin", "super_admin"] } },
    });
    if (admin) {
      adminToken = jwt.sign(
        {
          userId: admin.id,
          email: admin.email,
          role: admin.role,
          tokenVersion: admin.tokenVersion ?? 0,
        },
        process.env.JWT_SECRET!,
        { expiresIn: "10m" }
      );
    }
  }

  const authz = {
    studentBlockedAdmin: await hit("/admin/settings", stuLogin.token),
    instructorBlockedAdmin: await hit("/admin/settings", instrLogin.token),
    adminAllowed: adminToken ? await hit("/admin/settings", adminToken) : null,
    unauth: await hit("/admin/settings"),
  };

  // Registration still available (endpoint responds; no need to create permanent user)
  const regProbe = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const registrationEndpointAlive = [400, 422, 401, 403].includes(regProbe.status) || regProbe.status < 500;

  // Cleanup disposable users
  await prisma.user.deleteMany({
    where: { email: { in: [INSTR_EMAIL, STU_EMAIL] } },
  });

  const leftover = await prisma.user.count({
    where: { email: { endsWith: "@gatehub.test" } },
  });

  console.log(
    JSON.stringify(
      {
        seedFirstCreate: firstCreated,
        seedSecondIdempotent: secondExists,
        instructorLogin: instrLogin.ok && instrLogin.role === "instructor",
        studentLogin: stuLogin.ok && stuLogin.role === "student",
        authz,
        registrationEndpointAlive,
        leftoverGatehubTestUsers: leftover,
        passwordsDisplayed: false,
      },
      null,
      2
    )
  );

  const pass =
    firstCreated &&
    secondExists &&
    instrLogin.ok &&
    stuLogin.ok &&
    authz.studentBlockedAdmin === 403 &&
    authz.instructorBlockedAdmin === 403 &&
    authz.unauth === 401 &&
    leftover === 0;

  if (!pass) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
