import { Response } from "express";
import { z } from "zod";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import fs from "fs";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import {
  searchBannerImages,
  generateBannersWithFallback,
  importBannerFromUrl,
  getCategoryFallbackBanner,
  storeBannerBuffer,
  suggestBannerKeywords,
  getBannerProviderStatus,
  testBannerProviderHealth,
} from "../services/bannerService.js";

const UPLOAD_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR || "uploads");
const BANNERS_DIR = path.join(UPLOAD_DIR, "banners");
const THUMBS_DIR = path.join(BANNERS_DIR, "thumbs");
[BANNERS_DIR, THUMBS_DIR].forEach((d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    cb(ok ? null : new Error("Only JPG, PNG, WEBP allowed") as any, ok);
  },
});

export const bannerUpload = upload.fields([
  { name: "banner", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
]);

const searchSchema = z.object({
  query: z.string().min(1).max(200),
  page: z.number().int().min(1).optional(),
  perPage: z.number().int().min(1).max(20).optional(),
});

const generateSchema = z
  .object({
    prompt: z.string().min(1).max(300).optional(),
    topic: z.string().min(1).max(300).optional(),
    style: z.enum(["professional", "technology", "academic", "modern", "corporate"]).optional(),
    category: z.string().max(120).optional(),
    count: z.number().int().min(1).max(4).optional(),
  })
  .refine((data) => !!(data.prompt?.trim() || data.topic?.trim()), {
    message: "prompt or topic is required",
  });

const importSchema = z.object({
  url: z.string().url(),
  source: z.string().max(50).optional(),
  category: z.string().max(120).optional(),
});

const fallbackSchema = z.object({
  categoryName: z.string().min(1).max(120),
});

const suggestSchema = z.object({
  title: z.string().min(1).max(300),
  categoryName: z.string().max(120).optional(),
});

function formatBannerResponse(stored: Awaited<ReturnType<typeof storeBannerBuffer>>) {
  return {
    bannerId: stored.bannerId,
    bannerUrl: stored.bannerUrl,
    thumbnailUrl: stored.thumbnailUrl,
    source: stored.source,
    category: stored.category,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  };
}

export async function searchImages(req: AuthRequest, res: Response) {
  const { query, page, perPage } = searchSchema.parse(req.body);
  try {
    const data = await searchBannerImages(query, page ?? 1, perPage ?? 12);
    res.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image search failed";
    throw new AppError(503, message);
  }
}

export async function generateBanner(req: AuthRequest, res: Response) {
  const parsed = generateSchema.parse(req.body);
  const prompt = (parsed.prompt || parsed.topic || "").trim();
  const { style, category, count } = parsed;

  try {
    const result = await generateBannersWithFallback(
      prompt,
      style ?? "professional",
      category,
      count ?? 4
    );

    const images = result.banners.map((b) => ({
      ...formatBannerResponse(b),
      bannerType: result.usedFallback && b.source !== "ai" ? b.source : "ai",
      source: b.source,
    }));

    const limited = images.slice(0, count ?? 4);
    res.json({
      success: true,
      images: limited,
      provider: result.provider,
      warnings: result.warnings,
      data: {
        banners: limited,
        bannerUrl: limited[0]?.bannerUrl,
        thumbnailUrl: limited[0]?.thumbnailUrl,
        bannerId: limited[0]?.bannerId,
        provider: result.provider,
        warnings: result.warnings,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Banner generation failed";
    throw new AppError(503, message);
  }
}

export async function bannerHealth(_req: AuthRequest, res: Response) {
  const health = await testBannerProviderHealth();
  res.json({ success: true, data: health });
}

export async function importBanner(req: AuthRequest, res: Response) {
  const { url, source, category } = importSchema.parse(req.body);
  try {
    const stored = await importBannerFromUrl(url, { source: source || "import", category });
    res.json({ success: true, data: { ...formatBannerResponse(stored), bannerType: source || "search" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to import image";
    throw new AppError(400, message);
  }
}

export async function categoryFallback(req: AuthRequest, res: Response) {
  const { categoryName } = fallbackSchema.parse(req.body);
  try {
    const stored = await getCategoryFallbackBanner(categoryName);
    res.json({
      success: true,
      data: { ...formatBannerResponse(stored), bannerType: "template" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate category banner";
    throw new AppError(400, message);
  }
}

export async function suggestKeywords(req: AuthRequest, res: Response) {
  const { title, categoryName } = suggestSchema.parse(req.body);
  const keywords = suggestBannerKeywords(title, categoryName);
  res.json({ success: true, data: { keywords } });
}

export async function providerStatus(_req: AuthRequest, res: Response) {
  res.json({ success: true, data: getBannerProviderStatus() });
}

export async function uploadBanner(req: AuthRequest, res: Response) {
  const files = req.files as { banner?: Express.Multer.File[]; thumbnail?: Express.Multer.File[] };
  const bannerFile = files?.banner?.[0];
  if (!bannerFile) throw new AppError(400, "Banner file is required");

  const ext = path.extname(bannerFile.originalname) || ".jpg";
  const stored = await storeBannerBuffer(bannerFile.buffer, ext, "upload");

    const thumbFile = files?.thumbnail?.[0];
  if (thumbFile) {
    const thumbFilename = `thumb-${stored.bannerId}${path.extname(thumbFile.originalname) || ".jpg"}`;
    const thumbTmp = path.join(THUMBS_DIR, thumbFilename);
    fs.writeFileSync(thumbTmp, thumbFile.buffer);
    const { persistGeneratedFile } = await import("../middlewares/persistUpload.js");
    await persistGeneratedFile({
      localPath: thumbTmp,
      prefix: "banners",
      extraPath: "thumbs",
      fileName: thumbFilename,
      contentType: thumbFile.mimetype || "image/jpeg",
    });
    // Use root-relative path — frontend resolves it against the correct backend origin at runtime.
    stored.thumbnailUrl = `/uploads/banners/thumbs/${thumbFilename}`;
  }

  res.json({ success: true, data: { ...formatBannerResponse(stored), bannerType: "upload" } });
}

export { bannerUpload as bannerUploadMiddleware };
