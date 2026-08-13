export type Role = "student" | "instructor" | "admin" | "super_admin";

const ROLE_LABELS: Record<Role, string> = {
  student: "Student",
  instructor: "Instructor",
  admin: "Admin",
  super_admin: "Super Admin",
};

/** Display label for a backend role string. */
export function formatRoleLabel(role?: string | null): string {
  if (!role) return "Unknown";
  if (role in ROLE_LABELS) return ROLE_LABELS[role as Role];
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isAdminRole(role?: string | null): boolean {
  return role === "admin" || role === "super_admin";
}

export function isSuperAdminRole(role?: string | null): boolean {
  return role === "super_admin";
}

export function isEditableRole(role: string): boolean {
  return role === "student" || role === "instructor";
}
