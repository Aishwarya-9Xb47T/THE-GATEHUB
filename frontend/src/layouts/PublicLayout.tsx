import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { Menu, X, LogOut, Youtube } from "lucide-react";
import { useUserStore } from "@/store/userStore";
import { useToastStore } from "@/store/toastStore";
import { Button } from "@/components/ui/button";
import { UnifiedAvatar } from "@/components/common/UnifiedAvatar";
import { GlobalFooter } from "@/components/common/GlobalFooter";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { BrandHomeButton } from "@/components/common/Logo";
import { cn } from "@/lib/utils";

export function PublicLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isLearnExperience = /\/learn(\/|$)/.test(location.pathname);
  const { user, logout } = useUserStore();
  const toast = useToastStore((s) => s.add);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCoursesActive, setIsCoursesActive] = useState(false);

  // Track when courses section is in view for active navigation highlighting
  useEffect(() => {
    const coursesSection = document.getElementById('courses');
    if (!coursesSection) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsCoursesActive(entry.isIntersecting);
        });
      },
      { threshold: 0.3 }
    );

    observer.observe(coursesSection);

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleLogout = async () => {
    try {
      // Use the userStore logout method which handles token clearing and user state
      logout();
      
      toast({ 
        title: "Logged out successfully", 
        variant: "success" 
      });
      
      // Navigate to home
      navigate("/");
    } catch (error: any) {
      console.error("Logout error:", error);
      toast({ 
        title: "Logout failed", 
        description: error.message || "An error occurred during logout", 
        variant: "destructive" 
      });
    }
  };

  return (
    <div className={cn("app-shell", isLearnExperience && "app-shell--immersive h-dvh min-h-0 overflow-hidden")}>
      {/* Top Navigation */}
      <header
        data-floating-obstacle="site-header"
        className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/75"
      >
        <div className="app-workspace app-workspace--bar app-workspace--lg">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-8">
              <BrandHomeButton />
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-6">
              <Button variant="ghost" onClick={() => navigate("/")} className="type-nav">
                Home
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => {
                  const coursesSection = document.getElementById('courses');
                  if (coursesSection) {
                    coursesSection.scrollIntoView({ behavior: 'smooth' });
                  }
                }} 
                className={cn("type-nav", isCoursesActive && "bg-accent text-accent-foreground")}
              >
                Courses
              </Button>
              <Button variant="ghost" onClick={() => navigate("/help")} className="type-nav">
                Help Center
              </Button>
              <a
                href="https://youtube.com/@thegatehub?si=cIZqgK-IOpejURNQ"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube"
                className="inline-flex items-center justify-center p-2 rounded-md hover:bg-muted transition-all duration-200 hover:scale-110 group"
                title="YouTube"
              >
                <Youtube className="h-5 w-5 text-foreground group-hover:text-red-600 transition-colors" />
              </a>
              {user ? (
                <div className="flex items-center gap-4">
                  <Button 
                    variant="ghost" 
                    onClick={() => navigate(user.role === "instructor" ? "/instructor" : "/student")}
                    className="type-nav"
                  >
                    Dashboard
                  </Button>
                  <div className="flex items-center gap-3">
                    <UnifiedAvatar 
                      user={user}
                      size="sm"
                      className="border border-border/50"
                    />
                    <span className="text-sm font-medium text-foreground">
                      {user?.firstName} {user?.lastName}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleLogout}>
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <Button variant="ghost" onClick={() => navigate("/login")}>
                    Login
                  </Button>
                  <Button onClick={() => navigate("/register")}>
                    Sign up
                  </Button>
                </div>
              )}
              <ThemeToggle />
            </nav>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="gap-2"
              >
                {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                {isMobileMenuOpen ? "Close" : "Menu"}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden border-t border-border/40 bg-background"
            >
              <div className="app-workspace w-full max-w-none px-4 py-4 space-y-4">
                <Button variant="ghost" onClick={() => { navigate("/"); setIsMobileMenuOpen(false); }} className="w-full justify-start">
                  Home
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={() => {
                    const coursesSection = document.getElementById('courses');
                    if (coursesSection) {
                      coursesSection.scrollIntoView({ behavior: 'smooth' });
                    }
                    setIsMobileMenuOpen(false);
                  }} 
                  className={cn("w-full justify-start", isCoursesActive && "bg-accent text-accent-foreground")}
                >
                  Courses
                </Button>
                <Button variant="ghost" onClick={() => { navigate("/help"); setIsMobileMenuOpen(false); }} className="w-full justify-start">
                  Help Center
                </Button>
                <a
                  href="https://youtube.com/@thegatehub?si=cIZqgK-IOpejURNQ"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="YouTube"
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-muted transition-all duration-200 group"
                >
                  <Youtube className="h-5 w-5 text-foreground group-hover:text-red-600 transition-colors" />
                  <span className="text-sm font-medium">YouTube</span>
                </a>
                <div className="flex items-center justify-between pb-4 border-b border-border/20">
                  {user ? (
                    <div className="flex items-center gap-3">
                      <UnifiedAvatar 
                        user={user}
                        size="md"
                        className="border border-border/50"
                      />
                      <div>
                        <p className="font-medium text-foreground">
                          {user?.firstName} {user?.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground capitalize">{user?.role}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Guest User
                    </div>
                  )}
                  <ThemeToggle />
                </div>
                {user ? (
                  <>
                    <Button 
                      variant="ghost" 
                      onClick={() => {
                        navigate(user.role === "instructor" ? "/instructor" : "/student");
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full justify-start"
                    >
                      Dashboard
                    </Button>
                    <Button 
                      variant="ghost" 
                      onClick={() => {
                        handleLogout();
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full justify-start"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Logout
                    </Button>
                  </>
                ) : (
                  <>
                    <Button 
                      variant="ghost" 
                      onClick={() => {
                        navigate("/login");
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full justify-start"
                    >
                      Login
                    </Button>
                    <Button 
                      onClick={() => {
                        navigate("/register");
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full"
                    >
                      Sign up
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Content */}
      <main
        className={
          isLearnExperience
            ? "flex-1 min-h-0 flex flex-col overflow-hidden w-full"
            : "flex-1 w-full min-w-0"
        }
      >
        <Outlet />
      </main>

      {/* Footer — hidden during immersive learn experience */}
      {!isLearnExperience && <GlobalFooter />}
    </div>
  );
}
