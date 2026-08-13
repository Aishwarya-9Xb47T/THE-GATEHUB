import { AppError } from "../middlewares/errorHandler.js";
import OpenAI from "openai";

const getOpenAi = (): OpenAI | null => {
  const k = process.env.OPENAI_API_KEY?.trim();
  return k ? new OpenAI({ apiKey: k }) : null;
};

export interface AILessonPlan {
  title: string;
  learningObjective: string;
  summary: string;
  content: string;
}

export interface AIModulePlan {
  title: string;
  description: string;
  lessons: AILessonPlan[];
  moduleQuiz?: {
    title: string;
    questions: Array<{
      text: string;
      options: string[];
      correctAnswer: string;
      explanation: string;
    }>;
  };
}

export interface AIProjectPlan {
  title: string;
  description: string;
  instructions: string;
  difficulty: "beginner" | "intermediate" | "advanced" | "capstone";
}

export interface AICourseAuthoringPackage {
  courseDetails: {
    title: string;
    subtitle: string;
    description: string;
    courseSummary: string;
    targetAudience: string[];
    prerequisites: string[];
    learningOutcomes: string[];
    estimatedDuration: string;
    suggestedPrice: number;
    difficulty: "beginner" | "intermediate" | "advanced";
    category: string;
    subcategory: string;
    language: string;
    seoDescription: string;
    seoKeywords: string[];
    thumbnailPrompt: string;
  };
  curriculum: AIModulePlan[];
  assessments: {
    practiceQuestions: Array<{ title: string; content: string }>;
    assignments: Array<{ title: string; description: string }>;
    codingExercises: Array<{ title: string; language: string; description: string; starterCode?: string }>;
    finalExam: {
      title: string;
      questions: Array<{
        text: string;
        options: string[];
        correctAnswer: string;
        explanation: string;
      }>;
    };
  };
  projects: {
    beginner: AIProjectPlan;
    intermediate: AIProjectPlan;
    advanced: AIProjectPlan;
    capstone: AIProjectPlan;
    githubIdeas: string[];
    portfolioProjects: string[];
    industryProjects: string[];
  };
  resources: {
    books: Array<{ title: string; url?: string }>;
    documentation: Array<{ title: string; url: string }>;
    youtube: Array<{ title: string; url: string }>;
    articles: Array<{ title: string; url: string }>;
    datasets: Array<{ title: string; url?: string }>;
    papers: Array<{ title: string; url?: string }>;
  };
}

const AUTHORING_JSON_SCHEMA = `{
  "courseDetails": {
    "title": "string",
    "subtitle": "string",
    "description": "string (2-3 paragraphs markdown)",
    "courseSummary": "string (1 paragraph)",
    "targetAudience": ["string"],
    "prerequisites": ["string"],
    "learningOutcomes": ["string (8-12 items)"],
    "estimatedDuration": "string e.g. 42 hours",
    "suggestedPrice": number,
    "difficulty": "beginner|intermediate|advanced",
    "category": "Development|Data Science|IT & Software|Business|Design|Health & Fitness",
    "subcategory": "must match category",
    "language": "en",
    "seoDescription": "string max 160 chars",
    "seoKeywords": ["string"],
    "thumbnailPrompt": "professional course cover description for image AI"
  },
  "curriculum": [{
    "title": "string",
    "description": "string",
    "lessons": [{
      "title": "string",
      "learningObjective": "string",
      "summary": "string",
      "content": "string (markdown lesson body, 200-400 words)"
    }],
    "moduleQuiz": {
      "title": "string",
      "questions": [{ "text": "string", "options": ["4 strings"], "correctAnswer": "string", "explanation": "string" }]
    }
  }],
  "assessments": {
    "practiceQuestions": [{ "title": "string", "content": "string" }],
    "assignments": [{ "title": "string", "description": "string" }],
    "codingExercises": [{ "title": "string", "language": "python|javascript|etc", "description": "string", "starterCode": "string" }],
    "finalExam": {
      "title": "string",
      "questions": [{ "text": "string", "options": ["4 strings"], "correctAnswer": "string", "explanation": "string" }]
    }
  },
  "projects": {
    "beginner": { "title": "string", "description": "string", "instructions": "string", "difficulty": "beginner" },
    "intermediate": { "title": "string", "description": "string", "instructions": "string", "difficulty": "intermediate" },
    "advanced": { "title": "string", "description": "string", "instructions": "string", "difficulty": "advanced" },
    "capstone": { "title": "string", "description": "string", "instructions": "string", "difficulty": "capstone" },
    "githubIdeas": ["string"],
    "portfolioProjects": ["string"],
    "industryProjects": ["string"]
  },
  "resources": {
    "books": [{ "title": "string", "url": "string optional" }],
    "documentation": [{ "title": "string", "url": "string" }],
    "youtube": [{ "title": "string", "url": "string" }],
    "articles": [{ "title": "string", "url": "string" }],
    "datasets": [{ "title": "string", "url": "string optional" }],
    "papers": [{ "title": "string", "url": "string optional" }]
  }
}`;

function topicPathHint(topic: string): string {
  const t = topic.toLowerCase();
  if (/deep learning|neural|cnn|rnn|transformer|llm|pytorch|tensorflow/.test(t)) {
    return `Use industry-standard progression: Python/ML foundations → Linear Algebra & Calculus refresher → Neural Networks → CNNs → RNNs → Transformers → LLMs → RAG → Agents → Deployment/MLOps. 8-10 modules, 5-7 lessons each.`;
  }
  if (/react|frontend|javascript|typescript|vue|angular/.test(t)) {
    return `Use progression: JS/TS fundamentals → React core → State management → Routing → Hooks patterns → Performance → Testing → Full-stack integration → Production deployment. 8-10 modules.`;
  }
  if (/operating system|os\b|kernel|process|thread/.test(t)) {
    return `Use progression: OS overview → Processes & threads → CPU scheduling → Memory management → Virtual memory → File systems → I/O → Synchronization → Security → Case studies (Linux/Windows). 8-10 modules.`;
  }
  if (/machine learning|ml\b/.test(t)) {
    return `Use progression: Python for ML → Statistics → Supervised learning → Unsupervised → Feature engineering → Model evaluation → Ensemble methods → Deployment. 8-10 modules.`;
  }
  return `Design 8-10 modules with 5-7 lessons each following a logical beginner-to-advanced industry learning path for "${topic}".`;
}

export async function generateFullCourseAuthoringPackage(topic: string): Promise<AICourseAuthoringPackage> {
  const pathHint = topicPathHint(topic);

  if (getOpenAi()) {
    try {
      const response = await getOpenAi()!.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a senior instructional designer at a top MOOC platform (Coursera/Udemy level). Generate complete, professional course authoring packages. Use real educational progression — never random lesson titles. Return ONLY valid JSON matching the schema. ${pathHint}`,
          },
          {
            role: "user",
            content: `Create a complete course authoring package for the topic: "${topic}".\n\nRequirements:\n- 8-10 modules (curriculum array)\n- 5-7 lessons per module with detailed markdown content\n- Module quiz with 5 questions per module\n- 3+ practice questions, 2+ assignments, 3+ coding exercises\n- Final exam with 10 questions\n- 4 tiered projects (beginner, intermediate, advanced, capstone)\n- Rich resources (books, docs, YouTube, articles, datasets, papers)\n- Realistic suggested price in USD (29-199 based on depth)\n- Pick the best category/subcategory from: Development, Data Science, IT & Software, Business, Design, Health & Fitness\n\nJSON schema:\n${AUTHORING_JSON_SCHEMA}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      });

      const raw = response.choices[0]?.message?.content;
      if (raw) {
        const parsed = JSON.parse(raw) as AICourseAuthoringPackage;
        return normalizePackage(parsed, topic);
      }
    } catch (err) {
      console.error("OpenAI authoring generation failed:", err);
    }
  }

  const geminiKey = process.env.GOOGLE_AI_API_KEY;
  if (geminiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `You are a senior instructional designer. ${pathHint}\n\nGenerate a complete course JSON for topic "${topic}". Return ONLY raw JSON.\nSchema:\n${AUTHORING_JSON_SCHEMA}`,
              }],
            }],
            generationConfig: { response_mime_type: "application/json", temperature: 0.7 },
          }),
        }
      );
      const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return normalizePackage(JSON.parse(text) as AICourseAuthoringPackage, topic);
    } catch (err) {
      console.error("Gemini authoring generation failed:", err);
    }
  }

  return generateIntelligentMockPackage(topic);
}

function normalizePackage(pkg: AICourseAuthoringPackage, topic: string): AICourseAuthoringPackage {
  const d = pkg.courseDetails;
  d.title = d.title || `${topic} — Complete Masterclass`;
  d.subtitle = d.subtitle || `From foundations to industry-ready ${topic}`;
  d.language = d.language || "en";
  d.difficulty = d.difficulty || "intermediate";
  d.suggestedPrice = typeof d.suggestedPrice === "number" ? d.suggestedPrice : 49;
  if (!d.category) d.category = "Data Science";
  if (!d.subcategory) d.subcategory = "Machine Learning";
  if (!pkg.curriculum?.length) {
    return generateIntelligentMockPackage(topic);
  }
  return pkg;
}

function generateIntelligentMockPackage(topic: string): AICourseAuthoringPackage {
  const t = topic.trim();
  const isDL = /deep learning/i.test(t);

  const moduleTitles = isDL
    ? [
        "Python & ML Foundations",
        "Linear Algebra for Deep Learning",
        "Neural Network Fundamentals",
        "Convolutional Neural Networks",
        "Recurrent Neural Networks & Sequences",
        "Transformers & Attention",
        "Large Language Models",
        "Retrieval-Augmented Generation",
        "AI Agents & Tool Use",
        "Model Deployment & MLOps",
      ]
    : [
        `Introduction to ${t}`,
        `Core Concepts of ${t}`,
        `Intermediate ${t} Techniques`,
        `Advanced ${t} Patterns`,
        `Building Real Projects`,
        `Performance & Best Practices`,
        `Industry Workflows`,
        `Capstone Preparation`,
      ];

  const curriculum: AIModulePlan[] = moduleTitles.map((title, mi) => ({
    title,
    description: `Master ${title.toLowerCase()} through structured lessons and hands-on practice.`,
    lessons: Array.from({ length: 5 }, (_, li) => ({
      title: `${title} — Lesson ${li + 1}`,
      learningObjective: `Understand key concepts in ${title} (lesson ${li + 1})`,
      summary: `A focused lesson covering essential ${t} material.`,
      content: `# ${title} — Lesson ${li + 1}\n\nIn this lesson you will learn core concepts related to **${t}**. We cover theory, intuition, and practical examples.\n\n## Key Topics\n- Conceptual foundations\n- Worked examples\n- Best practices\n\n## Summary\nBy the end of this lesson you will be able to apply these ideas in practice.`,
    })),
    moduleQuiz: {
      title: `${title} Assessment`,
      questions: Array.from({ length: 5 }, (_, qi) => ({
        text: `Module ${mi + 1} Question ${qi + 1}: Which concept is most important in ${title}?`,
        options: ["Foundational theory", "Random guessing", "Skipping practice", "Memorization only"],
        correctAnswer: "Foundational theory",
        explanation: "Strong foundations in theory enable practical mastery.",
      })),
    },
  }));

  return {
    courseDetails: {
      title: `${t}: Complete Professional Course`,
      subtitle: `Master ${t} from zero to industry-ready`,
      description: `## About This Course\n\nThis comprehensive course on **${t}** takes you from fundamentals to advanced applications. Designed by industry experts, it follows a proven learning path used at top tech companies.\n\nYou will build real projects, complete assessments, and graduate with portfolio-ready work.`,
      courseSummary: `A complete ${t} course with ${curriculum.length} modules, hands-on projects, and industry-standard assessments.`,
      targetAudience: ["Aspiring professionals", "Students", "Career switchers", `Anyone serious about ${t}`],
      prerequisites: ["Basic computer skills", "Willingness to practice regularly"],
      learningOutcomes: [
        `Explain core ${t} concepts with confidence`,
        "Build and evaluate real-world projects",
        "Apply industry best practices",
        "Prepare for technical interviews",
        "Deploy solutions to production",
        "Read research papers and documentation",
        "Collaborate using Git and modern tooling",
        "Present technical work professionally",
      ],
      estimatedDuration: `${curriculum.length * 5} hours`,
      suggestedPrice: isDL ? 89 : 59,
      difficulty: isDL ? "advanced" : "intermediate",
      category: isDL ? "Data Science" : "Development",
      subcategory: isDL ? "Deep Learning" : "Programming Languages",
      language: "en",
      seoDescription: `Learn ${t} with a complete professional course — modules, projects, quizzes, and capstone.`,
      seoKeywords: [t, "online course", "certification", "projects", "tutorial"],
      thumbnailPrompt: `Professional online course cover for "${t}", modern tech education, clean gradient background, abstract neural network or code motif, no text`,
    },
    curriculum,
    assessments: {
      practiceQuestions: [
        { title: `${t} Concept Review`, content: "Review core definitions and apply them to short scenarios." },
        { title: "Applied Problem Set", content: "Solve structured problems using course techniques." },
      ],
      assignments: [
        { title: `Mini Assignment: ${t} Basics`, description: "Complete a guided assignment demonstrating foundational skills." },
        { title: "Case Study Analysis", description: "Analyze a real-world scenario and propose a solution." },
      ],
      codingExercises: [
        { title: "Warm-up Exercise", language: "python", description: "Implement a core algorithm from scratch.", starterCode: "# Your code here\n" },
        { title: "Applied Coding Challenge", language: "python", description: "Build a small pipeline using course concepts.", starterCode: "def solve():\n    pass\n" },
      ],
      finalExam: {
        title: `${t} Final Examination`,
        questions: Array.from({ length: 10 }, (_, i) => ({
          text: `Final exam question ${i + 1} about ${t}`,
          options: ["Correct concept", "Distractor A", "Distractor B", "Distractor C"],
          correctAnswer: "Correct concept",
          explanation: "This reflects a core learning outcome from the course.",
        })),
      },
    },
    projects: {
      beginner: { title: `Starter ${t} Project`, description: "A guided beginner project.", instructions: "Follow the step-by-step guide to complete your first project.", difficulty: "beginner" },
      intermediate: { title: `Intermediate ${t} Application`, description: "Build a multi-component application.", instructions: "Integrate concepts from modules 1-5.", difficulty: "intermediate" },
      advanced: { title: `Advanced ${t} System`, description: "Design a production-grade solution.", instructions: "Apply advanced patterns and optimization.", difficulty: "advanced" },
      capstone: { title: `${t} Capstone`, description: "End-to-end portfolio project.", instructions: "Plan, build, test, and present a complete solution.", difficulty: "capstone" },
      githubIdeas: [`${t.toLowerCase().replace(/\s+/g, "-")}-starter`, `${t.toLowerCase().replace(/\s+/g, "-")}-portfolio`],
      portfolioProjects: [`End-to-end ${t} application`, `${t} research reproduction`],
      industryProjects: [`Production ${t} pipeline`, `Enterprise ${t} integration`],
    },
    resources: {
      books: [{ title: `Hands-On ${t}`, url: "" }],
      documentation: [{ title: "Official Documentation", url: "https://docs.python.org/3/" }],
      youtube: [{ title: `${t} Explained`, url: "https://www.youtube.com" }],
      articles: [{ title: `Getting Started with ${t}`, url: "https://example.com" }],
      datasets: [{ title: "Sample Dataset", url: "" }],
      papers: [{ title: "Seminal Research Paper", url: "https://arxiv.org" }],
    },
  };
}

export async function generateCourseThumbnail(prompt: string, title: string): Promise<string | null> {
  if (!openai) return null;
  try {
    const result = await getOpenAi()!.images.generate({
      model: "dall-e-3",
      prompt: `Professional e-learning course thumbnail, no text, no logos: ${prompt || title}`,
      size: "1024x1024",
      n: 1,
    });
    return result.data[0]?.url ?? null;
  } catch (err) {
    console.error("Thumbnail generation failed:", err);
    return null;
  }
}

export function buildQuizCreateData(
  title: string,
  questions: Array<{ text: string; options: string[]; correctAnswer: string; explanation: string }>
) {
  return {
    title,
    description: `Assessment: ${title}`,
    totalMarks: questions.length,
    questions: {
      create: questions.map((q, qi) => ({
        text: q.text,
        type: "multiple_choice",
        marks: 1,
        order: qi,
        explanation: q.explanation,
        options: {
          create: q.options.map((opt, oi) => ({
            text: opt,
            isCorrect: opt === q.correctAnswer,
            order: oi,
          })),
        },
      })),
    },
  };
}

export function formatLessonMarkdown(lesson: AILessonPlan): string {
  return `## Learning Objective\n${lesson.learningObjective}\n\n## Summary\n${lesson.summary}\n\n${lesson.content}`;
}

export function formatProjectMarkdown(project: AIProjectPlan): string {
  return `# ${project.title}\n\n**Difficulty:** ${project.difficulty}\n\n## Description\n${project.description}\n\n## Instructions\n${project.instructions}`;
}

export function formatResourcesMarkdown(resources: AICourseAuthoringPackage["resources"]): string {
  const lines = ["# Course Resources\n"];
  const add = (heading: string, items: Array<{ title: string; url?: string }>) => {
    if (!items?.length) return;
    lines.push(`## ${heading}\n`);
    for (const item of items) {
      lines.push(item.url ? `- [${item.title}](${item.url})` : `- ${item.title}`);
    }
    lines.push("");
  };
  add("Books", resources.books);
  add("Documentation", resources.documentation);
  add("YouTube", resources.youtube);
  add("Articles", resources.articles);
  add("Datasets", resources.datasets);
  add("Research Papers", resources.papers);
  return lines.join("\n");
}
