import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  FolderTree,
  Flag,
  Star,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  Globe,
} from "lucide-react";
import { useUserStore } from "@/store/userStore";
import { Button } from "@/components/ui/button";
import { UnifiedAvatar } from "@/components/common/UnifiedAvatar";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { BrandHomeButton } from "@/components/common/Logo";

const nav = [
  { to: "/admin", end: true, label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/courses", label: "Courses", icon: BookOpen },
  { to: "/admin/learning-universes", label: "Learning Universes", icon: Globe },
  { to: "/admin/categories", label: "Categories", icon: FolderTree },
  { to: "/admin/reports", label: "Reports", icon: Flag },
  { to: "/admin/reviews", label: "Reviews", icon: Star },
  { to: "/admin/payments", label: "Payments", icon: CreditCard },
  { to: "/admin/commerce", label: "Commerce", icon: BarChart3 },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useUserStore();

  return (
    <div className="flex min-h-screen bg-background">
      <aside data-floating-obstacle="sidebar" className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-card shadow-sm ring-1 ring-border/40">
        <div className="flex h-full flex-col p-4">
          <div className="mb-6 flex items-center gap-2 px-2">
            <BrandHomeButton />
            <span className="text-lg font-bold font-display text-text-primary">Admin</span>
          </div>
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
                <p className="truncate text-xs text-muted-foreground">Admin</p>
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
      <main className="flex flex-col flex-1 pl-64 min-h-screen">
        <div className="flex-1 p-6 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
