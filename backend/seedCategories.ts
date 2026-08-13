import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const categories = [
    // Tech & Programming
    "Programming Fundamentals", "Web Development", "Frontend Development", "Backend Development", 
    "Full Stack Development", "Mobile App Development", "DevOps", "Cloud Computing", "Cybersecurity", "Blockchain",
    // AI
    "Artificial Intelligence", "Machine Learning", "Deep Learning", "Neural Networks", "Computer Vision", 
    "Natural Language Processing", "Reinforcement Learning",
    // Generative AI
    "Generative AI", "Prompt Engineering", "Large Language Models", "AI Agents", "AI Automation", "AI Content Creation",
    // Data & Analytics
    "Data Science", "Data Analysis", "Big Data", "Data Engineering", "SQL", "Statistics", "Data Visualization",
    // Math for AI
    "Linear Algebra", "Probability & Statistics", "Calculus for Machine Learning",
    // Design & Creative
    "UI/UX Design", "Graphic Design", "Animation", "Video Editing", "Photography",
    // Business
    "Entrepreneurship", "Marketing", "Finance", "Management"
  ];

  let count = 0;
  for (const name of categories) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    await prisma.category.upsert({
      where: { slug },
      update: {},
      create: { name, slug, description: name },
    });
    count++;
  }

  console.log(`Seeded ${count} categories successfully.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
