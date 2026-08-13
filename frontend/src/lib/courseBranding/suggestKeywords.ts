/** Client-side smart banner keyword suggestions from course title */
export function suggestBannerKeywords(title: string, categoryName?: string): string[] {
  const t = `${title} ${categoryName || ""}`.toLowerCase();
  const keywords = new Set<string>();

  const rules: Array<{ match: RegExp; suggestions: string[] }> = [
    { match: /artificial intelligence|\bai\b/, suggestions: ["Artificial Intelligence", "Machine Learning", "Neural Networks", "Deep Learning"] },
    { match: /machine learning|\bml\b/, suggestions: ["Machine Learning", "Data Science", "Neural Networks", "AI Technology"] },
    { match: /deep learning/, suggestions: ["Deep Learning", "Neural Networks", "AI Research", "Machine Learning"] },
    { match: /generative|\bgpt\b|\bllm\b/, suggestions: ["Generative AI", "Artificial Intelligence", "Machine Learning", "Technology"] },
    { match: /software|engineering|programming|developer/, suggestions: ["Software Engineering", "Programming", "Full Stack", "Cloud Computing"] },
    { match: /web|frontend|backend|full.?stack/, suggestions: ["Web Development", "Frontend Development", "Backend Development", "Programming"] },
    { match: /mobile|android|ios|flutter/, suggestions: ["Mobile Development", "App Development", "Programming", "Technology"] },
    { match: /cyber|security|hacking|penetration/, suggestions: ["Cyber Security", "Ethical Hacking", "Network Security", "SOC Operations"] },
    { match: /cloud|aws|azure|gcp/, suggestions: ["Cloud Computing", "DevOps", "Infrastructure", "Technology"] },
    { match: /devops|ci\/?cd|kubernetes|docker/, suggestions: ["DevOps", "Cloud Computing", "Automation", "Infrastructure"] },
    { match: /data science|analytics|big data/, suggestions: ["Data Science", "Data Analytics", "Machine Learning", "Business Intelligence"] },
    { match: /research|innovation|academic|paper/, suggestions: ["Research", "Innovation", "Academic Research", "Scientific Computing"] },
    { match: /blockchain|crypto|web3/, suggestions: ["Blockchain", "Cryptocurrency", "Technology", "Programming"] },
    { match: /iot|internet of things/, suggestions: ["IoT", "Technology", "Embedded Systems", "Innovation"] },
    { match: /ar\/vr|virtual reality|augmented/, suggestions: ["AR/VR", "Technology", "Innovation", "3D Computing"] },
    { match: /product management/, suggestions: ["Product Management", "Business Strategy", "Technology", "Innovation"] },
    { match: /ui\/ux|design|user experience/, suggestions: ["UI/UX Design", "Digital Design", "Technology", "Creative"] },
    { match: /marketing|seo|social media/, suggestions: ["Digital Marketing", "Business", "Technology", "Analytics"] },
    { match: /business intelligence|\bbi\b/, suggestions: ["Business Intelligence", "Data Analytics", "Data Science", "Technology"] },
  ];

  for (const rule of rules) {
    if (rule.match.test(t)) rule.suggestions.forEach((s) => keywords.add(s));
  }

  if (keywords.size === 0) {
    ["Technology", "Programming", "Education", "Innovation", "Research"].forEach((s) => keywords.add(s));
  }

  if (title.trim()) keywords.add(title.trim());

  return Array.from(keywords).slice(0, 8);
}
