import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseBrandingWizard } from "@/components/course-branding/CourseBrandingWizard";
import { api } from "@/lib/api";
import { saveBrandingSession, type CourseBrandingData } from "@/lib/courseBranding/types";
import {
  getAcademicStudioPath,
  getVisualStudioPath,
  parseProductType,
  productTypeLabel,
  PRODUCT_TYPES,
  type ProductType,
} from "@/lib/productTypes";

type StudioType = "academic" | "visual";

interface UniverseBranding {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  categoryId?: string;
  difficulty?: string;
  price?: number;
  bannerUrl?: string;
  thumbnail?: string;
  bannerType?: string;
  structuredData?: { productType?: string };
  categoryRel?: { name: string };
}

function brandingBackPath(productType: ProductType): string {
  switch (productType) {
    case PRODUCT_TYPES.PREMIUM_COURSE:
      return "/instructor/courses/new";
    case PRODUCT_TYPES.FREE_COURSE:
    case PRODUCT_TYPES.FREE_RESOURCE:
      return "/manage-courses/new";
    default:
      return "/instructor/learning-universe/new";
  }
}

function brandingPageTitle(productType: ProductType, editing: boolean): string {
  if (editing) return "Update Branding";
  switch (productType) {
    case PRODUCT_TYPES.PREMIUM_COURSE:
      return "Create Premium Course";
    case PRODUCT_TYPES.FREE_COURSE:
      return "Create Free Learning Course";
    case PRODUCT_TYPES.FREE_RESOURCE:
      return "Create Free Learning Resource";
    default:
      return "Create Learning Universe";
  }
}

export function CourseBrandingSetupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const studio = (searchParams.get("studio") || "academic") as StudioType;
  const method = searchParams.get("method");
  const productType = parseProductType(searchParams.get("productType"));
  const isManualCourse =
    method === "manual" && productType === PRODUCT_TYPES.PREMIUM_COURSE;
  const editId = searchParams.get("edit");
  const [initial, setInitial] = useState<Partial<CourseBrandingData>>();
  const [loadingEdit, setLoadingEdit] = useState(!!editId);

  useEffect(() => {
    if (!editId) {
      setLoadingEdit(false);
      return;
    }

    const loadFromUniverse = api<{ success: boolean; data: UniverseBranding }>(
      `/learning-universes/${editId}`
    ).then((res) => res.data?.data);

    const loadFromResource =
      productType === PRODUCT_TYPES.FREE_COURSE || productType === PRODUCT_TYPES.FREE_RESOURCE
        ? api<{ title: string; description?: string; thumbnail?: string }>(
            `/resources/courses/${editId}`
          ).then((res) => res.data)
        : Promise.resolve(null);

    Promise.all([loadFromUniverse, loadFromResource])
      .then(([lu, resource]) => {
        if (lu) {
          setInitial({
            title: lu.title || "",
            subtitle: lu.subtitle || "",
            description: lu.description || lu.subtitle || "",
            categoryId: lu.categoryId || "",
            categoryName: lu.categoryRel?.name,
            difficulty: lu.difficulty || "Beginner",
            price: typeof lu.price === "number" ? lu.price : undefined,
            bannerUrl: lu.bannerUrl || "",
            thumbnailUrl: lu.thumbnail || lu.bannerUrl || "",
            bannerType: (lu.bannerType as CourseBrandingData["bannerType"]) || "template",
          });
          return;
        }
        if (resource) {
          setInitial({
            title: resource.title || "",
            subtitle: "",
            description: resource.description || "",
            categoryId: "",
            difficulty: "Beginner",
            bannerUrl: resource.thumbnail || "",
            thumbnailUrl: resource.thumbnail || "",
            bannerType: resource.thumbnail ? "upload" : "template",
          });
        }
      })
      .finally(() => setLoadingEdit(false));
  }, [editId, productType]);

  const handleSubmit = async (data: CourseBrandingData) => {
    if (isManualCourse) {
      navigate("/instructor/courses/new/manual", {
        state: { branding: data, thumbnailUrl: data.thumbnailUrl },
      });
      return;
    }

    let universeId = editId || undefined;

    const body = {
      title: data.title,
      subtitle: data.subtitle,
      description: data.description,
      categoryId: data.categoryId,
      difficulty: data.difficulty,
      bannerUrl: data.bannerUrl,
      thumbnailUrl: data.thumbnailUrl,
      bannerType: data.bannerType,
      productType,
      ...(productType === PRODUCT_TYPES.PREMIUM_COURSE && typeof data.price === "number"
        ? { price: data.price }
        : {}),
    };

    if (editId) {
      const res = await api<{ success: boolean; data: { id: string } }>(
        `/learning-universes/${editId}/branding`,
        { method: "PATCH", body }
      );
      if (res.error) {
        const isFreeProduct =
          productType === PRODUCT_TYPES.FREE_COURSE || productType === PRODUCT_TYPES.FREE_RESOURCE;
        if (isFreeProduct) {
          const thumbnail = data.thumbnailUrl || data.bannerUrl;
          const resourceRes = await api(`/resources/courses/${editId}`, {
            method: "PATCH",
            body: {
              title: data.title,
              description: data.description || undefined,
              thumbnail,
            },
          });
          if (resourceRes.error) throw new Error(resourceRes.error);
          saveBrandingSession({ ...data, universeId: editId, productType });
          navigate("/manage-courses");
          return;
        }
        throw new Error(res.error);
      }
    } else {
      const res = await api<{ success: boolean; data: { id: string } }>("/learning-universes/draft", {
        method: "POST",
        body,
      });
      if (res.error) throw new Error(res.error);
      universeId = res.data?.data?.id;
      if (!universeId) throw new Error("Failed to create draft");
    }

    saveBrandingSession({ ...data, universeId, productType });

    const studioId = editId || universeId;
    if (!studioId) throw new Error("Failed to resolve course draft");

    if (studio === "visual") {
      navigate(getVisualStudioPath(studioId, productType));
      return;
    }

    navigate(getAcademicStudioPath(studioId, productType));
  };

  const backPath = brandingBackPath(productType);
  const pageTitle = isManualCourse ? "Create New Course" : brandingPageTitle(productType, !!editId);
  const studioLabel = studio === "visual" ? "Visual" : "LaTeX";
  const submitLabel = isManualCourse
    ? "Continue to Course Builder"
    : `Open ${studioLabel} Studio`;
  const showPrice = productType === PRODUCT_TYPES.PREMIUM_COURSE && !isManualCourse;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="flex items-center gap-4 p-6 border-b border-border">
        <Button variant="ghost" size="sm" onClick={() => navigate(backPath)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{pageTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {isManualCourse
              ? "Set your course identity before building content with the curriculum builder"
              : `Set title, category, price, and banner before opening ${studioLabel} Studio`}
            {!isManualCourse && productType !== PRODUCT_TYPES.LEARNING_UNIVERSE && (
              <span className="ml-1">· {productTypeLabel(productType)}</span>
            )}
          </p>
        </div>
      </div>

      <div className="w-full min-w-0 p-6 md:p-8">
        {loadingEdit ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Loading course branding…
          </div>
        ) : (
          <CourseBrandingWizard
            initial={initial}
            submitLabel={submitLabel}
            showPrice={showPrice}
            onSubmit={handleSubmit}
            onCancel={() => navigate(backPath)}
          />
        )}
      </div>
    </div>
  );
}
