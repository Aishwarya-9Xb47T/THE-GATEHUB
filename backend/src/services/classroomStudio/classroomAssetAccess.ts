import { isAdminRole, type Role } from "../../utils/roles.js";

export function classroomAssetAccessDecision(input: {
  userId: string;
  role?: Role | string;
  instructorId: string;
  isParticipant: boolean;
}): boolean {
  if (!input.userId) return false;
  if (isAdminRole(input.role) || input.instructorId === input.userId) return true;
  return input.isParticipant;
}
