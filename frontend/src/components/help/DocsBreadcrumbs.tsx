import { Link, useLocation, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { getDocBySlug } from "@/content/docs/docsManifest";

export function DocsBreadcrumbs() {
  const { slug } = useParams();
  const location = useLocation();
  const page = slug ? getDocBySlug(slug) : undefined;
  const isSearch = location.pathname.includes("/help/search");
  const isFaq = location.pathname.includes("/help/faq");
  const isHome = location.pathname === "/help" || location.pathname === "/help/";

  return (
    <nav className="docs-breadcrumbs flex items-center gap-1 text-xs text-muted-foreground mb-6 flex-wrap" aria-label="Breadcrumb">
      <Link to="/help" className="hover:text-foreground transition-colors">Documentation</Link>
      {isHome && (
        <>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <span className="text-foreground font-medium">Home</span>
        </>
      )}
      {isSearch && (
        <>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <span className="text-foreground font-medium">Search</span>
        </>
      )}
      {isFaq && (
        <>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <span className="text-foreground font-medium">FAQ</span>
        </>
      )}
      {page && !isSearch && !isFaq && !isHome && (
        <>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <span className="text-foreground font-medium">{page.title}</span>
        </>
      )}
    </nav>
  );
}
