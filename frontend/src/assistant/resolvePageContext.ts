export interface PageContext {
  pathname: string;
  label: string;
  area: string;
  hints: string[];
  /** When the student is inside a Learning Universe lesson player */
  learning?: {
    universeId: string;
    universeTitle?: string;
    lessonId: string;
    lessonTitle: string;
    stepId: string | null;
    stepTitle: string | null;
    stepKind: string | null;
    progressPercent?: number;
  };
}

export function resolvePageContext(pathname: string): PageContext {
  const rules: Array<{ test: (p: string) => boolean; ctx: Omit<PageContext, "pathname"> }> = [
  {
    test: (p) => p.includes("/learning-universe/") && p.includes("/coding-lab/"),
    ctx: {
      label: "Coding Lab",
      area: "coding-lab",
      hints: ["How do I run code?", "How do I connect Colab?", "How do I submit my solution?"],
    },
  },
  {
    test: (p) => p.includes("/learning-universe/") && p.includes("/research/"),
    ctx: {
      label: "Research Workspace",
      area: "research",
      hints: ["How do I compile LaTeX?", "How do I connect Overleaf?", "How do references work?"],
    },
  },
  {
    test: (p) => p.includes("/learning-universe/") && p.includes("/notebook/"),
    ctx: {
      label: "Notebook Workspace",
      area: "notebook",
      hints: ["How do notebook cells work?", "How do I run analysis?", "How do I submit?"],
    },
  },
  {
    test: (p) => p.includes("/learning-universe/") && p.includes("/project"),
    ctx: {
      label: "Project Workspace",
      area: "project",
      hints: ["What are project requirements?", "How do I submit?", "How is my project graded?"],
    },
  },
  {
    test: (p) => p.includes("/learning-universe/") && (p.includes("/learn") || p.includes("/course")),
    ctx: {
      label: "Learning Universe",
      area: "learning-universe",
      hints: ["What is a checkpoint?", "How do quizzes work?", "What should I do next?"],
    },
  },
  {
    test: (p) => p.includes("/coding-lab/"),
    ctx: {
      label: "Coding Lab",
      area: "coding",
      hints: ["Help debug Python code", "Explain this exercise", "Review my solution approach"],
    },
  },
  {
    test: (p) => p.includes("/notebook/"),
    ctx: {
      label: "Notebook Workspace",
      area: "notebook",
      hints: ["Help with notebook cells", "Explain data analysis steps", "Debug notebook errors"],
    },
  },
  {
    test: (p) => p.includes("/research/"),
    ctx: {
      label: "Research Workspace",
      area: "research",
      hints: ["Help write LaTeX", "Structure a research paper", "Cite sources correctly"],
    },
  },
  {
    test: (p) => p.includes("/learn/") && p.includes("/project"),
    ctx: {
      label: "Project Workspace",
      area: "project",
      hints: ["Help with project requirements", "Review submission checklist", "Explain grading criteria"],
    },
  },
  {
    test: (p) => p.includes("/learn/"),
    ctx: {
      label: "Student Learning",
      area: "learning",
      hints: ["Explain this lesson", "What should I do next?", "How do quizzes work here?"],
    },
  },
  {
    test: (p) => p.includes("/learning-universe/new/visual"),
    ctx: {
      label: "Visual Authoring Studio",
      area: "authoring",
      hints: ["Help structure a learning path", "Add interactive steps", "Publish a learning universe"],
    },
  },
  {
    test: (p) => p.includes("/learning-universe/new/academic") || p.includes("/latex-editor"),
    ctx: {
      label: "Academic Authoring Studio",
      area: "authoring",
      hints: ["Help write LaTeX lessons", "Structure academic content", "Compile and fix LaTeX errors"],
    },
  },
  {
    test: (p) => p.includes("/quiz"),
    ctx: {
      label: "Quiz Builder",
      area: "quiz-builder",
      hints: ["How do I add questions?", "Why isn't my quiz saving?", "How do students take quizzes?"],
    },
  },
  {
    test: (p) => p.includes("/courses/new") || p.includes("/curriculum") || (p.includes("/course/") && p.includes("/edit")),
    ctx: {
      label: "Course Editor",
      area: "course-editor",
      hints: ["Help write lessons", "Add quizzes and labs", "How do I publish this course?"],
    },
  },
  {
    test: (p) => p.includes("/analytics"),
    ctx: {
      label: "Analytics",
      area: "analytics",
      hints: ["Explain these statistics", "How is engagement measured?", "What metrics should I track?"],
    },
  },
  {
    test: (p) => p.includes("/certificates"),
    ctx: {
      label: "Certificates",
      area: "certificates",
      hints: ["How do certificates work?", "Verify completion requirements", "Issue or manage certificates"],
    },
  },
  {
    test: (p) => p.startsWith("/help"),
    ctx: {
      label: "Help Center",
      area: "help",
      hints: ["Find documentation for this topic", "How do I get started?", "Where is the student manual?"],
    },
  },
  {
    test: (p) => p.startsWith("/resources"),
    ctx: {
      label: "Resources",
      area: "resources",
      hints: ["Browse free learning resources", "How do resources work?", "Find course materials"],
    },
  },
  {
    test: (p) => p.includes("/settings"),
    ctx: {
      label: "Settings",
      area: "settings",
      hints: ["Configure my account", "Notification preferences", "Security settings"],
    },
  },
  {
    test: (p) => p.includes("/profile"),
    ctx: {
      label: "Profile",
      area: "profile",
      hints: ["Update my profile", "Manage account details", "Change display information"],
    },
  },
  {
    test: (p) => p.startsWith("/admin"),
    ctx: {
      label: "Admin Dashboard",
      area: "admin",
      hints: ["Manage users and courses", "Review platform settings", "Handle reports and payments"],
    },
  },
  {
    test: (p) => p.startsWith("/instructor"),
    ctx: {
      label: "Instructor Dashboard",
      area: "instructor",
      hints: ["Help manage my courses", "Review student progress", "Create a new learning universe"],
    },
  },
  {
    test: (p) => p.startsWith("/student"),
    ctx: {
      label: "Student Dashboard",
      area: "student",
      hints: ["Find my courses", "Track my progress", "Earn certificates"],
    },
  },
  ];

  for (const rule of rules) {
    if (rule.test(pathname)) {
      return { pathname, ...rule.ctx };
    }
  }

  return {
    pathname,
    label: "THE GATEHUB",
    area: "general",
    hints: ["How do I get started?", "How do certificates work?", "How do I create a course?"],
  };
}

export function resolveQuickActions(pathname: string, userRole?: string): string[] {
  const ctx = resolvePageContext(pathname);
  if (ctx.hints.length >= 3) return ctx.hints.slice(0, 4);

  const byRole: Record<string, string[]> = {
    student: [
      "How do I enroll in a course?",
      "How do I get certificates?",
      "How do quizzes work?",
      "How do I track progress?",
    ],
    instructor: [
      "How do I create a lesson?",
      "How do I add a coding lab?",
      "How do I create a quiz?",
      "How do I publish a course?",
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
      "What is a Learning Universe?",
    ],
  };

  let role = "guest";
  if (pathname.startsWith("/admin") || userRole === "admin" || userRole === "super_admin") role = "admin";
  else if (pathname.startsWith("/instructor") || userRole === "instructor") role = "instructor";
  else if (pathname.startsWith("/student") || userRole === "student") role = "student";

  return byRole[role] ?? byRole.guest;
}
