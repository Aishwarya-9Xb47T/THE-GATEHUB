import { useEffect } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { CourseBrandingSetupPage } from "@/pages/instructor/CourseBrandingSetupPage";
import { PRODUCT_TYPES } from "@/lib/productTypes";

/** Free learning entry — same wizard & Academic Authoring Studio as Learning Universe */
export function FreeLearningBrandingPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("productType")) return;
    const isResource = searchParams.get("type") === "resource";
    const next = new URLSearchParams(searchParams);
    next.set(
      "productType",
      isResource ? PRODUCT_TYPES.FREE_RESOURCE : PRODUCT_TYPES.FREE_COURSE
    );
    if (!next.get("studio")) next.set("studio", "academic");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  if (!searchParams.get("productType")) {
    return null;
  }

  if (location.pathname === "/manage-courses/branding") {
    const next = new URLSearchParams(searchParams);
    return <Navigate to={`/manage-courses/new/branding?${next.toString()}`} replace />;
  }

  return <CourseBrandingSetupPage />;
}
