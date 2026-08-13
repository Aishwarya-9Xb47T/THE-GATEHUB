import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { User } from "@/store/userStore";
import { getInitials } from "@/utils/avatarUtils";

interface UnifiedAvatarProps {
  user: User | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

/**
 * Production-level reusable Avatar component
 * Used consistently across Navbar, Sidebar, and Profile
 * Handles real user data properly with instant sync
 */
export function UnifiedAvatar({ 
  user, 
  size = "md",
  className 
}: UnifiedAvatarProps) {
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
    xl: "h-16 w-16 text-lg"
  };

  // Get initials using the global utility function
  // For user {firstName: "N S", lastName: "Aishwarya"} → "NS"
  const initials = getInitials(user);
  
  // Check if user has a valid avatar
  const hasAvatar = user?.avatar && 
    user.avatar !== "null" && 
    user.avatar !== "undefined" && 
    user.avatar.trim() !== "";

  // Add cache-busting to prevent stale images
  const avatarUrl = hasAvatar ? `${user.avatar}?t=${user.avatarTimestamp || Date.now()}` : undefined;

  return (
    <Avatar className={cn(
      sizeClasses[size], 
      "transition-all duration-300 hover:scale-105 hover:ring-2 hover:ring-blue-500/20", 
      className
    )}>
      {hasAvatar && avatarUrl && (
        <AvatarImage 
          src={avatarUrl} 
          alt={`${user?.firstName} ${user?.lastName}`}
          className="object-cover rounded-full transition-opacity duration-300"
          onError={(e) => {
            // Hide broken image and show fallback
            (e.target as HTMLImageElement).style.display = 'none';
          }}
          onLoad={(e) => {
            // Ensure image is visible on successful load
            (e.target as HTMLImageElement).style.display = 'block';
          }}
        />
      )}
      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-cyan-600 text-white font-medium rounded-full transition-all duration-300">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
