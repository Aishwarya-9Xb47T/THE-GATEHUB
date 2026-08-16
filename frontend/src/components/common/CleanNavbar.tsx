import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CleanProfileAvatar } from "@/components/common/CleanProfileAvatar";
import { useUserStore } from "@/store/userStore";
import { LogOut } from "lucide-react";

interface CleanNavbarProps {
  showDashboardButton?: boolean;
}

export function CleanNavbar({ showDashboardButton = true }: CleanNavbarProps) {
  const navigate = useNavigate();
  const { user, logout } = useUserStore();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const handleDashboard = () => {
    if (user?.role === "instructor") {
      navigate("/instructor");
    } else if (user?.role === "student") {
      navigate("/student");
    } else if (user?.role === "admin") {
      navigate("/admin");
    }
  };

  return (
    <nav className="flex items-center justify-between w-full">
      {user && showDashboardButton && (
        <Button 
          variant="ghost" 
          onClick={handleDashboard}
          className="font-medium hover:bg-primary/10 hover:text-primary transition-all rounded-full px-5"
        >
          Dashboard
        </Button>
      )}
      
      {user ? (
        <div className="flex items-center gap-3">
          <CleanProfileAvatar user={user} size="sm" className="border border-primary/20 ring-1 ring-primary/10 shadow-sm" />
          <span className="text-sm font-medium text-text-secondary">
            {user?.firstName || "User"} {user?.lastName || ""}
          </span>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="hover:bg-destructive/10 hover:text-destructive transition-all rounded-full w-9 h-9 p-0">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/login")} className="hover:bg-primary/5 hover:text-primary transition-all rounded-full px-6 font-medium">
            Login
          </Button>
          <Button onClick={() => navigate("/register")} className="bg-primary text-primary-foreground hover:opacity-90 rounded-full px-6 shadow-md shadow-primary/20 transition-all active:scale-95">
            Sign up
          </Button>
        </div>
      )}
    </nav>
  );
}
