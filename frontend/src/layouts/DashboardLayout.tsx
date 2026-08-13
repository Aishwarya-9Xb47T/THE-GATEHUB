import { useLayoutEffect, useRef } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
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
  Home,
  Award,
  Heart,
  Receipt,
  ClipboardList,
  Hammer,
  Globe,
  FolderTree,
  HelpCircle,
  ShoppingCart,
  Radio,
  Gamepad2,
  Presentation,
} from "lucide-react";
import { useUserStore, isAdminRole, isSuperAdminRole } from "@/store/userStore";
import { formatRoleLabel } from "@/lib/roles";
import { EmailVerificationBanner } from "@/components/auth/EmailVerificationBanner";
import { useToastStore } from "@/store/toastStore";
import { Button } from "@/components/ui/button";
import { UnifiedAvatar } from "@/components/common/UnifiedAvatar";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { OnboardingTour } from "@/components/help/OnboardingTour";
import { ContextHelpBanner } from "@/components/help/ContextHelpBanner";
import { BrandHomeButton } from "@/components/common/Logo";
import { useDashboardSidebar } from "@/hooks/useDashboardSidebar";
import { SidebarToggleButton } from "@/components/layout/SidebarToggleButton";
import { DashboardSidebarProvider } from "@/contexts/DashboardSidebarContext";

interface DashboardLayoutProps {
  role: "instructor" | "student" | "admin";
}

export function DashboardLayout({ role: propRole }: DashboardLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useUserStore();
  const toast = useToastStore((s) => s.add);
  const {
    isDesktop,
    isSidebarOpen,
    toggleSidebar,
    closeSidebarOnNavigate,
    setIsSidebarOpen,
    closeSidebar,
  } = useDashboardSidebar();

  const role = user?.role || propRole;
  const layoutRole = isAdminRole(role) ? "admin" : role;

  const isLearnExperience = /\/learn(\/|$)/.test(location.pathname);
  const isImmersiveCoursePlayer = /\/course\/[^/]+\/learn/.test(location.pathname);
  const isQuizAuthoringStudio = /\/quiz-room\/quizzes\/[^/]+\/edit/.test(location.pathname);
  const isQuizRoomStudio = /\/quiz-room\/(create|templates)/.test(location.pathname);
  const isImmersiveWorkspace =
    isLearnExperience || isImmersiveCoursePlayer || isQuizAuthoringStudio || isQuizRoomStudio;
  const hideDashboardChrome = isImmersiveWorkspace;
  const sidebarBeforeImmersive = useRef<boolean | null>(null);

  useLayoutEffect(() => {
    if (hideDashboardChrome) {
      if (sidebarBeforeImmersive.current === null) {
        setIsSidebarOpen((open) => {
          sidebarBeforeImmersive.current = open;
          return false;
        });
      }
      return;
    }
    if (sidebarBeforeImmersive.current !== null) {
      const restore = sidebarBeforeImmersive.current;
      sidebarBeforeImmersive.current = null;
      setIsSidebarOpen(restore);
    }
  }, [hideDashboardChrome, setIsSidebarOpen]);

  const handleLogout = async () => {
    try {
      logout();
      toast({ 
        title: "Logged out successfully", 
        variant: "success" 
      });
      navigate("/");
    } catch (error: any) {
      toast({ 
        title: "Logout failed. Try again.", 
        variant: "destructive" 
      });
    }
  };

  // Navigation items based on role
  const getNavItems = () => {
    switch (layoutRole) {
      case "instructor":
        return [
          { to: "/instructor", end: true, label: "Dashboard", icon: LayoutDashboard },
          { to: "/instructor/courses", label: "My Courses", icon: BookOpen, tour: "my-courses" },
          { to: "/instructor/courses/new", label: "Create Course", icon: PlusCircle, tour: "create-course" },
          { to: "/instructor/students", label: "Students", icon: Users },
          { to: "/instructor/quiz-room", label: "Quiz Room", icon: Radio },
          { to: "/instructor/interactive-classroom", label: "Interactive Classroom", icon: Presentation },
          { to: "/instructor/wayground", label: "Wayground", icon: Gamepad2 },
          { to: "/instructor/project-reviews", label: "Project Reviews", icon: Hammer, tour: "project-reviews" },
          { to: "/instructor/certificates", label: "Certificates", icon: Award },
          { to: "/instructor/reviews", label: "Reviews", icon: Star },
          { to: "/instructor/reports", label: "Reports", icon: ClipboardList },
          { to: "/instructor/analytics", label: "Analytics", icon: BarChart3 },
          { to: "/instructor/earnings", label: "Earnings", icon: DollarSign },
          { to: "/instructor/profile", label: "Profile", icon: User },
          { to: "/instructor/settings", label: "Settings", icon: Settings },
          { to: "/help/instructor", label: "Help Center", icon: HelpCircle },
        ];
      case "student":
        return [
          { to: "/student", end: true, label: "Dashboard", icon: LayoutDashboard, tour: "dashboard" },
          { to: "/student/my-courses", label: "My Courses", icon: BookOpen, tour: "my-courses" },
          { to: "/student/browse", label: "Browse", icon: Home, tour: "browse" },
          { to: "/student/wishlist", label: "Wishlist", icon: Heart },
          { to: "/student/cart", label: "Cart", icon: ShoppingCart },
          { to: "/student/quiz-results", label: "Quiz Results", icon: ClipboardList },
          { to: "/student/classroom", label: "Interactive Classroom", icon: Presentation },
          { to: "/student/live/join", label: "Join Quiz Room", icon: Radio },
          { to: "/student/wayground", label: "Wayground", icon: Gamepad2 },
          { to: "/student/certificates", label: "Certificates", icon: Award, tour: "certificates" },
          { to: "/student/purchases", label: "Purchases", icon: Receipt },
          { to: "/student/profile", label: "Profile", icon: User },
          { to: "/student/settings", label: "Settings", icon: Settings },
          { to: "/help/student", label: "Help Center", icon: HelpCircle },
        ];
      case "admin":
        return [
          { to: "/admin", end: true, label: "Dashboard", icon: LayoutDashboard },
          { to: "/admin/users", label: "Users", icon: Users, tour: "users" },
          { to: "/admin/courses", label: "Courses", icon: BookOpen },
          { to: "/admin/learning-universes", label: "Learning Universes", icon: Globe },
          { to: "/admin/wayground", label: "Wayground", icon: Gamepad2 },
          { to: "/admin/categories", label: "Categories", icon: FolderTree },
          { to: "/admin/reports", label: "Reports", icon: ClipboardList },
          { to: "/admin/reviews", label: "Reviews", icon: Star },
          { to: "/admin/payments", label: "Payments", icon: Receipt, tour: "payments" },
          { to: "/admin/commerce", label: "Commerce", icon: DollarSign, tour: "commerce" },
          { to: "/admin/analytics", label: "Analytics", icon: BarChart3, tour: "analytics" },
          ...(isSuperAdminRole(role) ? [
            { to: "/admin/admins", label: "Admin Management", icon: Users },
            { to: "/admin/audit-logs", label: "Audit Logs", icon: ClipboardList },
          ] : []),
          { to: "/admin/settings", label: "Settings", icon: Settings, tour: "settings" },
          { to: "/help/admin", label: "Help Center", icon: HelpCircle },
        ];
      default:
        return [];
    }
  };

  const nav = getNavItems();

  return (
    <DashboardSidebarProvider
      closeSidebar={() => closeSidebar({ persist: false })}
      isSidebarOpen={isSidebarOpen}
    >
    <div className="app-shell flex min-h-dvh bg-background">
      {/* Sidebar — hidden during immersive learn / workspace / quiz studio */}
      <AnimatePresence>
        {isSidebarOpen && !hideDashboardChrome && (
          <>
            {!isDesktop && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="fixed inset-0 z-30 bg-black/50"
                onClick={closeSidebarOnNavigate}
              />
            )}

            <motion.aside
              data-floating-obstacle="sidebar"
              initial={{ x: -288 }}
              animate={{ x: 0 }}
              exit={{ x: -288 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="fixed left-0 top-0 z-40 h-screen w-72 border-r border-border bg-card shadow-sm ring-1 ring-border/40"
            >
              <div className="flex h-full flex-col p-4">
                <div className="mb-6 flex items-center justify-between gap-2">
                  <BrandHomeButton className="flex items-center justify-center" />
                  <SidebarToggleButton
                    isOpen={true}
                    onToggle={toggleSidebar}
                    size="icon"
                    showLabel={false}
                  />
                </div>

                <nav className="flex-1 space-y-1 overflow-y-auto">
                  {nav.map(({ to, end, label, icon: Icon, tour }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
                      data-tour={tour}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                          isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                        )
                      }
                      onClick={closeSidebarOnNavigate}
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
                      <p className="truncate text-sm font-medium text-foreground">
                        {user?.firstName} {user?.lastName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatRoleLabel(user?.role)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 mb-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="flex-1 justify-start gap-2 text-muted-foreground hover:text-foreground" 
                      onClick={handleLogout}
                    >
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
      <main className={cn(
        "flex flex-col flex-1 min-h-0 w-full transition-all duration-300",
        hideDashboardChrome
          ? "h-dvh pl-0"
          : isSidebarOpen && isDesktop
            ? "pl-72"
            : "pl-0"
      )}>
        {/* Top bar — hidden during immersive learn / workspace so it cannot cut into course outline */}
        {!hideDashboardChrome && (
        <div
          data-floating-obstacle="dashboard-topbar"
          className="sticky top-0 z-20 flex items-center justify-between h-14 sm:h-16 px-4 sm:px-6 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 ring-1 ring-border/40"
        >
          <SidebarToggleButton
            isOpen={isSidebarOpen}
            onToggle={toggleSidebar}
            showLabel={isDesktop}
          />

          <div className="flex items-center gap-3 sm:gap-4">
            <ThemeToggle />
            <div className="flex items-center gap-3">
              <UnifiedAvatar 
                user={user}
                size="sm"
                className="border border-border"
              />
              <span className="text-sm font-medium text-foreground hidden sm:inline">
                {user?.firstName} {user?.lastName}
              </span>
            </div>
          </div>
        </div>
        )}

        {/* Page content */}
        {!isImmersiveWorkspace && <EmailVerificationBanner />}
        {!isImmersiveWorkspace && <ContextHelpBanner pathname={location.pathname} />}
        <AnimatePresence mode="wait">
          <motion.div 
            key={location.pathname}
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className={cn(
              "flex-1 w-full min-w-0",
              isImmersiveWorkspace
                ? "min-h-0 p-0 overflow-hidden flex flex-col"
                : "app-workspace app-workspace--lg app-workspace--section"
            )}
            data-floating-workspace={isImmersiveWorkspace ? undefined : "dashboard-main"}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
        {layoutRole === "student" && !isImmersiveWorkspace && <OnboardingTour role="student" />}
        {layoutRole === "instructor" && !isImmersiveWorkspace && <OnboardingTour role="instructor" />}
        {layoutRole === "admin" && !isImmersiveWorkspace && <OnboardingTour role="admin" />}
      </main>
    </div>
    </DashboardSidebarProvider>
  );
}
