
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const categoriesData = [
    { name: "Artificial Intelligence", slug: "artificial-intelligence", description: "From ML fundamentals to cutting-edge AI research" },
    { name: "Data Structures & Algorithms", slug: "data-structures-algorithms", description: "Master DSA for coding interviews and competitive programming" },
    { name: "Software Engineering", slug: "software-engineering", description: "Learn languages, frameworks, and system design" },
    { name: "Data Science", slug: "data-science", description: "Extract insights from data and build predictive models" },
    { name: "Cloud & DevOps", slug: "cloud-devops", description: "Build and deploy scalable cloud applications" },
    { name: "Cybersecurity", slug: "cybersecurity", description: "Protect systems and data from threats" },
    { name: "Career Preparation", slug: "career-preparation", description: "Resume building, mock interviews, and career guidance" },
    { name: "Research & Innovation", slug: "research-innovation", description: "Read papers, implement research, and explore emerging tech" }
  ];

  console.log("Seeding categories...");

  for (const data of categoriesData) {
    const existing = await prisma.category.findUnique({
      where: { slug: data.slug }
    });

    if (!existing) {
      await prisma.category.create({ data });
      console.log(`Created category: ${data.name}`);
    } else {
      console.log(`Category already exists: ${data.name}`);
    }
  }

  console.log("Categories seeded successfully!");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
