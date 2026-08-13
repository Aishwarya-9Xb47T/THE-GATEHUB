import { getPlatformSettings } from "../services/platformSettingsService.js";

export type PasswordPolicy = {
  minLength: number;
  requireNumber: boolean;
  requireSpecial: boolean;
};

export async function getPasswordPolicy(): Promise<PasswordPolicy> {
  try {
    const s = await getPlatformSettings();
    return {
      minLength: Math.max(8, s.passwordMinLength || 8),
      requireNumber: s.requirePasswordNumber !== false,
      requireSpecial: s.requirePasswordSpecial !== false,
    };
  } catch {
    return { minLength: 8, requireNumber: true, requireSpecial: true };
  }
}

export function validatePassword(password: string, policy: PasswordPolicy): string | null {
  if (!password || !password.trim()) return "Password is required";
  if (password.length < policy.minLength) {
    return `Password must be at least ${policy.minLength} characters`;
  }
  if (password.length > 128) return "Password must not exceed 128 characters";
  // Reject whitespace-only and common empties already handled
  if (/\s{2,}/.test(password) && password.trim().length < policy.minLength) {
    return "Password is too weak";
  }
  const lower = password.toLowerCase();
  const blocked = ["password", "password123", "12345678", "qwerty123", "gatehub123"];
  if (blocked.includes(lower)) return "Choose a stronger password";
  if (policy.requireNumber && !/\d/.test(password)) {
    return "Password must include at least one number";
  }
  if (policy.requireSpecial && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    return "Password must include at least one special character";
  }
  return null;
}
