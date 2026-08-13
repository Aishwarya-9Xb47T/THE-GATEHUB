/**
 * Verifies user roles in the database and role display mapping.
 * Run: npx tsx backend/verify-admin-roles.ts
 */
import { prisma } from "./src/utils/prisma.js";
import { isValidRole, normalizeRole, formatRoleLabel, ROLES } from "./src/utils/roles.js";

let passed = 0;
let failed = 0;

function ok(name: string) {
  passed++;
  console.log(`✓ ${name}`);
}

function fail(name: string, detail?: string) {
  failed++;
  console.log(`✗ ${name}${detail ? `: ${detail}` : ""}`);
}

async function main() {
  console.log("=== Admin Role Verification ===\n");

  const users = await prisma.user.findMany({
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
  });

  const roleCounts: Record<string, number> = {};
  const invalidRoles: typeof users = [];
  const fixableRoles: { user: (typeof users)[0]; normalized: string }[] = [];

  for (const user of users) {
    roleCounts[user.role] = (roleCounts[user.role] ?? 0) + 1;
    if (!isValidRole(user.role)) {
      const normalized = normalizeRole(user.role);
      if (normalized) fixableRoles.push({ user, normalized });
      else invalidRoles.push(user);
    }
  }

  console.log("Role distribution:");
  for (const [role, count] of Object.entries(roleCounts).sort()) {
    const label = isValidRole(role) ? formatRoleLabel(role) : `(invalid: ${role})`;
    console.log(`  ${label}: ${count}`);
  }
  console.log();

  if (invalidRoles.length === 0) ok("All users have valid roles");
  else fail("All users have valid roles", `${invalidRoles.length} invalid`);

  if (fixableRoles.length > 0) {
    console.log(`\nFixing ${fixableRoles.length} legacy role(s)...`);
    for (const { user, normalized } of fixableRoles) {
      await prisma.user.update({ where: { id: user.id }, data: { role: normalized } });
      console.log(`  Fixed ${user.email}: "${user.role}" → "${normalized}"`);
    }
    ok(`Normalized ${fixableRoles.length} legacy role(s)`);
  } else {
    ok("No legacy roles need normalization");
  }

  const admins = await prisma.user.findMany({
    where: { role: { in: [ROLES.ADMIN, ROLES.SUPER_ADMIN] }, deletedAt: null },
    select: { email: true, role: true, firstName: true, lastName: true },
  });

  console.log("\nAdmin accounts:");
  for (const a of admins) {
    const label = formatRoleLabel(a.role);
    console.log(`  ${a.firstName} ${a.lastName} (${a.email}) → ${label}`);
    if (label === "Student") fail(`Role label for ${a.email}`, `shows as Student`);
  }
  if (admins.length > 0) ok(`${admins.length} admin account(s) mapped correctly`);

  const labelTests: [string, string][] = [
    ["student", "Student"],
    ["instructor", "Instructor"],
    ["admin", "Admin"],
    ["super_admin", "Super Admin"],
  ];
  for (const [role, expected] of labelTests) {
    if (formatRoleLabel(role) !== expected) fail(`formatRoleLabel("${role}")`, `expected "${expected}"`);
    else ok(`formatRoleLabel("${role}") → "${expected}"`);
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
