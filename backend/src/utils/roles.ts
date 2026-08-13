export type Role = "student" | "instructor" | "admin" | "super_admin";

export const ROLES = {
  STUDENT: "student" as const,
  INSTRUCTOR: "instructor" as const,
  ADMIN: "admin" as const,
  SUPER_ADMIN: "super_admin" as const,
};

export const PUBLIC_REGISTRATION_ROLES: Role[] = ["student", "instructor"];
export const ADMIN_ROLES: Role[] = ["admin", "super_admin"];

/** Roles allowed on the public registration form (never includes super_admin). */
export function getAllowedRegistrationRoles(): Role[] {
  const isDev = process.env.NODE_ENV !== "production";
  const allowAdmin = isDev || process.env.ALLOW_ADMIN_REGISTRATION === "true";
  if (allowAdmin) return ["student", "instructor", "admin"];
  return [...PUBLIC_REGISTRATION_ROLES];
}

export function isAdminRole(role?: string | null): boolean {
  return role === "admin" || role === "super_admin";
}

export function isSuperAdminRole(role?: string | null): boolean {
  return role === "super_admin";
}

export function canAccessAdminPanel(role?: string | null): boolean {
  return isAdminRole(role);
}

export function isValidRole(role: string): role is Role {
  return ["student", "instructor", "admin", "super_admin"].includes(role);
}

/** Normalize legacy or malformed role strings to canonical lowercase values. */
export function normalizeRole(role: string): Role | null {
  const lower = role.trim().toLowerCase();
  if (isValidRole(lower)) return lower;
  const aliases: Record<string, Role> = {
    superadmin: "super_admin",
    "super admin": "super_admin",
  };
  return aliases[lower] ?? null;
}

export function formatRoleLabel(role?: string | null): string {
  if (!role) return "Unknown";
  const labels: Record<Role, string> = {
    student: "Student",
    instructor: "Instructor",
    admin: "Admin",
    super_admin: "Super Admin",
  };
  if (isValidRole(role)) return labels[role];
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
