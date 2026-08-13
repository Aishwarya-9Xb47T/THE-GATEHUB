/** Verified Pexels photo URLs — landscape 16:9, no placeholders */
function pexels(photoId: number, width = 1920): string {
  return `https://images.pexels.com/photos/${photoId}/pexels-photo-${photoId}.jpeg?auto=compress&cs=tinysrgb&w=${width}&h=${Math.round((width * 9) / 16)}&fit=crop`;
}

export interface BannerTemplate {
  id: string;
  label: string;
  category: string;
  templateCategory: string;
  previewUrl: string;
  thumbnailUrl: string;
  gradient: string;
  theme: {
    primary: string;
    accent: string;
    mood: string;
  };
}

export const TEMPLATE_CATEGORIES = [
  "AI & ML",
  "Development",
  "Security",
  "Cloud & DevOps",
  "Data",
  "Emerging Tech",
  "Business & Design",
  "Research",
] as const;

export const BANNER_TEMPLATES: BannerTemplate[] = [
  {
    id: "artificial-intelligence",
    label: "Artificial Intelligence",
    category: "Artificial Intelligence",
    templateCategory: "AI & ML",
    previewUrl: pexels(2599244),
    thumbnailUrl: pexels(2599244, 640),
    gradient: "from-violet-600/80 to-indigo-900/90",
    theme: { primary: "#7c3aed", accent: "#312e81", mood: "futuristic" },
  },
  {
    id: "machine-learning",
    label: "Machine Learning",
    category: "Machine Learning",
    templateCategory: "AI & ML",
    previewUrl: pexels(3861969),
    thumbnailUrl: pexels(3861969, 640),
    gradient: "from-purple-600/80 to-blue-900/90",
    theme: { primary: "#9333ea", accent: "#1e3a8a", mood: "analytical" },
  },
  {
    id: "deep-learning",
    label: "Deep Learning",
    category: "Deep Learning",
    templateCategory: "AI & ML",
    previewUrl: pexels(8386440),
    thumbnailUrl: pexels(8386440, 640),
    gradient: "from-indigo-600/80 to-violet-900/90",
    theme: { primary: "#4f46e5", accent: "#4c1d95", mood: "neural" },
  },
  {
    id: "generative-ai",
    label: "Generative AI",
    category: "Generative AI",
    templateCategory: "AI & ML",
    previewUrl: pexels(17483868),
    thumbnailUrl: pexels(17483868, 640),
    gradient: "from-fuchsia-600/80 to-purple-900/90",
    theme: { primary: "#c026d3", accent: "#581c87", mood: "creative" },
  },
  {
    id: "software-engineering",
    label: "Software Engineering",
    category: "Software Engineering",
    templateCategory: "Development",
    previewUrl: pexels(1181671),
    thumbnailUrl: pexels(1181671, 640),
    gradient: "from-slate-700/80 to-slate-900/90",
    theme: { primary: "#475569", accent: "#0f172a", mood: "engineering" },
  },
  {
    id: "web-development",
    label: "Web Development",
    category: "Web Development",
    templateCategory: "Development",
    previewUrl: pexels(270348),
    thumbnailUrl: pexels(270348, 640),
    gradient: "from-blue-600/80 to-indigo-900/90",
    theme: { primary: "#2563eb", accent: "#312e81", mood: "digital" },
  },
  {
    id: "frontend-development",
    label: "Frontend Development",
    category: "Frontend Development",
    templateCategory: "Development",
    previewUrl: pexels(11035371),
    thumbnailUrl: pexels(11035371, 640),
    gradient: "from-sky-500/80 to-blue-800/90",
    theme: { primary: "#0ea5e9", accent: "#1e40af", mood: "interface" },
  },
  {
    id: "backend-development",
    label: "Backend Development",
    category: "Backend Development",
    templateCategory: "Development",
    previewUrl: pexels(442150),
    thumbnailUrl: pexels(442150, 640),
    gradient: "from-zinc-600/80 to-zinc-900/90",
    theme: { primary: "#52525b", accent: "#18181b", mood: "infrastructure" },
  },
  {
    id: "full-stack",
    label: "Full Stack Development",
    category: "Full Stack Development",
    templateCategory: "Development",
    previewUrl: pexels(5468190),
    thumbnailUrl: pexels(5468190, 640),
    gradient: "from-cyan-600/80 to-blue-900/90",
    theme: { primary: "#0891b2", accent: "#1e3a8a", mood: "integrated" },
  },
  {
    id: "mobile-development",
    label: "Mobile Development",
    category: "Mobile Development",
    templateCategory: "Development",
    previewUrl: pexels(607812),
    thumbnailUrl: pexels(607812, 640),
    gradient: "from-rose-600/80 to-purple-900/90",
    theme: { primary: "#e11d48", accent: "#581c87", mood: "mobile" },
  },
  {
    id: "cyber-security",
    label: "Cyber Security",
    category: "Cyber Security",
    templateCategory: "Security",
    previewUrl: pexels(8108728),
    thumbnailUrl: pexels(8108728, 640),
    gradient: "from-emerald-700/80 to-slate-900/90",
    theme: { primary: "#047857", accent: "#0f172a", mood: "secure" },
  },
  {
    id: "ethical-hacking",
    label: "Ethical Hacking",
    category: "Ethical Hacking",
    templateCategory: "Security",
    previewUrl: pexels(4974915),
    thumbnailUrl: pexels(4974915, 640),
    gradient: "from-green-700/80 to-gray-900/90",
    theme: { primary: "#15803d", accent: "#111827", mood: "offensive" },
  },
  {
    id: "cloud-computing",
    label: "Cloud Computing",
    category: "Cloud Computing",
    templateCategory: "Cloud & DevOps",
    previewUrl: pexels(325229),
    thumbnailUrl: pexels(325229, 640),
    gradient: "from-sky-500/80 to-blue-800/90",
    theme: { primary: "#0ea5e9", accent: "#1e40af", mood: "cloud" },
  },
  {
    id: "devops",
    label: "DevOps",
    category: "DevOps",
    templateCategory: "Cloud & DevOps",
    previewUrl: pexels(577585),
    thumbnailUrl: pexels(577585, 640),
    gradient: "from-orange-600/80 to-red-900/90",
    theme: { primary: "#ea580c", accent: "#7f1d1d", mood: "automation" },
  },
  {
    id: "data-science",
    label: "Data Science",
    category: "Data Science",
    templateCategory: "Data",
    previewUrl: pexels(669622),
    thumbnailUrl: pexels(669622, 640),
    gradient: "from-cyan-600/80 to-blue-900/90",
    theme: { primary: "#0891b2", accent: "#1e3a8a", mood: "analytical" },
  },
  {
    id: "data-analytics",
    label: "Data Analytics",
    category: "Data Analytics",
    templateCategory: "Data",
    previewUrl: pexels(590022),
    thumbnailUrl: pexels(590022, 640),
    gradient: "from-teal-600/80 to-emerald-900/90",
    theme: { primary: "#0d9488", accent: "#064e3b", mood: "insights" },
  },
  {
    id: "blockchain",
    label: "Blockchain",
    category: "Blockchain",
    templateCategory: "Emerging Tech",
    previewUrl: pexels(844124),
    thumbnailUrl: pexels(844124, 640),
    gradient: "from-indigo-600/80 to-violet-900/90",
    theme: { primary: "#4f46e5", accent: "#4c1d95", mood: "decentralized" },
  },
  {
    id: "iot",
    label: "IoT",
    category: "IoT",
    templateCategory: "Emerging Tech",
    previewUrl: pexels(1631007),
    thumbnailUrl: pexels(1631007, 640),
    gradient: "from-teal-600/80 to-emerald-900/90",
    theme: { primary: "#0d9488", accent: "#064e3b", mood: "connected" },
  },
  {
    id: "ar-vr",
    label: "AR/VR",
    category: "AR/VR",
    templateCategory: "Emerging Tech",
    previewUrl: pexels(8439096),
    thumbnailUrl: pexels(8439096, 640),
    gradient: "from-pink-600/80 to-purple-900/90",
    theme: { primary: "#db2777", accent: "#581c87", mood: "immersive" },
  },
  {
    id: "research-innovation",
    label: "Research & Innovation",
    category: "Research & Innovation",
    templateCategory: "Research",
    previewUrl: pexels(2280549),
    thumbnailUrl: pexels(2280549, 640),
    gradient: "from-amber-700/80 to-stone-900/90",
    theme: { primary: "#b45309", accent: "#1c1917", mood: "discovery" },
  },
  {
    id: "research-paper",
    label: "Research Paper Development",
    category: "Research Paper Development",
    templateCategory: "Research",
    previewUrl: pexels(261763),
    thumbnailUrl: pexels(261763, 640),
    gradient: "from-yellow-700/80 to-amber-900/90",
    theme: { primary: "#a16207", accent: "#78350f", mood: "academic" },
  },
  {
    id: "product-management",
    label: "Product Management",
    category: "Product Management",
    templateCategory: "Business & Design",
    previewUrl: pexels(3184465),
    thumbnailUrl: pexels(3184465, 640),
    gradient: "from-blue-700/80 to-slate-900/90",
    theme: { primary: "#1d4ed8", accent: "#0f172a", mood: "strategic" },
  },
  {
    id: "ui-ux-design",
    label: "UI/UX Design",
    category: "UI/UX Design",
    templateCategory: "Business & Design",
    previewUrl: pexels(196644),
    thumbnailUrl: pexels(196644, 640),
    gradient: "from-pink-500/80 to-rose-900/90",
    theme: { primary: "#ec4899", accent: "#881337", mood: "creative" },
  },
  {
    id: "digital-marketing",
    label: "Digital Marketing",
    category: "Digital Marketing",
    templateCategory: "Business & Design",
    previewUrl: pexels(265087),
    thumbnailUrl: pexels(265087, 640),
    gradient: "from-orange-500/80 to-red-800/90",
    theme: { primary: "#f97316", accent: "#991b1b", mood: "growth" },
  },
  {
    id: "business-intelligence",
    label: "Business Intelligence",
    category: "Business Intelligence",
    templateCategory: "Business & Design",
    previewUrl: pexels(669610),
    thumbnailUrl: pexels(669610, 640),
    gradient: "from-blue-600/80 to-indigo-900/90",
    theme: { primary: "#2563eb", accent: "#312e81", mood: "enterprise" },
  },
];

export function findTemplateById(id: string): BannerTemplate | undefined {
  return BANNER_TEMPLATES.find((t) => t.id === id);
}

const CATEGORY_TEMPLATE_ALIASES: Record<string, string> = {
  "artificial intelligence": "artificial-intelligence",
  "data structures & algorithms": "software-engineering",
  "software engineering": "software-engineering",
  "data science": "data-science",
  "cloud & devops": "cloud-computing",
  cybersecurity: "cyber-security",
  "cyber security": "cyber-security",
  "career preparation": "product-management",
  "research & innovation": "research-innovation",
  "machine learning": "machine-learning",
  "web development": "web-development",
  programming: "software-engineering",
  devops: "devops",
  blockchain: "blockchain",
  iot: "iot",
  "ui/ux": "ui-ux-design",
  "digital marketing": "digital-marketing",
};

export function matchTemplateToCategory(categoryName: string): BannerTemplate | undefined {
  const key = categoryName.toLowerCase().trim();
  const aliasId = CATEGORY_TEMPLATE_ALIASES[key];
  if (aliasId) return findTemplateById(aliasId);

  return BANNER_TEMPLATES.find(
    (t) =>
      t.category.toLowerCase() === key ||
      t.label.toLowerCase() === key ||
      key.includes(t.id.replace(/-/g, " ")) ||
      t.category.toLowerCase().includes(key) ||
      key.includes(t.category.toLowerCase())
  );
}
