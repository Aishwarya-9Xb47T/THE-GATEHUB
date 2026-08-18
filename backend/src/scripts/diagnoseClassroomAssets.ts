/**
 * Trace Interactive Classroom asset resolution using the same helpers as production.
 * Usage: npx tsx src/scripts/diagnoseClassroomAssets.ts <presentationId>
 * Does not print B2 credentials or signed URLs.
 */
import { inspectPresentationVisuals } from "../services/classroomStudio/presentationVisualRepairService.js";
import {
  canonicalPublicPath,
  canonicalSlideSvgRelative,
  canonicalSourceRelative,
  parseClassroomAssetFilename,
} from "../services/classroomStudio/classroomAssetPath.js";
import { classroomAssetLookupRelatives } from "../services/classroomStudio/classroomAssetUrls.js";

const presentationId = process.argv[2] || "cmsytfa5v0005i9tsssuq2kb9";

function apiAsset(kind: "source" | "renders", filename: string) {
  return `/api/classroom-studio/presentations/${presentationId}/assets/${kind}/${filename}`;
}

async function main() {
  const sourceRelative = canonicalSourceRelative(presentationId);
  const slide2Relative = canonicalSlideSvgRelative(presentationId, 2);
  const parsedSvg = parseClassroomAssetFilename("renders", "slide-002.svg");
  const parsedPptx = parseClassroomAssetFilename("source", "original.pptx");

  console.info("[CLASSROOM_DIAG] resolution_contract", {
    presentationId,
    sourceRelative,
    sourcePublic: canonicalPublicPath(sourceRelative),
    sourceApi: apiAsset("source", "original.pptx"),
    sourceLookup: classroomAssetLookupRelatives(sourceRelative),
    slide2Relative,
    slide2Public: canonicalPublicPath(slide2Relative),
    slide2Api: apiAsset("renders", "slide-002.svg"),
    parsedSvg,
    parsedPptx,
  });

  try {
    const health = await inspectPresentationVisuals(presentationId);
    console.info("[CLASSROOM_DIAG] storage_health", {
      presentationId: health.presentationId,
      sourceFound: health.source.found,
      sourceBytes: health.source.found ? health.source.bytes : null,
      sourceKey: health.source.found ? health.source.key : null,
      sourceOrigin: health.source.found ? health.source.origin : null,
      keysChecked: health.source.found ? undefined : health.source.keysChecked,
      slideCount: health.slides.length,
      missingSvg: health.slides.filter((slide) => !slide.svgFound).map((slide) => slide.order),
      presentSvg: health.slides.filter((slide) => slide.svgFound).map((slide) => slide.order),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "inspect_failed";
    console.warn("[CLASSROOM_DIAG] database_or_storage_unavailable", {
      presentationId,
      stage: "inspect",
      error: message.slice(0, 180),
    });
  }
}

void main();
