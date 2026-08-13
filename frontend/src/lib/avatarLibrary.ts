export interface AvatarCategory {
  id: string;
  label: string;
  style: string;
  seeds: string[];
}

export const AVATAR_CATEGORIES: AvatarCategory[] = [
  {
    id: "professional",
    label: "Professional",
    style: "avataaars",
    seeds: ["Alice", "Bob", "Charlie", "David", "Eva", "Frank", "Grace", "Harry", "Ivy", "Jack", "Kara", "Leo", "Mia", "Nate", "Olivia", "Peter", "Quinn", "Rose", "Sam", "Toby"],
  },
  {
    id: "student",
    label: "Student",
    style: "adventurer",
    seeds: ["St1", "St2", "St3", "St4", "St5", "St6", "St7", "St8", "St9", "St10", "St11", "St12", "St13", "St14", "St15", "St16", "St17", "St18", "St19", "St20"],
  },
  {
    id: "minimal",
    label: "Minimal",
    style: "initials",
    seeds: ["Mi1", "Mi2", "Mi3", "Mi4", "Mi5", "Mi6", "Mi7", "Mi8", "Mi9", "Mi10", "Mi11", "Mi12", "Mi13", "Mi14", "Mi15", "Mi16", "Mi17", "Mi18", "Mi19", "Mi20"],
  },
  {
    id: "cartoon",
    label: "Cartoon",
    style: "lorelei",
    seeds: ["Ca1", "Ca2", "Ca3", "Ca4", "Ca5", "Ca6", "Ca7", "Ca8", "Ca9", "Ca10", "Ca11", "Ca12", "Ca13", "Ca14", "Ca15", "Ca16", "Ca17", "Ca18", "Ca19", "Ca20"],
  },
  {
    id: "fantasy",
    label: "Fantasy",
    style: "personas",
    seeds: ["Fa1", "Fa2", "Fa3", "Fa4", "Fa5", "Fa6", "Fa7", "Fa8", "Fa9", "Fa10", "Fa11", "Fa12", "Fa13", "Fa14", "Fa15", "Fa16", "Fa17", "Fa18", "Fa19", "Fa20"],
  },
  {
    id: "animals",
    label: "Animals",
    style: "identicon",
    seeds: ["An1", "An2", "An3", "An4", "An5", "An6", "An7", "An8", "An9", "An10", "An11", "An12", "An13", "An14", "An15", "An16", "An17", "An18", "An19", "An20"],
  },
  {
    id: "technology",
    label: "Technology",
    style: "bottts",
    seeds: ["Te1", "Te2", "Te3", "Te4", "Te5", "Te6", "Te7", "Te8", "Te9", "Te10", "Te11", "Te12", "Te13", "Te14", "Te15", "Te16", "Te17", "Te18", "Te19", "Te20"],
  },
  {
    id: "space",
    label: "Space",
    style: "pixel-art",
    seeds: ["Sp1", "Sp2", "Sp3", "Sp4", "Sp5", "Sp6", "Sp7", "Sp8", "Sp9", "Sp10", "Sp11", "Sp12", "Sp13", "Sp14", "Sp15", "Sp16", "Sp17", "Sp18", "Sp19", "Sp20"],
  },
  {
    id: "gaming",
    label: "Gaming",
    style: "pixel-art",
    seeds: ["Ga1", "Ga2", "Ga3", "Ga4", "Ga5", "Ga6", "Ga7", "Ga8", "Ga9", "Ga10", "Ga11", "Ga12", "Ga13", "Ga14", "Ga15", "Ga16", "Ga17", "Ga18", "Ga19", "Ga20"],
  },
  {
    id: "anime-style",
    label: "Anime-style",
    style: "micah",
    seeds: ["As1", "As2", "As3", "As4", "As5", "As6", "As7", "As8", "As9", "As10", "As11", "As12", "As13", "As14", "As15", "As16", "As17", "As18", "As19", "As20"],
  },
  {
    id: "robots",
    label: "Robots",
    style: "bottts-neutral",
    seeds: ["Ro1", "Ro2", "Ro3", "Ro4", "Ro5", "Ro6", "Ro7", "Ro8", "Ro9", "Ro10", "Ro11", "Ro12", "Ro13", "Ro14", "Ro15", "Ro16", "Ro17", "Ro18", "Ro19", "Ro20"],
  },
  {
    id: "abstract",
    label: "Abstract",
    style: "shapes",
    seeds: ["Ab1", "Ab2", "Ab3", "Ab4", "Ab5", "Ab6", "Ab7", "Ab8", "Ab9", "Ab10", "Ab11", "Ab12", "Ab13", "Ab14", "Ab15", "Ab16", "Ab17", "Ab18", "Ab19", "Ab20"],
  },
];

export function getAvatarUrl(category: string, seed: string): string {
  const cat = AVATAR_CATEGORIES.find((c) => c.id === category) || AVATAR_CATEGORIES[0]!;
  return `https://api.dicebear.com/7.x/${cat.style}/svg?seed=${encodeURIComponent(seed)}`;
}

export function getRandomAvatar(): { category: string; seed: string; url: string } {
  const cat = AVATAR_CATEGORIES[Math.floor(Math.random() * AVATAR_CATEGORIES.length)]!;
  const seed = cat.seeds[Math.floor(Math.random() * cat.seeds.length)]!;
  return {
    category: cat.id,
    seed,
    url: getAvatarUrl(cat.id, seed),
  };
}

export function getFallbackAvatarSvg(name: string): string {
  const initials = name.slice(0, 2).toUpperCase() || "??";
  const colors = [
    "#ef4444", "#f97316", "#f59e0b", "#10b981", "#06b6d4",
    "#3b82f6", "#6366f1", "#8b5cf6", "#d946ef", "#ec4899",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = colors[Math.abs(hash) % colors.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
    <rect width="100%" height="100%" fill="${color}" rx="50%"/>
    <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="34" font-weight="bold">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
