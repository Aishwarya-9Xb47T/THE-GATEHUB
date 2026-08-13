import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  BookOpen,
  PlusCircle,
  Users,
  Star,
  BarChart3,
  DollarSign,
  User,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useUserStore } from "@/store/userStore";
import { Button } from "@/components/ui/button";
import { UnifiedAvatar } from "@/components/common/UnifiedAvatar";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { BrandHomeButton } from "@/components/common/Logo";

const nav = [
  { to: "/instructor", end: true, label: "Dashboard", icon: LayoutDashboard },
  { to: "/instructor/courses", label: "My Courses", icon: BookOpen },
  { to: "/instructor/courses/new", label: "Create Course", icon: PlusCircle },
  { to: "/instructor/students", label: "Students", icon: Users },
  { to: "/instructor/reviews", label: "Reviews", icon: Star },
  { to: "/instructor/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/instructor/earnings", label: "Earnings", icon: DollarSign },
  { to: "/instructor/profile", label: "Profile", icon: User },
  { to: "/instructor/settings", label: "Settings", icon: Settings },
];

export function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useUserStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 1024);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="sm"
        className="fixed top-4 left-4 z-50 lg:hidden"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Sidebar */}
      <AnimatePresence>
        {(isSidebarOpen || isDesktop) && (
          <>
            {/* Overlay for mobile */}
            {isSidebarOpen && !isDesktop && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="fixed inset-0 z-30 bg-black/50 lg:hidden"
                onClick={() => setIsSidebarOpen(false)}
              />
            )}
            
            <motion.aside
              data-floating-obstacle="sidebar"
              initial={{ x: -256 }}
              animate={{ x: 0 }}
              exit={{ x: -256 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-card shadow-sm lg:translate-x-0 ring-1 ring-border/40"
            >
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
                      onClick={() => setIsSidebarOpen(false)}
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
                      <p className="truncate text-xs text-muted-foreground">Instructor</p>
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
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className={`flex flex-col flex-1 min-h-screen transition-all duration-300 ${isDesktop ? 'pl-64' : 'pl-0'}`}>
        <AnimatePresence mode="wait">
          <motion.div 
            key={location.pathname}
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="flex-1 p-6 md:p-8"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
