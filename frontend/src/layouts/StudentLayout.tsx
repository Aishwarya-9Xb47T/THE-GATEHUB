import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  BookOpen,
  GraduationCap,
  Heart,
  Award,
  ClipboardList,
  User,
  Settings,
  LogOut,
} from "lucide-react";
import { useUserStore } from "@/store/userStore";
import { Button } from "@/components/ui/button";
import { UnifiedAvatar } from "@/components/common/UnifiedAvatar";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { BrandHomeButton } from "@/components/common/Logo";

const nav = [
  { to: "/student", end: true, label: "Dashboard", icon: LayoutDashboard },
  { to: "/student/classroom", end: true, label: "Classroom", icon: LayoutDashboard },
  { to: "/student/browse", label: "Browse Courses", icon: BookOpen },
  { to: "/student/my-courses", label: "My Courses", icon: GraduationCap },
  { to: "/student/wishlist", label: "Wishlist", icon: Heart },
  { to: "/student/certificates", label: "Certificates", icon: Award },
  { to: "/student/quiz-results", label: "Quiz Results", icon: ClipboardList },
  { to: "/student/profile", label: "Profile", icon: User },
  { to: "/student/settings", label: "Settings", icon: Settings },
];

export function StudentLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useUserStore();
  const isLearnPage = location.pathname.includes("/learn");

  return (
    <div className="flex min-h-screen bg-background">
      {!isLearnPage && (
        <aside data-floating-obstacle="sidebar" className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-card shadow-sm ring-1 ring-border/40">
        <div className="flex h-full flex-col p-4">
          <BrandHomeButton className="mb-6 flex items-center justify-center w-full" />
          <nav className="flex-1 space-y-1">
            {nav.map(({ to, end, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  )
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div data-floating-obstacle="sidebar-account" className="border-t border-border pt-4">
            <div className="mb-2 flex items-center gap-3 rounded-lg px-3 py-2">
              <UnifiedAvatar 
                user={user}
                size="md"
                className="border border-border"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{user?.firstName} {user?.lastName}</p>
                <p className="truncate text-xs text-muted-foreground">Student</p>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 mb-2">
              <Button variant="ghost" size="sm" className="flex-1 justify-start gap-2 text-muted-foreground hover:text-foreground" onClick={() => { logout(); navigate("/login"); }}>
                <LogOut className="h-4 w-4" /> Sign out
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </div>
        </aside>
      )}
      <main className={cn("flex flex-col flex-1 min-h-screen", !isLearnPage && "pl-64")}>
        <AnimatePresence mode="wait">
          <motion.div 
            key={location.pathname}
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className={cn("flex-1", !isLearnPage ? "app-workspace app-workspace--lg app-workspace--section" : "p-0")}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
