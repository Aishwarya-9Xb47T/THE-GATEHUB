import { PrismaClient } from "../src/generated/client/index.js";
const prisma = new PrismaClient();

async function main() {
  const categoryStructure = [
    {
      name: "Development",
      icon: "Code",
      subcategories: [
        { name: "Web Development", icon: "Globe" },
        { name: "Mobile Development", icon: "Smartphone" },
        { name: "Programming Languages", icon: "Terminal" },
        { name: "Game Development", icon: "Gamepad" },
        { name: "Software Engineering", icon: "Cpu" },
        { name: "Database Management", icon: "Database" }
      ]
    },
    {
      name: "Data Science",
      icon: "Binary",
      subcategories: [
        { name: "Machine Learning", icon: "Network" },
        { name: "Artificial Intelligence", icon: "Brain" },
        { name: "Data Analysis", icon: "PieChart" },
        { name: "Deep Learning", icon: "Layers" },
        { name: "Big Data", icon: "HardDrive" }
      ]
    },
    {
      name: "IT & Software",
      icon: "Server",
      subcategories: [
        { name: "Network Security", icon: "ShieldAlert" },
        { name: "Cloud Computing", icon: "Cloud" },
        { name: "DevOps", icon: "Settings" },
        { name: "Operating Systems", icon: "Monitor" },
        { name: "Cybersecurity", icon: "Lock" }
      ]
    },
    {
      name: "Business",
      icon: "Briefcase",
      subcategories: [
        { name: "Entrepreneurship", icon: "Rocket" },
        { name: "Management", icon: "Users" },
        { name: "Finance", icon: "DollarSign" },
        { name: "Communication", icon: "MessageSquare" },
        { name: "Marketing", icon: "Megaphone" }
      ]
    }
  ];

  console.log("Resetting and seeding Udemy-style categories...");

  // Delete existing categories first to ensure a clean start
  await prisma.category.deleteMany({});

  for (const mainCat of categoryStructure) {
    const mainSlug = mainCat.name.toLowerCase().replace(/ & /g, "-").replace(/\s+/g, "-");
    const parent = await prisma.category.create({
      data: {
        name: mainCat.name,
        slug: mainSlug,
        icon: mainCat.icon,
        groupName: "Main Category"
      }
    });

    for (const subCat of mainCat.subcategories) {
      const subSlug = subCat.name.toLowerCase().replace(/ & /g, "-").replace(/\s+/g, "-");
      await prisma.category.create({
        data: {
          name: subCat.name,
          slug: subSlug,
          icon: subCat.icon,
          parentId: parent.id,
          groupName: mainCat.name // Use parent name as group name for subcategories
        }
      });
    }
  }

  console.log("Seeding Udemy-style categories finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
