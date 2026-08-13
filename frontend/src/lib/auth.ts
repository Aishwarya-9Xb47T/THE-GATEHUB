/**
 * Authentication utilities
 */

export function getUserIdFromToken(): string | null {
  const token = getToken();
  if (!token) return null;
  
  try {
    // Simple JWT decode (in production, use proper JWT library)
    const payload = token.split('.')[1];
    if (!payload) return null;
    
    const decoded = JSON.parse(atob(payload));
    return decoded.userId || decoded.sub || null;
  } catch (error: any) {
    console.error('Failed to decode token:', error);
    return null;
  }
}

function getToken(): string | null {
  if (typeof window !== "undefined") {
    return sessionStorage.getItem("lms_token") || localStorage.getItem("lms_token");
  }
  return null;
}