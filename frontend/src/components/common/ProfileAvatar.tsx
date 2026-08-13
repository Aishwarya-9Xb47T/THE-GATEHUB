import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface ProfileAvatarProps {
  src?: string | null;
  alt?: string;
  firstName?: string;
  lastName?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  avatarTimestamp?: number;
}

export function ProfileAvatar({ 
  src, 
  alt = "Profile", 
  firstName = "", 
  lastName = "", 
  size = "md",
  className,
  avatarTimestamp 
}: ProfileAvatarProps) {
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
    xl: "h-16 w-16 text-lg"
  };

  const initials = `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "U";
  
  // Only render image if src exists and is not null/undefined/empty
  const hasValidImage = src && src !== "null" && src !== "undefined" && src.trim() !== "";
  
  // Use cache-busting with timestamp for proper invalidation
  const imageSrc = hasValidImage ? `${src}${avatarTimestamp ? `?t=${avatarTimestamp}` : ''}` : undefined;

  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      {hasValidImage && (
        <AvatarImage 
          src={imageSrc} 
          alt={alt}
          className="object-cover"
          ref={(imgElement) => {
            if (imgElement && hasValidImage) {
              // Force cache invalidation by setting a unique cache-busting parameter
              const cacheBustUrl = `${imageSrc}?_t=${Date.now()}`;
              imgElement.src = cacheBustUrl;
            }
          }}
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
      <AvatarFallback className="bg-primary/10 text-primary font-medium">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
