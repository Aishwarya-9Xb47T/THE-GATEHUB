import { useState } from "react";
import { cn } from "@/lib/utils";

interface GoogleAuthButtonProps {
  className?: string;
  label?: string;
  returnTo?: string;
}

// Backend URL — must be DIRECT (not through Vite proxy) for OAuth redirect chain to work
function getBackendBase(): string {
  if (import.meta.env.DEV) {
    return "http://localhost:5000";
  }
  return window.location.origin;
}

/**
 * "Continue with Google" button.
 * Redirects DIRECTLY to the backend Google OAuth route (bypassing Vite proxy).
 * OAuth involves server-side 302 redirects that Vite proxy cannot relay correctly.
 * returnTo is stored in sessionStorage and picked up by GoogleCallbackPage.
 */
export function GoogleAuthButton({ className, label = "Continue with Google", returnTo }: GoogleAuthButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = () => {
    setIsLoading(true);
    // Persist the return destination across the OAuth redirect round-trip
    if (returnTo) {
      sessionStorage.setItem("oauth_return_to", returnTo);
    } else {
      sessionStorage.removeItem("oauth_return_to");
    }
    // Must go directly to backend, not through localhost:5173/api/... Vite proxy
    const url = `${getBackendBase()}/api/auth/google`;
    window.location.href = url;
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      className={cn(
        "relative flex w-full items-center justify-center gap-3",
        "h-12 px-4 rounded-xl",
        "border border-border bg-background",
        "text-sm font-semibold text-foreground",
        "shadow-sm hover:shadow-md",
        "transition-all duration-200",
        "hover:bg-muted/50 hover:border-border/80",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        "active:scale-[0.98]",
        className
      )}
    >
      {isLoading ? (
        <svg className="h-5 w-5 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        /* Official Google G logo SVG */
        <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
      )}
      <span>{isLoading ? "Redirecting to Google..." : label}</span>
    </button>
  );
}
