import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const instructor = await prisma.user.findUnique({ where: { email: "instructor@lms.dev" } });
  if (!instructor) return;

  const cat1 = await prisma.category.findUnique({ where: { slug: "artificial-intelligence" } });
  const cat2 = await prisma.category.findUnique({ where: { slug: "web-development" } });
  const cat3 = await prisma.category.findUnique({ where: { slug: "data-science" } });

  await prisma.course.create({
    data: {
      title: "Advanced Artificial Intelligence",
      subtitle: "Master the architecture of modern AI. Build and train deep neural networks from scratch using PyTorch.",
      description: "A comprehensive guide to modern AI and neural networks.",
      price: 99.99,
      status: "published",
      instructorId: instructor.id,
      categoryId: cat1?.id,
      thumbnail: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?q=80&w=800&auto=format&fit=crop",
    }
  });

  await prisma.course.create({
    data: {
      title: "Full Stack Web Development",
      subtitle: "Learn to build scalable, modern web applications from frontend to backend.",
      description: "Everything you need to know about React, Node.js, and databases.",
      price: 89.99,
      status: "published",
      instructorId: instructor.id,
      categoryId: cat2?.id,
      thumbnail: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=800&auto=format&fit=crop",
    }
  });

  await prisma.course.create({
    data: {
      title: "Data Science Foundations",
      subtitle: "Turn raw data into actionable intelligence. Learn Python, statistics, and machine learning basics.",
      description: "A solid introduction to the world of data.",
      price: 79.99,
      status: "published",
      instructorId: instructor.id,
      categoryId: cat3?.id,
      thumbnail: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=800&auto=format&fit=crop",
    }
  });

  console.log("Seeded 3 premium courses!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
