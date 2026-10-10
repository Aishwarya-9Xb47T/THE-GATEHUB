import { Response } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";

import { appCache } from "../utils/cache.js";

const createSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  image: z.string().optional(),
});

const DEFAULT_PLATFORM_CATEGORIES = [
  "Cyber Security",
  "Computer Networking",
  "Deep Learning",
  "Artificial Intelligence & Machine Learning",
  "Cloud Computing & DevOps",
  "Data Science & Analytics",
  "Software Engineering",
  "Web Development",
  "Mobile App Development",
  "Blockchain & Web3",
  "Programming Fundamentals",
  "Full Stack Development",
  "Database & SQL",
  "UI/UX Design",
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function list(_req: AuthRequest, res: Response) {
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=900");
  const cacheKey = "categories:all";
  const cached = appCache.get<{ success: boolean; categories: any[] }>(cacheKey);
  if (cached && Array.isArray(cached.categories) && cached.categories.length > 0) {
    return res.json(cached);
  }

  let categories: any[] = [];
  try {
    categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { courses: true } } },
    });
  } catch (err) {
    console.warn("[CATEGORIES_LIST] DB query error:", err);
  }

  // Auto-seed database if empty
  if (!categories || categories.length === 0) {
    try {
      for (const name of DEFAULT_PLATFORM_CATEGORIES) {
        const slug = slugify(name);
        await prisma.category.upsert({
          where: { slug },
          create: { name, slug, description: name },
          update: {},
        });
      }
      categories = await prisma.category.findMany({
        orderBy: { name: "asc" },
        include: { _count: { select: { courses: true } } },
      });
    } catch (seedErr) {
      console.warn("[CATEGORIES_SEED] Auto-seed failed:", seedErr);
    }
  }

  // Resilient fallback if DB writes are unavailable
  if (!categories || categories.length === 0) {
    categories = DEFAULT_PLATFORM_CATEGORIES.map((name) => {
      const slug = slugify(name);
      return {
        id: `cat-${slug}`,
        name,
        slug,
        description: name,
        _count: { courses: 0 },
      };
    });
  }

  const payload = { success: true, categories };
  appCache.set(cacheKey, payload, 300);
  res.json(payload);
}

export async function getOne(req: AuthRequest, res: Response) {
  const idOrSlug = req.params.id;
  // Try to find by id first, then by slug
  let category = await prisma.category.findUnique({ where: { id: idOrSlug } });
  if (!category) {
    category = await prisma.category.findUnique({ where: { slug: idOrSlug } });
  }
  if (!category) throw new AppError(404, "Category not found");
  res.json({ success: true, category });
}

export async function create(req: AuthRequest, res: Response) {
  const data = createSchema.parse(req.body);
  const category = await prisma.category.create({ data });
  appCache.invalidate("categories:");
  res.status(201).json({ success: true, category });
}

export async function update(req: AuthRequest, res: Response) {
  const id = req.params.id;
  const data = createSchema.partial().parse(req.body);
  const category = await prisma.category.update({ where: { id }, data });
  appCache.invalidate("categories:");
  res.json({ success: true, category });
}
