export type DocIntent =
  | "LOGIN"
  | "COURSES"
  | "LEARNING_UNIVERSE"
  | "QUIZ"
  | "PROJECT"
  | "COLAB"
  | "GITHUB"
  | "CERTIFICATE"
  | "PAYMENTS"
  | "ADMIN"
  | "INSTRUCTOR"
  | "TROUBLESHOOTING"
  | "GENERAL";

interface IntentRule {
  intent: DocIntent;
  patterns: RegExp[];
  searchTerms: string[];
  sectionHints: string[];
  slugBoost?: string[];
}

const INTENT_RULES: IntentRule[] = [
  {
    intent: "LOGIN",
    patterns: [/log\s*in/i, /sign\s*in/i, /log\s*out/i, /password/i, /forgot/i, /reset password/i, /account access/i, /can't access/i],
    searchTerms: ["login", "sign in", "password", "forgot password", "logging in", "create account"],
    sectionHints: ["login", "logging in", "password", "account", "sign"],
    slugBoost: ["getting-started", "troubleshooting"],
  },
  {
    intent: "QUIZ",
    patterns: [/quiz/i, /mcq/i, /multiple choice/i, /assessment/i, /question.*answer/i],
    searchTerms: ["quiz", "creating quizzes", "multiple choice", "quiz block"],
    sectionHints: ["quiz", "quizzes"],
    slugBoost: ["instructor", "student", "faq"],
  },
  {
    intent: "CERTIFICATE",
    patterns: [/certif/i, /credential/i, /badge/i, /download cert/i],
    searchTerms: ["certificate", "certificates", "certificate criteria", "downloading"],
    sectionHints: ["certificate"],
    slugBoost: ["student", "instructor", "admin", "faq"],
  },
  {
    intent: "PROJECT",
    patterns: [/project/i, /submission/i, /review/i, /grade/i, /rubric/i],
    searchTerms: ["project", "project review", "submission", "workspace"],
    sectionHints: ["project"],
    slugBoost: ["instructor", "student", "faq"],
  },
  {
    intent: "GITHUB",
    patterns: [/github/i, /repository/i, /repo url/i],
    searchTerms: ["github", "repository", "github project"],
    sectionHints: ["github"],
    slugBoost: ["instructor", "student", "faq"],
  },
  {
    intent: "COLAB",
    patterns: [/colab/i, /google colab/i, /notebook/i],
    searchTerms: ["colab", "google colab", "notebook"],
    sectionHints: ["colab"],
    slugBoost: ["instructor", "student"],
  },
  {
    intent: "LEARNING_UNIVERSE",
    patterns: [/learning universe/i, /\blu\b/i, /track/i, /module/i, /lesson/i, /authoring studio/i, /visual studio/i, /academic studio/i, /dsl/i],
    searchTerms: ["learning universe", "visual authoring", "academic authoring", "publish"],
    sectionHints: ["learning universe", "visual", "academic", "track", "module", "lesson"],
    slugBoost: ["instructor"],
  },
  {
    intent: "COURSES",
    patterns: [/course/i, /curriculum/i, /lecture/i, /enroll/i, /browse/i],
    searchTerms: ["course", "enroll", "curriculum", "create course"],
    sectionHints: ["course", "courses", "enroll"],
    slugBoost: ["student", "instructor", "faq"],
  },
  {
    intent: "PAYMENTS",
    patterns: [/payment/i, /razorpay/i, /stripe/i, /checkout/i, /purchase/i, /refund/i, /pricing/i],
    searchTerms: ["payment", "pricing", "checkout", "razorpay"],
    sectionHints: ["payment", "pricing"],
    slugBoost: ["admin", "instructor", "faq"],
  },
  {
    intent: "ADMIN",
    patterns: [/admin/i, /user management/i, /approve instructor/i, /platform settings/i, /audit/i],
    searchTerms: ["admin", "user management", "platform", "settings"],
    sectionHints: ["admin", "user management", "platform"],
    slugBoost: ["admin"],
  },
  {
    intent: "INSTRUCTOR",
    patterns: [/instructor/i, /teach/i, /create lesson/i, /publish content/i],
    searchTerms: ["instructor", "create course", "publish"],
    sectionHints: ["instructor"],
    slugBoost: ["instructor"],
  },
  {
    intent: "TROUBLESHOOTING",
    patterns: [/won't work/i, /not working/i, /error/i, /fail/i, /issue/i, /problem/i, /can't/i, /cannot/i, /trouble/i, /fix/i],
    searchTerms: ["troubleshooting", "issues", "fix", "failed"],
    sectionHints: ["troubleshooting", "issues"],
    slugBoost: ["troubleshooting"],
  },
];

const RELATED_BY_INTENT: Record<DocIntent, string[]> = {
  LOGIN: ["Create an account", "Forgot password", "Login troubleshooting"],
  QUIZ: ["Creating Try It Yourself", "Quiz scoring", "Certificate rules"],
  CERTIFICATE: ["Course completion", "Quiz requirements", "Download certificate"],
  PROJECT: ["GitHub submission", "Colab projects", "Project reviews"],
  GITHUB: ["Project workspace", "Submit repository", "Project grading"],
  COLAB: ["Google Colab projects", "Project submission", "Visual Studio projects"],
  LEARNING_UNIVERSE: ["Visual Authoring Studio", "Academic DSL", "Publishing content"],
  COURSES: ["Enrolling in courses", "Course player", "Course pricing"],
  PAYMENTS: ["Instructor earnings", "Refunds", "Free courses"],
  ADMIN: ["User management", "Analytics", "AI configuration"],
  INSTRUCTOR: ["Create Learning Universe", "Student analytics", "Project reviews"],
  TROUBLESHOOTING: ["Login issues", "Video playback", "Publish failures"],
  GENERAL: ["Getting started", "Student manual", "FAQ"],
};

const FOLLOW_UP_BY_INTENT: Record<DocIntent, string[]> = {
  LOGIN: ["How do I reset my password?", "How do I create an account?"],
  QUIZ: ["Can a quiz have multiple correct answers?", "How do students take quizzes?"],
  CERTIFICATE: ["When do I receive my certificate?", "What are certificate criteria?"],
  PROJECT: ["How do I submit a GitHub project?", "How are projects graded?"],
  GITHUB: ["How do I create a GitHub project block?", "How do instructors review projects?"],
  COLAB: ["How do Colab projects work?", "How do students submit Colab work?"],
  LEARNING_UNIVERSE: ["How do I publish a Learning Universe?", "Visual vs Academic studio?"],
  COURSES: ["How do I enroll in a course?", "How do I create a course?"],
  PAYMENTS: ["What payment methods are supported?", "How do instructor earnings work?"],
  ADMIN: ["How do I approve instructors?", "How do payments work?"],
  INSTRUCTOR: ["How do I create a quiz?", "How do I review projects?"],
  TROUBLESHOOTING: ["Login not working", "Video won't play"],
  GENERAL: ["How do I get started?", "Where is the Help Center?"],
};

export function detectIntents(question: string, history?: Array<{ role: string; content: string }>): DocIntent[] {
  const intents = new Set<DocIntent>();
  const text = question.toLowerCase();

  for (const rule of INTENT_RULES) {
    if (rule.patterns.some((p) => p.test(question))) {
      intents.add(rule.intent);
    }
  }

  // Resolve pronouns from recent history ("Can it have multiple answers?" → quiz)
  if (intents.size === 0 || (intents.size === 1 && intents.has("GENERAL"))) {
    const lastUser = [...(history || [])].reverse().find((m) => m.role === "user");
    const lastAssistant = [...(history || [])].reverse().find((m) => m.role === "assistant");
    const contextText = `${lastUser?.content || ""} ${lastAssistant?.content || ""}`.toLowerCase();

    if (/^(can it|does it|how does it|what about it|multiple correct)/i.test(question)) {
      if (/quiz/i.test(contextText)) intents.add("QUIZ");
      if (/project/i.test(contextText)) intents.add("PROJECT");
      if (/certif/i.test(contextText)) intents.add("CERTIFICATE");
    }
  }

  if (intents.size === 0) intents.add("GENERAL");
  return [...intents];
}

export function expandQueryForIntents(question: string, intents: DocIntent[]): string {
  const terms = new Set(question.toLowerCase().split(/\s+/).filter(Boolean));
  for (const intent of intents) {
    const rule = INTENT_RULES.find((r) => r.intent === intent);
    if (rule) rule.searchTerms.forEach((t) => terms.add(t));
  }
  return [...terms].join(" ");
}

export function intentBoostForChunk(
  intent: DocIntent,
  manual: string,
  section: string,
  content: string,
  slug: string,
): number {
  const rule = INTENT_RULES.find((r) => r.intent === intent);
  if (!rule) return 0;

  let boost = 0;
  const hay = `${manual} ${section} ${content}`.toLowerCase();

  if (rule.slugBoost?.includes(slug)) boost += 0.25;
  for (const hint of rule.sectionHints) {
    if (section.toLowerCase().includes(hint) || hay.includes(hint)) boost += 0.12;
  }
  return boost;
}

export function getRelatedTopics(intents: DocIntent[]): string[] {
  const topics = new Set<string>();
  for (const intent of intents) {
    RELATED_BY_INTENT[intent]?.forEach((t) => topics.add(t));
  }
  return [...topics].slice(0, 4);
}

export function getFollowUpSuggestions(intents: DocIntent[]): string[] {
  const primary = intents[0] || "GENERAL";
  return (FOLLOW_UP_BY_INTENT[primary] || FOLLOW_UP_BY_INTENT.GENERAL).slice(0, 3);
}

export function resolveRoleFromPath(pathname?: string): "student" | "instructor" | "admin" | "guest" {
  if (!pathname) return "guest";
  if (pathname.includes("/help/admin") || pathname.startsWith("/admin")) return "admin";
  if (pathname.includes("/help/instructor") || pathname.startsWith("/instructor")) return "instructor";
  if (pathname.includes("/help/student") || pathname.startsWith("/student")) return "student";
  return "guest";
}

export const QUICK_QUESTIONS: Record<string, string[]> = {
  student: [
    "How do I enroll in a course?",
    "How do I get certificates?",
    "How do quizzes work?",
    "How do I log in?",
  ],
  instructor: [
    "How do I create a lesson?",
    "How do I add Try It Yourself?",
    "How do I create a project?",
    "How do I create a quiz?",
  ],
  admin: [
    "How do I approve instructors?",
    "How do payments work?",
    "How do certificates work?",
    "How do I manage users?",
  ],
  guest: [
    "How do I log in?",
    "How do I create an account?",
    "How do certificates work?",
    "How do I create a quiz?",
  ],
};
