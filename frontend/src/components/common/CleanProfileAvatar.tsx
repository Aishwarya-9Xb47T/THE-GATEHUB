import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { User } from "@/store/userStore";

interface CleanProfileAvatarProps {
  user: User | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export function CleanProfileAvatar({ 
  user, 
  size = "md",
  className 
}: CleanProfileAvatarProps) {
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
    xl: "h-16 w-16 text-lg"
  };

  // Get initials from user name - improved logic
  const getInitials = (firstName?: string, lastName?: string) => {
    // Handle empty or undefined names
    if (!firstName && !lastName) return "U";
    
    const first = firstName?.trim()?.[0] || "";
    const last = lastName?.trim()?.[0] || "";
    
    // If we have both names, return both initials
    if (first && last) return (first + last).toUpperCase();
    
    // If we have only one name, return first two letters or single letter
    const fullName = (firstName || lastName || "").trim();
    if (fullName.length >= 2) return fullName.substring(0, 2).toUpperCase();
    if (fullName.length === 1) return fullName.toUpperCase();
    
    return "U";
  };

  const initials = getInitials(user?.firstName, user?.lastName);
  
  // Only show image if avatar exists and is valid
  const hasAvatar = user?.avatar && 
    user.avatar !== "null" && 
    user.avatar !== "undefined" && 
    user.avatar.trim() !== "";
  
  // Add cache-busting with timestamp for proper invalidation
  const avatarUrl = hasAvatar ? `${user.avatar}?t=${user.avatarTimestamp || Date.now()}` : undefined;

  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      {hasAvatar && avatarUrl && (
        <AvatarImage 
          src={avatarUrl} 
          alt={`${user?.firstName} ${user?.lastName}`}
          className="object-cover"
        />
      )}
      <AvatarFallback className="bg-primary/10 text-primary font-medium">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
