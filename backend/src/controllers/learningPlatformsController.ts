import type { Request, Response } from "express";
import type { AuthRequest } from "../middlewares/auth.js";

export interface LearningPlatformInfo {
  id: string;
  name: string;
  tagline: string;
  description: string;
  logoUrl?: string;
  category: string;
  status: "active" | "coming_soon" | "beta";
  websiteUrl: string;
  embedUrl: string;
  joinUrl: string;
  supportsLti: boolean;
  supportsSso: boolean;
  features: string[];
  color: string;
  badge?: string;
}

const PLATFORMS: LearningPlatformInfo[] = [
  {
    id: "wayground",
    name: "Wayground",
    tagline: "Interactive assessments, gamified quizzes, flashcards & lessons",
    description: "Formerly Quizizz, Wayground provides millions of curriculum-aligned quizzes, flashcard decks, interactive lessons, and live gamified assessment activities.",
    category: "Gamified Assessment & Flashcards",
    status: "active",
    websiteUrl: "https://wayground.com",
    embedUrl: "https://wayground.com/join/dashboard",
    joinUrl: "https://wayground.com/join",
    supportsLti: true,
    supportsSso: true,
    badge: "Featured Active Integration",
    color: "from-pink-500/20 via-purple-500/20 to-indigo-500/20",
    features: [
      "Gamified Quizzes & Live Battle Arena",
      "Spaced Repetition Flashcard Decks",
      "Curriculum-Aligned Interactive Lessons",
      "Instant LTI 1.3 Grade & Progress Passback",
      "Seamless In-App Workspace Sandbox",
    ],
  },
  {
    id: "khan-academy",
    name: "Khan Academy",
    tagline: "Free world-class education for anyone, anywhere",
    description: "Extensive video libraries, step-by-step practice problems, and self-paced mastery learning paths across STEM and Humanities.",
    category: "Self-Paced Learning & Practice",
    status: "coming_soon",
    websiteUrl: "https://khanacademy.org",
    embedUrl: "https://khanacademy.org",
    joinUrl: "https://khanacademy.org",
    supportsLti: true,
    supportsSso: true,
    badge: "Coming Soon",
    color: "from-emerald-500/20 via-teal-500/20 to-cyan-500/20",
    features: [
      "Mastery Learning & Skill Progression",
      "Interactive Math & Science Exercises",
      "Official Test Prep & Micro-courses",
    ],
  },
  {
    id: "moodle",
    name: "Moodle LMS",
    tagline: "Open-source learning management system",
    description: "Connect institutional course materials, assignments, forums, and grading workflows via standard LTI 1.3 bridges.",
    category: "Institutional Learning Management",
    status: "coming_soon",
    websiteUrl: "https://moodle.org",
    embedUrl: "https://moodle.org",
    joinUrl: "https://moodle.org",
    supportsLti: true,
    supportsSso: true,
    badge: "LTI Bridge Planned",
    color: "from-amber-500/20 via-orange-500/20 to-red-500/20",
    features: [
      "Deep LTI 1.3 Course Synchronization",
      "Quiz Bank & Submission Importer",
      "Roster & Attendance Auto-Sync",
    ],
  },
  {
    id: "canvas",
    name: "Canvas LMS",
    tagline: "Modern cloud-native educational platform",
    description: "Direct integration with Instructure Canvas modules, speedgrader assignments, and course discussion threads.",
    category: "Enterprise LMS",
    status: "coming_soon",
    websiteUrl: "https://instructure.com/canvas",
    embedUrl: "https://instructure.com",
    joinUrl: "https://instructure.com",
    supportsLti: true,
    supportsSso: true,
    badge: "Enterprise LTI Planned",
    color: "from-rose-500/20 via-red-500/20 to-pink-500/20",
    features: [
      "Canvas External Tool (LTI 1.3) Integration",
      "Gradebook Synchronization API",
      "Course Module Embedding",
    ],
  },
  {
    id: "coursera",
    name: "Coursera for Campus",
    tagline: "Guided projects and professional certificates",
    description: "Empower students with industry-recognized certificate tracks from top universities and tech enterprises.",
    category: "Professional Certifications",
    status: "coming_soon",
    websiteUrl: "https://coursera.org",
    embedUrl: "https://coursera.org",
    joinUrl: "https://coursera.org",
    supportsLti: true,
    supportsSso: true,
    badge: "Explore Partnership",
    color: "from-blue-500/20 via-cyan-500/20 to-teal-500/20",
    features: [
      "External Certification Tracking",
      "Guided Project Sandbox Integration",
      "Skills Credit Passback",
    ],
  },
];

export async function getLearningPlatforms(req: Request, res: Response) {
  return res.json({
    success: true,
    data: {
      platforms: PLATFORMS,
      activePlatformId: "wayground",
      timestamp: new Date().toISOString(),
    },
  });
}

export async function getWaygroundConfig(req: Request, res: Response) {
  const authReq = req as AuthRequest;
  const user = authReq.user;

  return res.json({
    success: true,
    data: {
      platformId: "wayground",
      name: "Wayground",
      status: "connected",
      ltiVersion: "1.3",
      issuer: process.env.CLIENT_URL || "http://localhost:5173",
      clientId: "thegatehub-wayground-lti-v1",
      oidcInitiationUrl: `${process.env.CLIENT_URL || "http://localhost:5173"}/api/v1/learning-platforms/wayground/lti/init`,
      defaultEndpoints: {
        explore: "https://wayground.com/explore/admin",
        join: "https://wayground.com/join",
        dashboard: "https://wayground.com/join/dashboard",
        flashcards: "https://wayground.com/join/dashboard?view=flashcards",
        activities: "https://wayground.com/join/dashboard?view=activity",
      },
      userContext: user
        ? {
            id: user.id,
            email: user.email,
            name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
            role: user.role,
          }
        : null,
    },
  });
}

export async function launchWaygroundSession(req: Request, res: Response) {
  const { gameCode, targetView } = req.body;
  const authReq = req as AuthRequest;
  const user = authReq.user;

  let launchUrl = "https://wayground.com/join/dashboard";

  if (gameCode && String(gameCode).trim().length > 0) {
    const cleanCode = String(gameCode).replace(/\s+/g, "");
    launchUrl = `https://wayground.com/join?gc=${encodeURIComponent(cleanCode)}`;
  } else if (targetView === "join") {
    launchUrl = "https://wayground.com/join";
  } else if (targetView === "flashcards") {
    launchUrl = "https://wayground.com/join/dashboard?view=flashcards";
  } else if (targetView === "activity") {
    launchUrl = "https://wayground.com/join/dashboard?view=activity";
  }

  return res.json({
    success: true,
    data: {
      launchUrl,
      gameCode: gameCode || null,
      targetView: targetView || "dashboard",
      initiatedBy: user ? user.email : "guest",
      timestamp: new Date().toISOString(),
    },
  });
}
