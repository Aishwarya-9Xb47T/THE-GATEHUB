/** Platform navigation manifest — keep in sync with App routes. Used by AI assistant context. */
export const PLATFORM_NAV_LINKS: Array<{ label: string; path: string; roles?: string[] }> = [
  { label: "Home", path: "/" },
  { label: "Help Center", path: "/help" },
  { label: "Documentation Search", path: "/help/search" },
  { label: "FAQ", path: "/help/faq" },
  { label: "Login", path: "/login" },
  { label: "Register", path: "/register" },
  { label: "Verify Certificate", path: "/verify/certificate" },
  { label: "Resources", path: "/resources" },

  // Student
  { label: "Student Dashboard", path: "/student", roles: ["student"] },
  { label: "Browse Courses", path: "/student/browse", roles: ["student"] },
  { label: "My Courses", path: "/student/my-courses", roles: ["student"] },
  { label: "Wishlist", path: "/student/wishlist", roles: ["student"] },
  { label: "Certificates", path: "/student/certificates", roles: ["student"] },
  { label: "Purchase History", path: "/student/purchases", roles: ["student"] },
  { label: "Quiz Results", path: "/student/quiz-results", roles: ["student"] },
  { label: "Student Profile", path: "/student/profile", roles: ["student"] },
  { label: "Student Settings", path: "/student/settings", roles: ["student"] },

  // Instructor
  { label: "Instructor Dashboard", path: "/instructor", roles: ["instructor"] },
  { label: "Instructor Courses", path: "/instructor/courses", roles: ["instructor"] },
  { label: "Create Course", path: "/instructor/courses/new", roles: ["instructor"] },
  { label: "Create Course (Manual)", path: "/instructor/courses/new/manual", roles: ["instructor"] },
  { label: "Create Course (AI)", path: "/instructor/courses/new/ai", roles: ["instructor"] },
  { label: "Course Branding", path: "/instructor/courses/new/branding", roles: ["instructor"] },
  { label: "Curriculum Builder", path: "/instructor/course", roles: ["instructor"] },
  { label: "Quiz Builder", path: "/instructor/course", roles: ["instructor"] },
  { label: "Create Learning Universe", path: "/instructor/learning-universe/new", roles: ["instructor"] },
  { label: "Visual Authoring Studio", path: "/instructor/learning-universe/new/visual", roles: ["instructor"] },
  { label: "Academic Authoring Studio", path: "/instructor/learning-universe/new/academic", roles: ["instructor"] },
  { label: "Academic Studio (LaTeX Editor)", path: "/instructor/latex-editor", roles: ["instructor"] },
  { label: "Instructor Students", path: "/instructor/students", roles: ["instructor"] },
  { label: "Project Reviews", path: "/instructor/project-reviews", roles: ["instructor"] },
  { label: "Instructor Certificates", path: "/instructor/certificates", roles: ["instructor"] },
  { label: "Instructor Reviews", path: "/instructor/reviews", roles: ["instructor"] },
  { label: "Instructor Analytics", path: "/instructor/analytics", roles: ["instructor"] },
  { label: "Instructor Earnings", path: "/instructor/earnings", roles: ["instructor"] },
  { label: "Free Learning Courses", path: "/manage-courses", roles: ["instructor"] },

  // Admin
  { label: "Admin Dashboard", path: "/admin", roles: ["admin"] },
  { label: "Admin Users", path: "/admin/users", roles: ["admin"] },
  { label: "Admin Courses", path: "/admin/courses", roles: ["admin"] },
  { label: "Admin Learning Universes", path: "/admin/learning-universes", roles: ["admin"] },
  { label: "Admin Categories", path: "/admin/categories", roles: ["admin"] },
  { label: "Admin Reports", path: "/admin/reports", roles: ["admin"] },
  { label: "Admin Reviews", path: "/admin/reviews", roles: ["admin"] },
  { label: "Admin Payments", path: "/admin/payments", roles: ["admin"] },
  { label: "Admin Analytics", path: "/admin/analytics", roles: ["admin"] },
  { label: "Admin Settings", path: "/admin/settings", roles: ["admin"] },

  // Learning (student paths — use :id placeholders in prose, concrete pattern for LU)
  { label: "Learning Universe Player", path: "/student/learning-universe", roles: ["student"] },
  { label: "Coding Lab Workspace", path: "/learning-universe", roles: ["student", "instructor"] },
  { label: "Research Workspace", path: "/learning-universe", roles: ["student", "instructor"] },
  { label: "Project Workspace", path: "/learning-universe", roles: ["student", "instructor"] },

  // Help guides
  { label: "Getting Started", path: "/help/getting-started" },
  { label: "Student Manual", path: "/help/student" },
  { label: "Instructor Manual", path: "/help/instructor" },
  { label: "Admin Manual", path: "/help/admin" },
  { label: "Integrations Guide", path: "/help/integrations" },
  { label: "Learning Universe Guide", path: "/help/learning-universe" },
  { label: "Coding Lab Guide", path: "/help/coding-lab" },
  { label: "Research Workspace Guide", path: "/help/research" },
  { label: "Publishing Guide", path: "/help/publishing" },
  { label: "AI Assistant Guide", path: "/help/ai-assistant" },
  { label: "Troubleshooting", path: "/help/troubleshooting" },
  { label: "Release Notes", path: "/help/release-notes" },
];

export function formatNavBlockForAssistant(role?: string): string {
  return PLATFORM_NAV_LINKS.filter(
    (l) => !l.roles?.length || !role || l.roles.includes(role) || role === "super_admin",
  )
    .map((l) => `- ${l.label}: ${l.path}`)
    .join("\n");
}
