/**
 * THE GATEHUB — Production-safe seed for a fresh database.
 *
 * Creates ONLY:
 *   - SUPER_ADMIN from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD (existing mechanism)
 *   - Admin / Instructor / Student from SEED_* env vars (optional)
 *   - Existing category taxonomy (idempotent upsert)
 *
 * NEVER creates: courses, LUs, products, quizzes, presentations,
 * enrollments, payments, certificates, or other demo content.
 *
 * Never hardcodes credentials. Never prints passwords.
 *
 *   npx prisma db seed
 *   npm run db:seed
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** Match authService.register / password reset: bcryptjs cost 12 */
const BCRYPT_ROUNDS = 12;

type SeedStatus =
  | "CREATED"
  | "ALREADY EXISTS"
  | "SKIPPED"
  | "ROLE CONFLICT";

type SeedResult = {
  label: string;
  role: string;
  status: SeedStatus;
  detail?: string;
};

const CATEGORIES = [
  "Programming Fundamentals",
  "Web Development",
  "Frontend Development",
  "Backend Development",
  "Full Stack Development",
  "Mobile App Development",
  "DevOps",
  "Cloud Computing",
  "Cybersecurity",
  "Blockchain",
  "Artificial Intelligence",
  "Machine Learning",
  "Deep Learning",
  "Neural Networks",
  "Computer Vision",
  "Natural Language Processing",
  "Reinforcement Learning",
  "Generative AI",
  "Prompt Engineering",
  "Large Language Models",
  "AI Agents",
  "AI Automation",
  "AI Content Creation",
  "Data Science",
  "Data Analysis",
  "Big Data",
  "Data Engineering",
  "SQL",
  "Statistics",
  "Data Visualization",
  "Linear Algebra",
  "Probability & Statistics",
  "Calculus for Machine Learning",
  "UI/UX Design",
  "Graphic Design",
  "Animation",
  "Video Editing",
  "Photography",
  "Entrepreneurship",
  "Marketing",
  "Finance",
  "Management",
];

function parseName(full: string | undefined, fallbackFirst: string, fallbackLast: string) {
  const raw = (full || "").trim();
  if (!raw) return { firstName: fallbackFirst, lastName: fallbackLast };
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: fallbackLast };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function ensureUser(opts: {
  label: string;
  role: string;
  email?: string;
  password?: string;
  nameEnv?: string;
  fallbackFirst: string;
  fallbackLast: string;
  seen: Set<string>;
}): Promise<SeedResult> {
  const { label, role, email, password, nameEnv, fallbackFirst, fallbackLast, seen } = opts;

  if (!email?.trim() || !password) {
    return {
      label,
      role,
      status: "SKIPPED",
      detail: "Production seed credentials are not configured.",
    };
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (seen.has(normalizedEmail)) {
    return {
      label,
      role,
      status: "SKIPPED",
      detail: "Same email already processed earlier in this seed run.",
    };
  }
  seen.add(normalizedEmail);

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, role: true },
  });

  if (existing) {
    if (existing.role === role) {
      return {
        label,
        role,
        status: "ALREADY EXISTS",
        detail: "Existing account preserved; password not overwritten.",
      };
    }
    return {
      label,
      role,
      status: "ROLE CONFLICT",
      detail: `Email already exists with role ${existing.role}; requested role ${role} requires manual review.`,
    };
  }

  const { firstName, lastName } = parseName(nameEnv, fallbackFirst, fallbackLast);
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      firstName,
      lastName,
      role,
      // Bootstrap accounts are operational from seed; SMTP delivery remains env-dependent.
      emailVerified: true,
      emailVerifiedAt: new Date(),
      authProvider: "local",
    },
    select: { id: true },
  });

  return { label, role, status: "CREATED" };
}

async function seedCategories(): Promise<{ status: string; count: number; created: number }> {
  let created = 0;
  for (const name of CATEGORIES) {
    const slug = slugify(name);
    const existing = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
    if (existing) continue;
    await prisma.category.create({
      data: { name, slug, description: name },
    });
    created++;
  }
  const count = await prisma.category.count();
  return {
    status: created === 0 ? "ALREADY EXIST" : created === CATEGORIES.length ? "CREATED" : "CREATED / ALREADY EXIST",
    count,
    created,
  };
}

async function contentCounts() {
  return {
    users: await prisma.user.count(),
    courses: await prisma.course.count(),
    lus: await prisma.learningUniverse.count(),
    products: await prisma.product.count(),
    quizzes: await prisma.quiz.count(),
    presentations: await prisma.presentation.count(),
    enrollments: await prisma.enrollment.count(),
    certificates:
      (await prisma.certificate.count()) + (await prisma.learningUniverseCertificate.count()),
    payments: await prisma.payment.count(),
    categories: await prisma.category.count(),
  };
}

function printReport(
  connected: boolean,
  results: SeedResult[],
  categories: { status: string; count: number },
  counts: Awaited<ReturnType<typeof contentCounts>>
) {
  const byLabel = (l: string) => results.find((r) => r.label === l);

  const fmt = (r?: SeedResult) => {
    if (!r) return "SKIPPED";
    return r.detail ? `${r.status}\n  ${r.detail}` : r.status;
  };

  console.log(`
========================================
THE GATEHUB — PRODUCTION SEED
========================================

Database:
${connected ? "CONNECTED" : "FAILED"}

Superadmin:
${fmt(byLabel("Superadmin"))}

Admin:
${fmt(byLabel("Admin"))}

Instructor:
${fmt(byLabel("Instructor"))}

Student:
${fmt(byLabel("Student"))}

Categories:
${categories.status} (${categories.count})

Demo content:
NOT CREATED

Passwords:
NOT DISPLAYED

Content counts after seed:
  users=${counts.users}
  courses=${counts.courses}
  lus=${counts.lus}
  products=${counts.products}
  quizzes=${counts.quizzes}
  presentations=${counts.presentations}
  enrollments=${counts.enrollments}
  certificates=${counts.certificates}
  payments=${counts.payments}

========================================
`.trim());
}

async function main() {
  await prisma.$queryRaw`SELECT 1`;

  const seen = new Set<string>();
  const results: SeedResult[] = [];

  results.push(
    await ensureUser({
      label: "Superadmin",
      role: "super_admin",
      email: process.env.SUPER_ADMIN_EMAIL,
      password: process.env.SUPER_ADMIN_PASSWORD,
      nameEnv: process.env.SUPER_ADMIN_NAME,
      fallbackFirst: "Platform",
      fallbackLast: "Admin",
      seen,
    })
  );

  results.push(
    await ensureUser({
      label: "Admin",
      role: "admin",
      email: process.env.SEED_ADMIN_EMAIL,
      password: process.env.SEED_ADMIN_PASSWORD,
      nameEnv: process.env.SEED_ADMIN_NAME,
      fallbackFirst: "Production",
      fallbackLast: "Admin",
      seen,
    })
  );

  results.push(
    await ensureUser({
      label: "Instructor",
      role: "instructor",
      email: process.env.SEED_INSTRUCTOR_EMAIL,
      password: process.env.SEED_INSTRUCTOR_PASSWORD,
      nameEnv: process.env.SEED_INSTRUCTOR_NAME,
      fallbackFirst: "Production",
      fallbackLast: "Instructor",
      seen,
    })
  );

  results.push(
    await ensureUser({
      label: "Student",
      role: "student",
      email: process.env.SEED_STUDENT_EMAIL,
      password: process.env.SEED_STUDENT_PASSWORD,
      nameEnv: process.env.SEED_STUDENT_NAME,
      fallbackFirst: "Production",
      fallbackLast: "Student",
      seen,
    })
  );

  const categories = await seedCategories();
  const pptCreated = await seedPptCategories();
  if (pptCreated > 0) {
    console.log(`[SEED] Seeded ${pptCreated} PPT topics/subtopics`);
  }
  const counts = await contentCounts();
  printReport(true, results, categories, counts);

  const conflicts = results.filter((r) => r.status === "ROLE CONFLICT");
  if (conflicts.length > 0) {
    process.exitCode = 2;
  }
}

main()
  .catch((e) => {
    console.error("Seed failed:", e instanceof Error ? e.message : "unknown error");
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

const INITIAL_PPT_CATEGORIES = [
  {
    name: "Programming",
    description: "Core programming languages, syntax, algorithms, and fundamental computer science concepts.",
    displayOrder: 1,
    subtopics: ["Python", "Java", "C Programming", "C++", "Data Structures and Algorithms"],
  },
  {
    name: "Artificial Intelligence",
    description: "AI paradigms, deep learning, NLP, computer vision, and foundation models.",
    displayOrder: 2,
    subtopics: [
      "Artificial Intelligence Fundamentals",
      "Machine Learning",
      "Deep Learning",
      "Natural Language Processing",
      "Generative AI",
      "Computer Vision",
    ],
  },
  {
    name: "Data Science",
    description: "Data analysis, statistical modeling, data visualization, and querying techniques.",
    displayOrder: 3,
    subtopics: ["Statistics", "Data Analytics", "Data Visualization", "SQL", "Python for Data Science"],
  },
  {
    name: "Web Development",
    description: "Modern full-stack web technologies, frontend frameworks, APIs, and client-server systems.",
    displayOrder: 4,
    subtopics: ["HTML and CSS", "JavaScript", "React.js", "Node.js", "Full Stack Development"],
  },
  {
    name: "Database Management",
    description: "Relational and NoSQL database management, schema design, and query optimization.",
    displayOrder: 5,
    subtopics: ["MySQL", "PostgreSQL", "MongoDB", "Database Design"],
  },
  {
    name: "Cloud Computing",
    description: "Cloud architectures, virtualization, cloud infrastructure providers, and DevOps practices.",
    displayOrder: 6,
    subtopics: ["AWS", "Microsoft Azure", "Google Cloud", "DevOps"],
  },
];

function slugifyPpt(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

async function seedPptCategories(): Promise<number> {
  let created = 0;
  for (const cat of INITIAL_PPT_CATEGORIES) {
    const topicSlug = slugifyPpt(cat.name);
    let topic = await prisma.pPTTopic.findFirst({
      where: {
        OR: [{ name: { equals: cat.name, mode: "insensitive" } }, { slug: topicSlug }],
      },
    });

    if (!topic) {
      try {
        topic = await prisma.pPTTopic.create({
          data: {
            name: cat.name,
            slug: topicSlug,
            description: cat.description,
            displayOrder: cat.displayOrder,
            isActive: true,
          },
        });
        created++;
      } catch {
        topic = await prisma.pPTTopic.findFirst({
          where: {
            OR: [{ name: { equals: cat.name, mode: "insensitive" } }, { slug: topicSlug }],
          },
        });
      }
    }

    if (topic) {
      for (let i = 0; i < cat.subtopics.length; i++) {
        const subName = cat.subtopics[i];
        const subSlug = slugifyPpt(subName);
        const existingSub = await prisma.pPTSubtopic.findFirst({
          where: {
            topicId: topic.id,
            OR: [{ name: { equals: subName, mode: "insensitive" } }, { slug: subSlug }],
          },
        });

        if (!existingSub) {
          try {
            await prisma.pPTSubtopic.create({
              data: {
                topicId: topic.id,
                name: subName,
                slug: subSlug,
                displayOrder: i + 1,
                isActive: true,
              },
            });
            created++;
          } catch {
            // Ignore race condition
          }
        }
      }
    }
  }
  return created;
}
