import { User } from "@/store/userStore";

/**
 * Production-level utility function to get user initials
 * Used consistently across all avatar components
 * Handles real user data properly (e.g., firstName: "N S", lastName: "Aishwarya")
 */
export function getInitials(user: User | null): string {
  if (!user) return "U";

  const first = user.firstName?.trim() || "";
  const last = user.lastName?.trim() || "";

  // Handle real user data like firstName: "N S", lastName: "Aishwarya"
  if (first && last) {
    // Take first character of first name and first character of last name
    // For "N S Aishwarya" → "NS"
    const firstInitial = first[0];
    const lastInitial = last[0];
    return (firstInitial + lastInitial).toUpperCase();
  }

  // Single name case
  if (first) return first[0].toUpperCase();
  if (last) return last[0].toUpperCase();

  return "U";
}
