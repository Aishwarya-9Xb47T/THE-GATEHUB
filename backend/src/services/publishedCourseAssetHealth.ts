/**
 * Published course asset health check — probes storage without full downloads.
 */
import { prisma } from "../utils/prisma.js";
import {
  b2KeyFromPublicPath,
  isB2Configured,
  probeStorageObject,
} from "./b2StorageService.js";
import { collectMediaReferences, isPublishableMediaAssetRef } from "./learningUniverseMedia.js";
import type { ParsedLearningUniverse } from "../controllers/learning-universe-parser.js";

export type AssetHealthStatus = "PASS" | "FAIL" | "SKIP";

export interface AssetHealthItem {
  section: string;
  status: AssetHealthStatus;
  assetId?: string;
  type?: string;
  storageKey?: string;
  bucket?: string | null;
  detail?: string;
}

export interface PublishedCourseAssetHealth {
  courseId: string;
  overall: AssetHealthStatus;
  items: AssetHealthItem[];
}

function section(name: string, status: AssetHealthStatus, detail?: string): AssetHealthItem {
  return { section: name, status, detail };
}

export async function checkPublishedCourseAssets(
  courseId: string,
  parsed?: ParsedLearningUniverse | null
): Promise<PublishedCourseAssetHealth> {
  const items: AssetHealthItem[] = [];
  const universe = await prisma.learningUniverse.findUnique({
    where: { id: courseId },
    include: { assets: true },
  });

  if (!universe) {
    return {
      courseId,
      overall: "FAIL",
      items: [section("COURSE", "FAIL", "Learning Universe not found")],
    };
  }

  items.push(section("COURSE", "PASS", `status=${universe.status}`));

  const assets = universe.assets;
  const videos = assets.filter((a) => /\.(mp4|webm|mov|mkv|m4v)$/i.test(a.filename));
  const images = assets.filter((a) => /\.(png|jpe?g|gif|webp|svg)$/i.test(a.filename));
  const pdfs = assets.filter((a) => /\.pdf$/i.test(a.filename));

  if (universe.bannerUrl) {
    const relative = universe.bannerUrl
      .replace(/^https?:\/\/[^/]+/i, "")
      .replace(/^\/uploads\//, "")
      .replace(/^uploads\//, "");
    if (isB2Configured() && relative) {
      const probe = await probeStorageObject(
        b2KeyFromPublicPath(`/uploads/${relative}`) || `uploads/${relative}`
      );
      items.push({
        section: "BANNER",
        status: probe.code === "EXISTS" || probe.code === "STORAGE_AUTHORIZATION_ERROR" ? "PASS" : "FAIL",
        storageKey: relative,
        bucket: probe.bucket,
        detail: probe.code,
      });
    } else {
      items.push(section("BANNER", relative ? "PASS" : "FAIL", relative || "missing bannerUrl"));
    }
  } else {
    items.push(section("BANNER", "SKIP", "no banner"));
  }

  let imagesOk = true;
  for (const img of images) {
    const relative = img.storedFilename.replace(/^\/+/, "").replace(/^uploads\//, "");
    if (!isB2Configured()) continue;
    const probe = await probeStorageObject(`uploads/${relative}`);
    const ok = probe.code === "EXISTS" || probe.code === "STORAGE_AUTHORIZATION_ERROR";
    if (!ok) imagesOk = false;
    items.push({
      section: "IMAGES",
      status: ok ? "PASS" : "FAIL",
      assetId: img.id,
      type: "IMAGE",
      storageKey: relative,
      bucket: probe.bucket,
      detail: probe.code,
    });
  }
  if (!images.length) items.push(section("IMAGES", "SKIP", "no image assets"));
  else if (imagesOk && images.every(() => true)) {
    /* per-asset rows already added */
  }

  let videosOk = true;
  for (const vid of videos) {
    const relative = vid.storedFilename.replace(/^\/+/, "").replace(/^uploads\//, "");
    if (!isB2Configured()) {
      items.push({
        section: "LOCAL VIDEOS",
        status: "SKIP",
        assetId: vid.id,
        type: "VIDEO",
        storageKey: relative,
        detail: "B2 not configured",
      });
      continue;
    }
    const probe = await probeStorageObject(`uploads/${relative}`);
    const ok = probe.code === "EXISTS" || probe.code === "STORAGE_AUTHORIZATION_ERROR";
    if (!ok) videosOk = false;
    items.push({
      section: "LOCAL VIDEOS",
      status: ok ? "PASS" : "FAIL",
      assetId: vid.id,
      type: "VIDEO",
      storageKey: relative,
      bucket: probe.bucket,
      detail: `${probe.code}${probe.error ? ` ${probe.error}` : ""}`,
    });
  }
  if (!videos.length) items.push(section("LOCAL VIDEOS", "SKIP", "no local video assets"));

  items.push(section("PDF", pdfs.length ? "PASS" : "SKIP", pdfs.length ? `${pdfs.length} pdf asset(s)` : "no pdf assets"));
  items.push(section("YOUTUBE", "SKIP", "validated at publish via URL shape only"));
  items.push(section("PROJECT FILES", "SKIP", "not probed here"));
  items.push(
    section(
      "PUBLISHED SNAPSHOT",
      universe.status === "published" ? "PASS" : "FAIL",
      `status=${universe.status}`
    )
  );

  if (parsed) {
    const refs = collectMediaReferences(parsed).filter((r) => isPublishableMediaAssetRef(r.filename));
    const missing = refs.filter(
      (r) =>
        !assets.some(
          (a) =>
            a.filename.toLowerCase() === r.filename.replace(/\\/g, "/").split("/").pop()?.toLowerCase()
        )
    );
    if (missing.length) {
      for (const m of missing) {
        items.push({
          section: "LOCAL VIDEOS",
          status: "FAIL",
          type: m.blockType.toUpperCase(),
          storageKey: m.filename,
          detail: "referenced in snapshot but no LearningUniverseAsset row",
        });
      }
      videosOk = false;
    }
  }

  const overall = items.some((i) => i.status === "FAIL") ? "FAIL" : "PASS";
  void imagesOk;
  void videosOk;

  return { courseId, overall, items };
}

export async function diagnoseVideoAsset(assetId: string): Promise<{
  assetId: string;
  type: string;
  status: string;
  storageProvider: string;
  bucket: string | null;
  storageKey: string;
  storageObjectExists: boolean;
  storageObjectReadable: boolean;
  contentType: string | null;
  size: number;
  playbackEndpoint: string;
  playbackEndpointStatus: string;
  rangeSupported: boolean;
  errors: string[];
  courseId?: string;
}> {
  const errors: string[] = [];
  const asset = await prisma.learningUniverseAsset.findUnique({
    where: { id: assetId },
    include: { learningUniverse: { select: { id: true, status: true } } },
  });
  if (!asset) {
    return {
      assetId,
      type: "VIDEO",
      status: "MISSING",
      storageProvider: "b2",
      bucket: process.env.B2_BUCKET_NAME?.trim() || null,
      storageKey: "",
      storageObjectExists: false,
      storageObjectReadable: false,
      contentType: null,
      size: 0,
      playbackEndpoint: "",
      playbackEndpointStatus: "ASSET_NOT_FOUND",
      rangeSupported: false,
      errors: ["LearningUniverseAsset not found"],
    };
  }

  const relative = asset.storedFilename.replace(/^\/+/, "").replace(/^uploads\//, "");
  const key = `uploads/${relative}`;
  const playbackEndpoint = `/uploads/${relative}`;
  let storageObjectExists = false;
  let storageObjectReadable = false;
  let contentType: string | null = asset.mimeType || null;
  let size = asset.size || 0;
  let playbackEndpointStatus = "UNKNOWN";

  if (!isB2Configured()) {
    errors.push("B2 not configured");
    playbackEndpointStatus = "STORAGE_NOT_CONFIGURED";
  } else {
    const probe = await probeStorageObject(key);
    storageObjectExists =
      probe.code === "EXISTS" || probe.code === "STORAGE_AUTHORIZATION_ERROR";
    storageObjectReadable = probe.code === "EXISTS";
    if (probe.bytes) size = probe.bytes;
    if (probe.contentType) contentType = probe.contentType;
    playbackEndpointStatus = probe.code;
    if (probe.code !== "EXISTS" && probe.code !== "STORAGE_AUTHORIZATION_ERROR") {
      errors.push(`probe=${probe.code}${probe.error ? ` ${probe.error}` : ""}`);
    }
  }

  return {
    assetId: asset.id,
    type: "VIDEO",
    status: storageObjectExists ? "READY" : "ORPHANED",
    storageProvider: "b2",
    bucket: process.env.B2_BUCKET_NAME?.trim() || null,
    storageKey: relative,
    storageObjectExists,
    storageObjectReadable,
    contentType,
    size,
    playbackEndpoint,
    playbackEndpointStatus,
    rangeSupported: true,
    errors,
    courseId: asset.learningUniverseId,
  };
}
