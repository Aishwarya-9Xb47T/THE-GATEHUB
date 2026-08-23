/**
 * THE GATEHUB AI Curriculum Architect — scale-based structural planning.
 * Instructor configuration is the SOURCE OF TRUTH for module/lesson counts.
 * AI may enrich titles/topics but must not change structural scale.
 */
import type {
  AICourseArchitectInterview,
  ArchitectBlueprint,
  ArchitectModuleBlueprint,
  ArchitectLessonBlueprint,
  CurriculumResearchReport,
  CurriculumScalePlan,
  DifficultyTier,
} from "./types.js";

export type CourseScaleId =
  | "mini"
  | "standard"
  | "bootcamp"
  | "university"
  | "master"
  | "custom";

const SCALE_PRESETS: Record<
  Exclude<CourseScaleId, "custom">,
  { label: string; lessonMin: number; lessonMax: number; moduleRatio: number }
> = {
  mini: { label: "Mini Course", lessonMin: 10, lessonMax: 15, moduleRatio: 4 },
  standard: { label: "Standard Professional", lessonMin: 25, lessonMax: 40, moduleRatio: 5 },
  bootcamp: { label: "Comprehensive Bootcamp", lessonMin: 50, lessonMax: 80, moduleRatio: 6 },
  university: { label: "University Semester", lessonMin: 80, lessonMax: 120, moduleRatio: 6 },
  master: { label: "Master Program", lessonMin: 150, lessonMax: 180, moduleRatio: 8 },
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Balanced deterministic distribution: e.g. 17 lessons / 5 modules → [4,4,3,3,3] */
export function distributeLessonsAcrossModules(totalLessons: number, moduleCount: number): number[] {
  const modules = clampInt(moduleCount, 1, 40);
  const lessons = clampInt(totalLessons, 1, 200);
  const base = Math.floor(lessons / modules);
  const rem = lessons % modules;
  return Array.from({ length: modules }, (_, i) => base + (i < rem ? 1 : 0));
}

export function computeScalePlan(interview: AICourseArchitectInterview): CurriculumScalePlan {
  const scale = interview.courseScale || { id: "standard" as CourseScaleId };
  const notes: string[] = [];

  let targetLessons: number;
  let moduleCount: number;
  let lessonsPerModule: number;

  const customLessons = scale.customLessonCount != null ? clampInt(scale.customLessonCount, 1, 200) : undefined;
  const customModules = scale.customModuleCount != null ? clampInt(scale.customModuleCount, 1, 40) : undefined;
  const customLpm = scale.customLessonsPerModule != null ? clampInt(scale.customLessonsPerModule, 1, 30) : undefined;

  if (scale.id === "custom") {
    if (customModules != null && customLpm != null && customLessons != null) {
      const product = customModules * customLpm;
      moduleCount = customModules;
      if (product === customLessons) {
        targetLessons = customLessons;
        lessonsPerModule = customLpm;
      } else {
        // Instructor lesson total wins; distribute across preferred modules.
        targetLessons = customLessons;
        lessonsPerModule = Math.max(1, Math.round(targetLessons / moduleCount));
        notes.push(
          `Requested ${customModules} modules × ${customLpm} lessons/module (=${product}) conflicts with ${customLessons} total lessons. Using ${customLessons} lessons across ${customModules} modules.`,
        );
      }
    } else if (customModules != null && customLpm != null) {
      moduleCount = customModules;
      lessonsPerModule = customLpm;
      targetLessons = moduleCount * lessonsPerModule;
    } else if (customLessons != null && customModules != null) {
      targetLessons = customLessons;
      moduleCount = customModules;
      lessonsPerModule = Math.max(1, Math.round(targetLessons / moduleCount));
    } else if (customLessons != null && customLpm != null) {
      targetLessons = customLessons;
      lessonsPerModule = customLpm;
      moduleCount = Math.max(1, Math.ceil(targetLessons / lessonsPerModule));
      notes.push(`Derived ${moduleCount} modules from ${targetLessons} lessons at ~${lessonsPerModule} per module.`);
    } else if (customLessons != null) {
      targetLessons = customLessons;
      const ratio = 5;
      moduleCount = Math.max(1, Math.ceil(targetLessons / ratio));
      lessonsPerModule = Math.max(1, Math.ceil(targetLessons / moduleCount));
    } else if (customModules != null) {
      moduleCount = customModules;
      lessonsPerModule = customLpm ?? 4;
      targetLessons = moduleCount * lessonsPerModule;
      notes.push(`No total lesson count set — using ${moduleCount} modules × ${lessonsPerModule} lessons/module.`);
    } else {
      // Custom selected but empty → fall back to standard mid-range
      const preset = SCALE_PRESETS.standard;
      targetLessons = Math.floor((preset.lessonMin + preset.lessonMax) / 2);
      moduleCount = Math.max(1, Math.ceil(targetLessons / preset.moduleRatio));
      lessonsPerModule = Math.max(1, Math.ceil(targetLessons / moduleCount));
      notes.push("Custom scale had no counts — applied Standard Professional defaults.");
    }
  } else {
    const preset = SCALE_PRESETS[scale.id as Exclude<CourseScaleId, "custom">] ?? SCALE_PRESETS.standard;
    // Allow optional overrides on preset scales if instructor filled custom fields
    if (customLessons != null || customModules != null) {
      targetLessons = customLessons ?? Math.floor((preset.lessonMin + preset.lessonMax) / 2);
      moduleCount = customModules ?? Math.max(1, Math.ceil(targetLessons / preset.moduleRatio));
      lessonsPerModule = customLpm ?? Math.max(1, Math.ceil(targetLessons / moduleCount));
      if (customLessons == null && customLpm != null && customModules != null) {
        targetLessons = moduleCount * lessonsPerModule;
      }
    } else {
      targetLessons = Math.floor((preset.lessonMin + preset.lessonMax) / 2);
      moduleCount = Math.max(1, Math.ceil(targetLessons / preset.moduleRatio));
      lessonsPerModule = Math.max(1, Math.ceil(targetLessons / moduleCount));
    }
  }

  targetLessons = clampInt(targetLessons, 1, 200);
  moduleCount = clampInt(moduleCount, 1, 40);
  if (moduleCount > targetLessons) {
    notes.push(`Reduced modules from ${moduleCount} to ${targetLessons} so each module has at least one lesson.`);
    moduleCount = targetLessons;
  }

  const lessonDistribution = distributeLessonsAcrossModules(targetLessons, moduleCount);
  lessonsPerModule = Math.max(1, Math.round(targetLessons / moduleCount));

  const trackCount = targetLessons >= 80 ? 2 : 1;
  const labsPerModule = interview.practicalComponents.includes("Coding Labs") ? 1 : 0;
  const projectsTotal = interview.practicalComponents.some((p) => /project/i.test(p))
    ? Math.max(1, Math.floor(moduleCount / 2))
    : 0;
  const quizStrategy = interview.assessmentStrategy.style;
  const quizzesPerLesson = quizStrategy.includes("every lesson") ? 1 : 0;
  const moduleQuizzes = quizStrategy.includes("every module") || quizStrategy.includes("Quiz after every module") ? 1 : 0;

  const scaleLabel =
    scale.id === "custom"
      ? "Custom"
      : SCALE_PRESETS[scale.id as Exclude<CourseScaleId, "custom">]?.label ?? "Standard";

  return {
    scaleId: scale.id,
    scaleLabel,
    targetLessons,
    trackCount,
    moduleCount,
    lessonsPerModule,
    lessonDistribution,
    structureNote: notes.length ? notes.join(" ") : undefined,
    estimatedHours: interview.courseInfo.estimatedHours ?? Math.ceil(targetLessons * 0.75),
    labsTotal: labsPerModule * moduleCount,
    projectsTotal,
    quizzesPerLesson,
    moduleQuizzes,
    capstone: interview.practicalComponents.some((p) => /capstone|major project/i.test(p)),
    finalExam: interview.assessmentStrategy.methods.some((m) => /final exam/i.test(m)),
  };
}

/**
 * After AI title enrichment, restore exact module/lesson counts and IDs from the plan.
 * AI may only change titles/descriptions — never structure.
 */
export function enforceBlueprintStructure(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview,
  research?: CurriculumResearchReport,
): ArchitectBlueprint {
  // Always recompute from instructor interview — never trust a stale blueprint plan
  const plan = computeScalePlan(interview);
  const skeleton = planCurriculumStructure(interview, research ?? blueprint.researchReport ?? emptyResearch(interview));
  const enforced = structuredClone(blueprint);

  enforced.curriculumPlan = plan;
  enforced.tracks = skeleton.tracks;
  enforced.estimatedHours = plan.estimatedHours;
  enforced.estimatedDuration = `${plan.estimatedHours} hours`;
  enforced.subtitle = skeleton.subtitle;

  // Rebuild modules from skeleton; preserve enriched titles where IDs match
  enforced.modules = skeleton.modules.map((skelMod, mi) => {
    const existing = blueprint.modules.find((m) => m.id === skelMod.id) ?? blueprint.modules[mi];
    return {
      ...skelMod,
      title: existing?.title?.trim() || skelMod.title,
      description: existing?.description?.trim() || skelMod.description,
      learningOutcomes:
        existing?.learningOutcomes?.length ? existing.learningOutcomes : skelMod.learningOutcomes,
      lessons: skelMod.lessons.map((skelLesson, li) => {
        const existingLesson =
          existing?.lessons?.find((l) => l.id === skelLesson.id) ?? existing?.lessons?.[li];
        return {
          ...skelLesson,
          title: existingLesson?.title?.trim() || skelLesson.title,
          difficultyTier: existingLesson?.difficultyTier || skelLesson.difficultyTier,
        };
      }),
      moduleQuiz: existing?.moduleQuiz ?? skelMod.moduleQuiz,
      project: existing?.project ?? skelMod.project,
    };
  });

  return enforced;
}

function emptyResearch(interview: AICourseArchitectInterview): CurriculumResearchReport {
  const subject = interview.courseInfo.subject || interview.courseInfo.title;
  return {
    courseRationale: `Curriculum structure for ${subject}.`,
    industryStandards: [],
    universityReferences: [],
    officialDocumentation: [],
    recommendedProgression: [],
    skillDependencyGraph: "",
    prerequisiteGraph: "",
    prerequisites: interview.courseInfo.prerequisites || [],
    learningOutcomes: interview.courseInfo.expectedOutcomes || [],
    conceptMap: [],
    researchSources: [],
    researchedAt: new Date().toISOString(),
  };
}

export function buildDifficultyCurve(
  interview: AICourseArchitectInterview,
  totalLessons: number
): DifficultyTier[] {
  const dist = interview.difficultyDistribution;

  if (dist.mode === "unit-counts") {
    const b = dist.easyUnits ?? Math.round(totalLessons * 0.2);
    const m = dist.mediumUnits ?? Math.round(totalLessons * 0.5);
    const a = dist.advancedUnits ?? Math.max(0, totalLessons - b - m);
    const total = b + m + a;
    const scale = total > 0 && total !== totalLessons ? totalLessons / total : 1;
    const bCount = Math.round(b * scale);
    const mCount = Math.round(m * scale);
    const aCount = Math.max(0, totalLessons - bCount - mCount);
    return [
      ...Array(bCount).fill("beginner" as DifficultyTier),
      ...Array(mCount).fill("intermediate" as DifficultyTier),
      ...Array(aCount).fill("advanced" as DifficultyTier),
    ];
  }

  if (dist.mode === "ai-decides" || dist.beginnerPercent == null) {
    const curve: DifficultyTier[] = [];
    for (let i = 0; i < totalLessons; i++) {
      const p = i / Math.max(totalLessons - 1, 1);
      if (p < 0.2) curve.push("beginner");
      else if (p < 0.7) curve.push("intermediate");
      else curve.push("advanced");
    }
    return curve;
  }

  const b = dist.beginnerPercent ?? 20;
  const m = dist.intermediatePercent ?? 50;
  const a = dist.advancedPercent ?? 30;
  const bCount = Math.round((totalLessons * b) / 100);
  const mCount = Math.round((totalLessons * m) / 100);
  const aCount = totalLessons - bCount - mCount;

  return [
    ...Array(bCount).fill("beginner" as DifficultyTier),
    ...Array(mCount).fill("intermediate" as DifficultyTier),
    ...Array(Math.max(0, aCount)).fill("advanced" as DifficultyTier),
  ];
}

const DOMAIN_MODULE_MAPS: Record<string, string[]> = {
  "data structure": [
    "Memory Management & Sequential Array Structures",
    "Linked Lists & Dynamic Pointer Chaining",
    "Stacks, Queues & Call-Stack Mechanics",
    "Binary Search Trees & Hierarchical Indexing",
    "Balanced Trees: AVL & Red-Black Architectures",
    "Hash Tables & Hash Collision Resolution",
    "Priority Queues & Binary Heap Mechanics",
    "Graph Data Structures & Adjacency Representations",
    "Graph Traversal: BFS, DFS & Shortest Paths",
    "Advanced Memory Structures & Dynamic Programming Tables",
  ],
  "dsa": [
    "Algorithm Complexity & Asymptotic Notation",
    "Recursion & Divide and Conquer Strategies",
    "Sorting Algorithms & Comparison Lower Bounds",
    "Searching & Indexing Techniques",
    "Greedy Algorithms & Optimal Choice Structures",
    "Dynamic Programming & State Transition Design",
    "Graph Algorithms & Network Flow Analysis",
    "String Matching & Trie Structures",
  ],
  "algorithm": [
    "Asymptotic Analysis & Growth Rates",
    "Divide-and-Conquer Recurrences",
    "Sorting & Selection Algorithms",
    "Greedy Optimization & Matroids",
    "Dynamic Programming Foundations & Memoization",
    "Graph Search & Minimum Spanning Trees",
    "Shortest Path Algorithms: Dijkstra & Bellman-Ford",
    "NP-Completeness & Approximation Algorithms",
  ],
  "machine learning": [
    "Linear Algebra & Statistical Vector Foundations",
    "Data Preprocessing, Cleaning & Feature Engineering",
    "Supervised Learning: Linear & Logistic Regression",
    "Decision Trees, Random Forests & Ensemble Methods",
    "Unsupervised Learning: K-Means & PCA Clustering",
    "Model Evaluation, Overfitting & Cross-Validation",
    "Neural Network Architectures & Backpropagation",
    "MLOps: Model Deployment & Production Pipelines",
  ],
  "deep learning": [
    "Neural Network Calculus & Tensor Operations",
    "Backpropagation & Optimization Algorithms",
    "Convolutional Neural Networks & Computer Vision",
    "Recurrent Neural Networks & Sequence Modeling",
    "Attention Mechanisms & Transformer Architectures",
    "Generative Models: VAEs & Diffusion Networks",
    "Deep Reinforcement Learning & Q-Learning",
    "Large Language Models & Fine-Tuning Strategies",
  ],
  "cybersecurity": [
    "Network Security & Transport Protocol Hardening",
    "Cryptography & Public Key Infrastructure",
    "Web Application Security & OWASP Top 10",
    "Threat Modeling & Attack Surface Mitigation",
    "Penetration Testing & Exploitation Frameworks",
    "Incident Response & Digital Forensic Analysis",
    "Cloud Identity & Zero Trust Access Architecture",
    "Enterprise Security Operations & Audit Compliance",
  ],
  "operating system": [
    "Kernel Architecture & System Call Interfaces",
    "Process Management & Multithreading Control",
    "CPU Scheduling & Synchronization Primitives",
    "Virtual Memory, Paging & Translation Lookaside",
    "File System Internals & Disk Allocation",
    "Input/Output Subsystems & Interrupt Handling",
    "Virtualization, Containers & OS Security",
    "Distributed Systems & Distributed Shared Memory",
  ],
  "networking": [
    "Physical Layer & Signal Modulation",
    "Data Link Layer, Ethernet & Switching",
    "IP Addressing, Subnetting & Packet Routing",
    "Transport Layer: TCP Congestion & UDP Sockets",
    "Domain Name System & Application Protocols",
    "Network Security Protocols: TLS, IPsec & VPNs",
    "Software-Defined Networking & Network Automation",
    "Wireless, Cellular & Edge Network Architectures",
  ],
  "web dev": [
    "HTML5 Semantic Structure & Modern CSS Layouts",
    "JavaScript Mechanics & Asynchronous Promises",
    "React Architecture & State Management",
    "Node.js Backend & RESTful API Design",
    "Database Schema Modeling: SQL vs MongoDB",
    "Authentication: JWT, OAuth2 & Session Security",
    "Frontend Performance & Bundle Optimization",
    "CI/CD Pipelines & Cloud Container Deployment",
  ],
  "database": [
    "Relational Algebra & SQL Query Optimization",
    "Database Normalization & Entity Modeling",
    "Indexing Structures: B-Trees & Hash Indexes",
    "Transaction Management & ACID Isolation Levels",
    "NoSQL Document & Key-Value Architectures",
    "Distributed Databases, Replication & Sharding",
    "Data Warehousing, OLAP & ETL Data Pipelines",
    "Database Security, Encrypted Storage & Backups",
  ],
};

function buildModuleTitles(subject: string, count: number, progression: string[]): string[] {
  const normSubject = subject.toLowerCase();

  for (const [key, modules] of Object.entries(DOMAIN_MODULE_MAPS)) {
    if (normSubject.includes(key)) {
      if (count <= modules.length) {
        return modules.slice(0, count);
      }
      const extended = [...modules];
      let idx = 1;
      while (extended.length < count) {
        extended.push(`${subject}: Advanced Topic ${idx++}`);
      }
      return extended;
    }
  }

  if (progression?.length >= count) {
    return progression.slice(0, count).map((p) => (p.includes(":") ? p : `${subject}: ${p}`));
  }

  const defaultTemplates = [
    `${subject}: Core Foundations`,
    `${subject}: Key Principles & Notation`,
    `${subject}: Practical Implementations`,
    `${subject}: Applied Case Studies`,
    `${subject}: Advanced Architectures`,
    `${subject}: Industry Best Practices`,
    `${subject}: System Optimization`,
    `${subject}: Capstone Integration`,
  ];

  if (count <= defaultTemplates.length) {
    return defaultTemplates.slice(0, count);
  }

  return Array.from({ length: count }, (_, i) => `${subject}: Module ${i + 1}`);
}

function buildLessonTitles(moduleTitle: string, count: number, startIndex: number): string[] {
  const modClean = moduleTitle.replace(/^[^:]+:\s*/, "").trim();
  const phases = [
    "Concepts & Foundations",
    "Core Mechanics & Analysis",
    "Worked Examples & Implementation",
    "Hands-on Lab Exercise",
    "Optimization & Trade-offs",
    "Industry Case Study",
    "Assessment & Summary",
  ];
  return Array.from({ length: count }, (_, i) => {
    const phase = phases[i % phases.length];
    return `${modClean} — ${phase}`;
  });
}

/** Phase 3: structural blueprint ONLY — no lesson body content. */
export function planCurriculumStructure(
  interview: AICourseArchitectInterview,
  research: CurriculumResearchReport
): ArchitectBlueprint {
  const plan = computeScalePlan(interview);
  const subject = interview.courseInfo.subject || interview.courseInfo.title;
  const moduleTitles = buildModuleTitles(subject, plan.moduleCount, interview.curriculumStrategy.progression);
  const difficultyCurve = buildDifficultyCurve(interview, plan.targetLessons);

  let lessonGlobalIdx = 0;
  const conceptPool = research.conceptMap?.length ? research.conceptMap : [];
  const modules: ArchitectModuleBlueprint[] = moduleTitles.map((title, mi) => {
    const lessonCount = plan.lessonDistribution[mi] ?? plan.lessonsPerModule;
    const lessons: ArchitectLessonBlueprint[] = [];
    for (let li = 0; li < lessonCount; li++) {
      const tier = difficultyCurve[lessonGlobalIdx] ?? "intermediate";
      const conceptTitle = conceptPool[lessonGlobalIdx % conceptPool.length];
      const defaultTitle = buildLessonTitles(title, 1, lessonGlobalIdx)[0];

      let lessonTitle = defaultTitle;
      if (conceptTitle && !conceptTitle.toLowerCase().includes("foundation")) {
        lessonTitle = `${title.replace(/^[^:]+:\s*/, "").trim()} — ${conceptTitle}`;
      }

      lessons.push({
        id: `lesson-${pad2(li + 1)}`,
        title: lessonTitle,
        durationMinutes: tier === "advanced" ? 60 : tier === "beginner" ? 35 : 45,
        difficultyTier: tier,
        introduction: "",
        objectives: [],
        theory: "",
        examples: "",
        summary: "",
        revision: "",
        contentStatus: "planned",
        prerequisites: li > 0 ? [`lesson-${pad2(li)}`] : mi > 0 ? [`module-${pad2(mi)} completion`] : [],
      });
      lessonGlobalIdx++;
    }

    const mod: ArchitectModuleBlueprint = {
      id: `module-${pad2(mi + 1)}`,
      title,
      description: `Module ${mi + 1} of ${plan.moduleCount}: ${title}. ${research.recommendedProgression[mi % research.recommendedProgression.length] ?? ""}`,
      learningOutcomes: [
        `Master key concepts in ${title}`,
        `Apply techniques through guided practice`,
        `Demonstrate competency via assessments`,
      ],
      estimatedHours: Math.max(1, Math.round((plan.estimatedHours * lessonCount) / Math.max(plan.targetLessons, 1))),
      difficultyTier: difficultyCurve[Math.min(Math.max(lessonGlobalIdx - 1, 0), difficultyCurve.length - 1)] ?? "intermediate",
      lessons,
      dependencies: mi > 0 ? [`module-${pad2(mi)}`] : [],
    };

    if (plan.moduleQuizzes && interview.assessmentStrategy.methods.some((m) => /quiz/i.test(m))) {
      mod.moduleQuiz = { title: `${title} Module Assessment`, questions: [] };
    }
    if (plan.projectsTotal > 0 && mi % 2 === 1 && interview.practicalComponents.some((p) => /project/i.test(p))) {
      mod.project = {
        title: `${title} Project`,
        description: `Apply ${title} concepts in a structured project.`,
        instructions: "",
        difficulty: mi < plan.moduleCount / 3 ? "beginner" : mi < (2 * plan.moduleCount) / 3 ? "intermediate" : "advanced",
      };
    }
    return mod;
  });

  const c = interview.courseInfo;
  const distributionNote =
    plan.structureNote ||
    `${plan.targetLessons} lessons distributed across ${plan.moduleCount} modules (${plan.lessonDistribution.join(" · ")}).`;

  return {
    phase: "planned",
    courseTitle: c.title,
    subtitle: c.subtitle || `Professional ${subject} — ${plan.scaleLabel}`,
    description: `${research.courseRationale}\n\n${distributionNote}`,
    category: c.categoryName || c.subject,
    difficulty: capitalize(c.difficulty),
    estimatedDuration: `${plan.estimatedHours} hours`,
    estimatedHours: plan.estimatedHours,
    prerequisites: c.prerequisites.length ? c.prerequisites : research.prerequisites,
    learningOutcomes: c.expectedOutcomes.length ? c.expectedOutcomes : research.learningOutcomes,
    difficultyProgression: formatDifficultySummary(interview, difficultyCurve),
    assessmentPlan: interview.assessmentStrategy.methods.join(", "),
    knowledgeGraph: research.skillDependencyGraph,
    prerequisiteGraph: research.prerequisiteGraph,
    curriculumPlan: plan,
    researchReport: research,
    tracks: [{ id: "track-01", title: c.title, moduleCount: plan.moduleCount, lessonCount: plan.targetLessons }],
    modules,
    capstone: plan.capstone
      ? { title: `${subject} Capstone`, description: `End-to-end ${subject} mastery project.`, instructions: "" }
      : undefined,
    finalExam: plan.finalExam
      ? { title: `${subject} Final Examination`, questions: [] }
      : undefined,
    marketing: {
      seoTitle: `${c.title} | THE GATEHUB`,
      seoDescription: `Master ${subject} with ${plan.targetLessons} lessons — ${plan.scaleLabel}.`,
      tags: [subject, c.industry, c.courseType, plan.scaleLabel],
      highlights: Array.isArray(c.learningGoals) ? c.learningGoals.slice(0, 6) : [],
      bannerPrompt: `Professional course banner for ${c.title}, ${subject}, no text`,
      colorTheme: "deep blue and gold",
    },
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDifficultySummary(interview: AICourseArchitectInterview, curve: DifficultyTier[]): string {
  const b = curve.filter((c) => c === "beginner").length;
  const m = curve.filter((c) => c === "intermediate").length;
  const a = curve.filter((c) => c === "advanced").length;
  const total = curve.length || 1;
  return `${Math.round((b / total) * 100)}% Beginner · ${Math.round((m / total) * 100)}% Intermediate · ${Math.round((a / total) * 100)}% Advanced`;
}

export function getScalePresets() {
  return Object.entries(SCALE_PRESETS).map(([id, p]) => ({
    id,
    label: p.label,
    lessonRange: `${p.lessonMin}–${p.lessonMax} lessons`,
  }));
}
