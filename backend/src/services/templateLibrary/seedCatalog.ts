/**
 * Official template catalog — 100+ professional demo templates.
 * Seeded into quiz_library_templates on first library access.
 */

export interface TemplateCatalogEntry {
  slug: string;
  title: string;
  description: string;
  category: string;
  subject: string;
  gradeLevel: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  questionCount: number;
  durationMinutes: number;
  questionTypes: string[];
  coverGradient: string;
  authorName: string;
  isFeatured: boolean;
  ratingAvg: number;
  useCount: number;
  learningObjectives: string[];
  supportsHomework: boolean;
  supportsLive: boolean;
  supportsAi: boolean;
  supportsMedia: boolean;
}

const GRADIENTS = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #30cfd0 0%, #330867 100%)",
  "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
  "linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)",
  "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
  "linear-gradient(135deg, #0c3483 0%, #a2b6df 100%)",
];

const CATEGORIES = [
  "Midterm",
  "Final Exam",
  "Weekly Quiz",
  "Coding",
  "Programming",
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "AI",
  "Data Structures",
  "Aptitude",
  "Placement",
  "Interview",
  "General Knowledge",
  "Languages",
  "Computer Science",
  "University",
  "School",
  "Corporate",
  "Training",
  "Certification",
] as const;

const TEMPLATE_DEFS: Array<{
  title: string;
  subject: string;
  category: string;
  grade: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  questions: number;
  minutes: number;
  types: string[];
  featured?: boolean;
}> = [
  { title: "Programming Basics", subject: "Computer Science", category: "Programming", grade: "University", difficulty: "easy", tags: ["intro", "fundamentals"], questions: 20, minutes: 25, types: ["multiple_choice", "true_false"], featured: true },
  { title: "Python Fundamentals", subject: "Programming", category: "Coding", grade: "University", difficulty: "medium", tags: ["python", "syntax"], questions: 25, minutes: 30, types: ["multiple_choice", "short_answer", "coding"], featured: true },
  { title: "Java OOP Concepts", subject: "Programming", category: "Coding", grade: "University", difficulty: "medium", tags: ["java", "oop"], questions: 22, minutes: 28, types: ["multiple_choice", "multiple_select"], featured: true },
  { title: "C Programming", subject: "Programming", category: "Coding", grade: "University", difficulty: "medium", tags: ["c", "pointers"], questions: 20, minutes: 25, types: ["multiple_choice", "short_answer"] },
  { title: "C++ STL & Templates", subject: "Programming", category: "Coding", grade: "University", difficulty: "hard", tags: ["cpp", "stl"], questions: 18, minutes: 30, types: ["multiple_choice", "coding"] },
  { title: "DBMS Fundamentals", subject: "Computer Science", category: "University", grade: "University", difficulty: "medium", tags: ["sql", "normalization"], questions: 24, minutes: 35, types: ["multiple_choice", "short_answer"], featured: true },
  { title: "Operating Systems", subject: "Computer Science", category: "University", grade: "University", difficulty: "hard", tags: ["os", "processes"], questions: 26, minutes: 40, types: ["multiple_choice", "multiple_select"] },
  { title: "Computer Networks", subject: "Computer Science", category: "University", grade: "University", difficulty: "medium", tags: ["networking", "tcp"], questions: 22, minutes: 30, types: ["multiple_choice", "matching"] },
  { title: "Data Structures & Algorithms", subject: "Data Structures", category: "University", grade: "University", difficulty: "hard", tags: ["dsa", "trees"], questions: 30, minutes: 45, types: ["multiple_choice", "coding", "ordering"], featured: true },
  { title: "Aptitude — Quantitative", subject: "Aptitude", category: "Placement", grade: "University", difficulty: "medium", tags: ["math", "reasoning"], questions: 25, minutes: 30, types: ["multiple_choice", "numerical"], featured: true },
  { title: "Aptitude — Logical Reasoning", subject: "Aptitude", category: "Placement", grade: "University", difficulty: "medium", tags: ["logic", "patterns"], questions: 20, minutes: 25, types: ["multiple_choice", "ordering"] },
  { title: "AI Fundamentals", subject: "AI", category: "AI", grade: "University", difficulty: "medium", tags: ["ai", "ml-intro"], questions: 22, minutes: 30, types: ["multiple_choice", "true_false"], featured: true },
  { title: "Machine Learning Basics", subject: "AI", category: "AI", grade: "University", difficulty: "hard", tags: ["ml", "supervised"], questions: 28, minutes: 40, types: ["multiple_choice", "multiple_select"] },
  { title: "Cloud Computing Essentials", subject: "Computer Science", category: "Certification", grade: "Corporate", difficulty: "medium", tags: ["aws", "cloud"], questions: 24, minutes: 35, types: ["multiple_choice"] },
  { title: "Cyber Security Basics", subject: "Computer Science", category: "Certification", grade: "Corporate", difficulty: "medium", tags: ["security", "encryption"], questions: 20, minutes: 25, types: ["multiple_choice", "true_false"] },
  { title: "Probability & Statistics", subject: "Mathematics", category: "Mathematics", grade: "University", difficulty: "medium", tags: ["stats", "probability"], questions: 22, minutes: 35, types: ["multiple_choice", "numerical"], featured: true },
  { title: "Calculus I Review", subject: "Mathematics", category: "Midterm", grade: "University", difficulty: "hard", tags: ["calculus", "derivatives"], questions: 18, minutes: 45, types: ["multiple_choice", "short_answer"] },
  { title: "Linear Algebra", subject: "Mathematics", category: "Mathematics", grade: "University", difficulty: "medium", tags: ["matrices", "vectors"], questions: 20, minutes: 30, types: ["multiple_choice", "numerical"] },
  { title: "Physics — Mechanics", subject: "Physics", category: "Physics", grade: "School", difficulty: "medium", tags: ["mechanics", "forces"], questions: 20, minutes: 30, types: ["multiple_choice", "numerical"] },
  { title: "Physics — Electromagnetism", subject: "Physics", category: "Physics", grade: "University", difficulty: "hard", tags: ["em", "fields"], questions: 18, minutes: 35, types: ["multiple_choice"] },
  { title: "Chemistry — Organic Basics", subject: "Chemistry", category: "Chemistry", grade: "School", difficulty: "medium", tags: ["organic", "reactions"], questions: 22, minutes: 30, types: ["multiple_choice", "matching"] },
  { title: "Biology — Cell Biology", subject: "Biology", category: "Biology", grade: "School", difficulty: "easy", tags: ["cells", "organelles"], questions: 20, minutes: 25, types: ["multiple_choice", "image_based"] },
  { title: "English Grammar", subject: "Languages", category: "Languages", grade: "School", difficulty: "easy", tags: ["grammar", "english"], questions: 25, minutes: 20, types: ["multiple_choice", "fill_blank"] },
  { title: "Logical Reasoning Mocks", subject: "Aptitude", category: "Interview", grade: "University", difficulty: "hard", tags: ["interview", "logic"], questions: 30, minutes: 35, types: ["multiple_choice", "ordering"], featured: true },
  { title: "Mock Placement Test", subject: "Placement", category: "Placement", grade: "University", difficulty: "hard", tags: ["placement", "campus"], questions: 40, minutes: 50, types: ["multiple_choice", "numerical"], featured: true },
  { title: "University Midterm — CS", subject: "Computer Science", category: "Midterm", grade: "University", difficulty: "medium", tags: ["midterm", "cs"], questions: 25, minutes: 40, types: ["multiple_choice", "short_answer"] },
  { title: "Final Exam — Engineering", subject: "University", category: "Final Exam", grade: "University", difficulty: "hard", tags: ["final", "engineering"], questions: 35, minutes: 60, types: ["multiple_choice", "multiple_select"] },
  { title: "Weekly Quiz — Week 1", subject: "General Knowledge", category: "Weekly Quiz", grade: "School", difficulty: "easy", tags: ["weekly", "review"], questions: 10, minutes: 15, types: ["multiple_choice", "poll"] },
  { title: "Coding Contest Round 1", subject: "Programming", category: "Coding", grade: "University", difficulty: "hard", tags: ["contest", "algorithms"], questions: 15, minutes: 90, types: ["coding", "multiple_choice"], featured: true },
  { title: "MCQ Practice — Mixed", subject: "General Knowledge", category: "Training", grade: "School", difficulty: "easy", tags: ["practice", "mcq"], questions: 30, minutes: 25, types: ["multiple_choice"] },
  { title: "Interview Preparation — Tech", subject: "Interview", category: "Interview", grade: "Corporate", difficulty: "hard", tags: ["tech-interview", "faang"], questions: 25, minutes: 35, types: ["multiple_choice", "short_answer", "coding"] },
  { title: "Corporate Compliance Training", subject: "Corporate", category: "Corporate", grade: "Corporate", difficulty: "easy", tags: ["compliance", "hr"], questions: 15, minutes: 20, types: ["multiple_choice", "true_false"] },
  { title: "Certification — AWS Cloud", subject: "Certification", category: "Certification", grade: "Corporate", difficulty: "hard", tags: ["aws", "cert"], questions: 40, minutes: 65, types: ["multiple_choice", "multiple_select"] },
];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildSampleQuestions(count: number, types: string[], title: string, subject: string) {
  const samples: Record<string, string[]> = {
    multiple_choice: [
      `Which statement best describes a core concept in ${subject}?`,
      `What is the primary purpose of ${title.split("—")[0]?.trim() || subject}?`,
      `Select the correct definition related to ${subject}.`,
    ],
    true_false: [
      `${subject} fundamentals are essential for advanced study.`,
      `The concepts in ${title} apply only in theoretical contexts.`,
    ],
    short_answer: [`Briefly explain a key principle from ${title}.`],
    coding: [`Write a short program demonstrating a ${subject} concept.`],
    numerical: [`Calculate the result using standard ${subject} formulas.`],
    matching: [`Match terms with their definitions in ${subject}.`],
    ordering: [`Arrange the following ${subject} steps in correct order.`],
    multiple_select: [`Select all correct statements about ${subject}.`],
    fill_blank: [`Complete: The fundamental unit of ${subject} is _____.`],
    poll: [`How confident are you with ${title}?`],
    image_based: [`Identify the structure shown in the diagram for ${subject}.`],
  };

  const questions = [];
  for (let i = 0; i < count; i++) {
    const type = types[i % types.length] || "multiple_choice";
    const pool = samples[type] || samples.multiple_choice!;
    const text = pool[i % pool.length] || `Question ${i + 1} about ${subject}`;
    questions.push({
      text,
      type,
      difficulty: i % 3 === 0 ? "easy" : i % 3 === 1 ? "medium" : "hard",
      marks: type === "essay" || type === "coding" ? 2 : 1,
      order: i,
      explanation: `Review ${subject} materials to understand why this answer is correct.`,
      metadata: {
        bloomLevel: ["L1", "L2", "L3", "L4"][i % 4],
        estimatedSeconds: type === "coding" ? 180 : 60,
        hints: [`Consider the definition of key ${subject} terms.`],
        tags: [subject.toLowerCase().replace(/\s+/g, "-")],
      },
      options:
        type === "multiple_choice" || type === "multiple_select"
          ? [
              { text: "Correct answer", isCorrect: true, order: 0 },
              { text: "Plausible distractor A", isCorrect: false, order: 1 },
              { text: "Plausible distractor B", isCorrect: false, order: 2 },
              { text: "Plausible distractor C", isCorrect: false, order: 3 },
            ]
          : type === "true_false"
            ? [
                { text: "True", isCorrect: true, order: 0 },
                { text: "False", isCorrect: false, order: 1 },
              ]
            : [],
    });
  }
  return questions;
}

function expandCatalog(): TemplateCatalogEntry[] {
  const out: TemplateCatalogEntry[] = [];
  let idx = 0;

  for (const def of TEMPLATE_DEFS) {
    const slug = slugify(`${def.category}-${def.title}`);
    out.push({
      slug,
      title: def.title,
      description: `Professional ${def.title} template for ${def.subject}. Includes ${def.questions} questions, ${def.minutes}-minute duration, and ${def.types.join(", ")} question types. Ready to customize in Quiz Room.`,
      category: def.category,
      subject: def.subject,
      gradeLevel: def.grade,
      difficulty: def.difficulty,
      tags: def.tags,
      questionCount: def.questions,
      durationMinutes: def.minutes,
      questionTypes: def.types,
      coverGradient: GRADIENTS[idx % GRADIENTS.length]!,
      authorName: "THE GATEHUB",
      isFeatured: def.featured ?? false,
      ratingAvg: 4.2 + (idx % 8) * 0.1,
      useCount: 120 + idx * 47,
      learningObjectives: [
        `Assess understanding of ${def.subject} concepts`,
        `Practice with ${def.types[0]} questions`,
        `Prepare for ${def.category.toLowerCase()} assessments`,
      ],
      supportsHomework: true,
      supportsLive: true,
      supportsAi: def.tags.includes("ai") || def.subject === "AI",
      supportsMedia: def.types.includes("image_based") || idx % 3 === 0,
    });
    idx++;
  }

  // Expand with category × subject variants to reach 100+
  const extras: Array<{ title: string; subject: string; category: string }> = [];
  for (const cat of CATEGORIES) {
    for (const subj of ["Computer Science", "Mathematics", "Physics", "Biology", "Aptitude", "Programming"]) {
      if (out.length + extras.length >= 100) break;
      extras.push({
        title: `${cat} — ${subj}`,
        subject: subj,
        category: cat,
      });
    }
  }

  for (const ex of extras) {
    if (out.some((t) => t.slug === slugify(`${ex.category}-${ex.title}`))) continue;
    const q = 12 + (idx % 18);
    out.push({
      slug: slugify(`${ex.category}-${ex.title}-${idx}`),
      title: ex.title,
      description: `${ex.category} assessment template for ${ex.subject}. Customize questions, media, and scoring in Quiz Room.`,
      category: ex.category,
      subject: ex.subject,
      gradeLevel: idx % 2 === 0 ? "University" : "School",
      difficulty: idx % 3 === 0 ? "easy" : idx % 3 === 1 ? "medium" : "hard",
      tags: [slugify(ex.category), slugify(ex.subject)],
      questionCount: q,
      durationMinutes: Math.ceil(q * 1.2),
      questionTypes: ["multiple_choice", "multiple_select", "true_false"].slice(0, 1 + (idx % 3)),
      coverGradient: GRADIENTS[idx % GRADIENTS.length]!,
      authorName: "THE GATEHUB",
      isFeatured: idx % 12 === 0,
      ratingAvg: 4.0 + (idx % 10) * 0.08,
      useCount: 50 + idx * 23,
      learningObjectives: [`Master ${ex.subject} topics`, `Complete ${ex.category} practice`],
      supportsHomework: true,
      supportsLive: true,
      supportsAi: false,
      supportsMedia: idx % 4 === 0,
    });
    idx++;
    if (out.length >= 100) break;
  }

  return out.slice(0, 100);
}

export const OFFICIAL_TEMPLATE_CATALOG = expandCatalog();

export function catalogEntryToSnapshot(entry: TemplateCatalogEntry) {
  return {
    title: entry.title,
    description: entry.description,
    subject: entry.subject,
    metadata: {
      version: 1,
      settings: {
        shuffleQuestions: true,
        shuffleOptions: true,
        timePerQuestion: 30,
        showExplanations: true,
      },
      templateSlug: entry.slug,
    },
    questions: buildSampleQuestions(entry.questionCount, entry.questionTypes, entry.title, entry.subject),
  };
}
