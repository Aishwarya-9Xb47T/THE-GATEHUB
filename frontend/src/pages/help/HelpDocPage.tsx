import { useParams, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { getDocBySlug } from "@/content/docs/docsManifest";
import { DocsReader } from "@/components/help/DocsReader";
import { DocsRightPanel } from "@/components/help/DocsRightPanel";
import { DocsBreadcrumbs } from "@/components/help/DocsBreadcrumbs";

export function HelpDocPage() {
  const { slug = "getting-started" } = useParams();
  const location = useLocation();
  const page = getDocBySlug(slug);

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    const t = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => clearTimeout(t);
  }, [location.hash, slug]);

  if (!page) return <Navigate to="/help/getting-started" replace />;

  const pdfSlug = ["student", "instructor", "admin"].includes(slug) ? slug : undefined;

  return (
    <div className="docs-page-layout">
      <div className="docs-page-layout__article">
        <DocsBreadcrumbs />
        <DocsReader page={page} />
      </div>
      <DocsRightPanel
        page={page}
        pdfSlug={pdfSlug}
        onDownloadPdf={pdfSlug ? () => window.open(`/api/docs/pdf/${pdfSlug}`, "_blank") : undefined}
      />
    </div>
  );
}
