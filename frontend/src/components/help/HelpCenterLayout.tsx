import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Menu, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DocsSidebar } from "./DocsSidebar";
import { DocsCommandPalette } from "./DocsCommandPalette";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { Logo, BrandHomeButton } from "@/components/common/Logo";
import { Button } from "@/components/ui/button";
import { useUserStore } from "@/store/userStore";
import { AppAssistantFooter } from "@/assistant/AppAssistantFooter";
import { useDocsReadingProgress } from "./useDocsReadingProgress";

function resolveAudience(role?: string): "student" | "instructor" | "admin" | undefined {
  if (role === "instructor") return "instructor";
  if (role === "admin" || role === "super_admin") return "admin";
  if (role === "student") return "student";
  return undefined;
}

export function HelpCenterLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUserStore();

  const audience = resolveAudience(user?.role);
  const isArticle = /^\/help\/[^/]+$/.test(location.pathname) && !["/help/search", "/help/faq"].includes(location.pathname);
  const progress = useDocsReadingProgress(isArticle);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const scrollEl = document.querySelector<HTMLElement>(".help-center-scroll");
    scrollEl?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="help-center">
      <DocsCommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

      {isArticle && (
        <div className="help-center__progress" aria-hidden>
          <div className="help-center__progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      <header data-floating-obstacle="help-header" className="help-center__header">
        <div className="help-center__header-inner">
          <div className="help-center__header-start">
            <Button variant="ghost" size="icon" className="lg:hidden shrink-0 h-8 w-8" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </Button>
            <BrandHomeButton className="help-center__brand" hideText>
              <Logo size="md" />
            </BrandHomeButton>
          </div>
          <div className="help-center__header-end">
            <Button variant="outline" size="sm" className="help-center__search-btn hidden sm:flex" onClick={() => setPaletteOpen(true)}>
              <Search className="w-3.5 h-3.5" />
              <span className="text-muted-foreground hidden md:inline">Search</span>
              <kbd className="help-center__kbd">⌘K</kbd>
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:hidden" onClick={() => setPaletteOpen(true)} aria-label="Search docs">
              <Search className="w-4 h-4" />
            </Button>
            <ThemeToggle />
            {user ? (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate(user.role === "instructor" ? "/instructor" : user.role === "admin" || user.role === "super_admin" ? "/admin" : "/student")}>
                Dashboard
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate("/login")}>Log in</Button>
            )}
          </div>
        </div>
      </header>

      <div className="help-center__body">
        {mobileOpen && (
          <button
            type="button"
            className="fixed inset-0 top-14 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <div
          data-floating-obstacle="sidebar"
          className={`help-center__sidebar-wrap ${mobileOpen ? "help-center__sidebar-wrap--open" : ""}`}
        >
          <DocsSidebar
            audience={audience}
            onNavigate={() => setMobileOpen(false)}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          />
        </div>

        <main className="help-center__main" data-floating-workspace="help-main">
          <div className="help-center-scroll">
            <div className="help-center__content">
              <Outlet />
            </div>
            <AppAssistantFooter
              layout="corner"
              className="help-center__doc-footer mt-12"
              innerClassName="help-center__content"
            />
          </div>
        </main>
      </div>
    </div>
  );
}
