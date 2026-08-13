import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { 
  BookOpen, 
  Clock, 
  Trophy, 
  TrendingUp, 
  ChevronRight, 
  Lock,
  PlayCircle,
  Layers,
  Brain,
  Video,
  Code,
  FileText,
  MessageSquare,
  CheckCircle2,
  Zap,
  ArrowLeft,
  GraduationCap,
  Briefcase,
  Search,
  Award,
  Play
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api, getPublishedLearningUniverses } from '@/lib/api';
import { useUserStore } from "@/store/userStore";

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .trim();
}

interface LearningTrack {
  id: string;
  title: string;
  description: string;
  progress: number;
  difficulty: string;
  concepts: number;
  hours: number;
  projects: number;
  locked: boolean;
}

const CATEGORY_LEARNING_TRACKS: Record<string, LearningTrack[]> = {
  "artificial-intelligence": [
    {
      id: "ai-foundations",
      title: "AI Foundations",
      description: "Introduction to artificial intelligence",
      progress: 75,
      difficulty: "Beginner",
      concepts: 12,
      hours: 8,
      projects: 2,
      locked: false
    },
    {
      id: "mathematics-ai",
      title: "Mathematics for AI",
      description: "Linear algebra, calculus, statistics, and probability",
      progress: 40,
      difficulty: "Beginner",
      concepts: 18,
      hours: 25,
      projects: 3,
      locked: false
    },
    {
      id: "programming-ai",
      title: "Programming for AI",
      description: "Python, NumPy, Pandas, and PyTorch/TensorFlow",
      progress: 60,
      difficulty: "Beginner",
      concepts: 10,
      hours: 20,
      projects: 2,
      locked: false
    },
    {
      id: "ml",
      title: "Machine Learning",
      description: "Supervised, unsupervised, and reinforcement learning",
      progress: 20,
      difficulty: "Intermediate",
      concepts: 25,
      hours: 30,
      projects: 6,
      locked: false
    },
    {
      id: "dl",
      title: "Deep Learning",
      description: "Neural networks, CNNs, RNNs, and Transformers",
      progress: 0,
      difficulty: "Advanced",
      concepts: 20,
      hours: 35,
      projects: 5,
      locked: true
    },
    {
      id: "nlp",
      title: "Natural Language Processing",
      description: "Text processing, language models, and NLP applications",
      progress: 0,
      difficulty: "Advanced",
      concepts: 18,
      hours: 25,
      projects: 4,
      locked: true
    },
    {
      id: "cv",
      title: "Computer Vision",
      description: "Image classification, object detection, and segmentation",
      progress: 0,
      difficulty: "Advanced",
      concepts: 16,
      hours: 22,
      projects: 4,
      locked: true
    },
    {
      id: "genai",
      title: "Generative AI",
      description: "GANs, VAEs, diffusion models, and LLMs",
      progress: 0,
      difficulty: "Expert",
      concepts: 15,
      hours: 30,
      projects: 5,
      locked: true
    },
    {
      id: "ai-agents",
      title: "AI Agents",
      description: "Autonomous agents, multi-agent systems, and tool use",
      progress: 0,
      difficulty: "Expert",
      concepts: 12,
      hours: 20,
      projects: 3,
      locked: true
    },
    {
      id: "rl",
      title: "Reinforcement Learning",
      description: "Markov decision processes, Q-learning, and policy gradients",
      progress: 0,
      difficulty: "Advanced",
      concepts: 14,
      hours: 24,
      projects: 4,
      locked: true
    },
    {
      id: "mlops",
      title: "MLOps",
      description: "ML engineering, deployment, and monitoring",
      progress: 0,
      difficulty: "Advanced",
      concepts: 12,
      hours: 18,
      projects: 3,
      locked: true
    },
    {
      id: "ai-projects",
      title: "Industry Projects",
      description: "Build production-ready AI applications",
      progress: 0,
      difficulty: "Expert",
      concepts: 10,
      hours: 40,
      projects: 8,
      locked: true
    }
  ],
  "data-structures-algorithms": [
    {
      id: "arrays",
      title: "Arrays & Strings",
      description: "Foundational data structures for coding interviews",
      progress: 100,
      difficulty: "Beginner",
      concepts: 15,
      hours: 12,
      projects: 3,
      locked: false
    },
    {
      id: "linked-lists",
      title: "Linked Lists",
      description: "Singly, doubly, and circular linked lists",
      progress: 80,
      difficulty: "Beginner",
      concepts: 10,
      hours: 8,
      projects: 2,
      locked: false
    },
    {
      id: "stacks-queues",
      title: "Stacks & Queues",
      description: "LIFO and FIFO data structures",
      progress: 60,
      difficulty: "Beginner",
      concepts: 8,
      hours: 6,
      projects: 2,
      locked: false
    },
    {
      id: "trees",
      title: "Trees & BSTs",
      description: "Binary trees, traversals, and balanced BSTs",
      progress: 30,
      difficulty: "Intermediate",
      concepts: 12,
      hours: 10,
      projects: 3,
      locked: false
    },
    {
      id: "graphs",
      title: "Graphs",
      description: "Graph representations, BFS, DFS, and shortest paths",
      progress: 0,
      difficulty: "Intermediate",
      concepts: 15,
      hours: 15,
      projects: 4,
      locked: true
    },
    {
      id: "dynamic-programming",
      title: "Dynamic Programming",
      description: "Memoization, tabulation, and optimization problems",
      progress: 0,
      difficulty: "Advanced",
      concepts: 20,
      hours: 20,
      projects: 5,
      locked: true
    },
    {
      id: "greedy",
      title: "Greedy Algorithms",
      description: "Interval scheduling, Huffman coding, and more",
      progress: 0,
      difficulty: "Intermediate",
      concepts: 10,
      hours: 8,
      projects: 2,
      locked: true
    },
    {
      id: "interview-prep",
      title: "Interview Preparation",
      description: "LeetCode patterns and mock interviews",
      progress: 0,
      difficulty: "Expert",
      concepts: 30,
      hours: 40,
      projects: 6,
      locked: true
    }
  ],
  "software-engineering": [
    {
      id: "python",
      title: "Python",
      description: "Python fundamentals and advanced concepts",
      progress: 90,
      difficulty: "Beginner",
      concepts: 25,
      hours: 20,
      projects: 5,
      locked: false
    },
    {
      id: "java",
      title: "Java",
      description: "Java programming and object-oriented design",
      progress: 50,
      difficulty: "Beginner",
      concepts: 20,
      hours: 25,
      projects: 4,
      locked: false
    },
    {
      id: "cpp",
      title: "C++",
      description: "C++ programming and STL",
      progress: 30,
      difficulty: "Intermediate",
      concepts: 22,
      hours: 30,
      projects: 5,
      locked: false
    },
    {
      id: "javascript",
      title: "JavaScript & TypeScript",
      description: "Modern JS, TypeScript, and asynchronous programming",
      progress: 70,
      difficulty: "Beginner",
      concepts: 20,
      hours: 18,
      projects: 4,
      locked: false
    },
    {
      id: "frontend",
      title: "Frontend Development",
      description: "React, HTML, CSS, and modern frontend tools",
      progress: 40,
      difficulty: "Intermediate",
      concepts: 18,
      hours: 25,
      projects: 5,
      locked: false
    },
    {
      id: "backend",
      title: "Backend Development",
      description: "Node.js, Express, REST APIs, and databases",
      progress: 20,
      difficulty: "Intermediate",
      concepts: 15,
      hours: 22,
      projects: 4,
      locked: false
    },
    {
      id: "apis",
      title: "APIs & Microservices",
      description: "REST, GraphQL, and microservices architecture",
      progress: 0,
      difficulty: "Advanced",
      concepts: 12,
      hours: 18,
      projects: 3,
      locked: true
    },
    {
      id: "databases",
      title: "Databases",
      description: "SQL, NoSQL, and database design",
      progress: 0,
      difficulty: "Intermediate",
      concepts: 14,
      hours: 15,
      projects: 3,
      locked: true
    },
    {
      id: "system-design",
      title: "System Design",
      description: "Distributed systems, scalability, and architecture",
      progress: 0,
      difficulty: "Expert",
      concepts: 18,
      hours: 30,
      projects: 4,
      locked: true
    }
  ],
  "data-science": [
    {
      id: "statistics",
      title: "Statistics",
      description: "Descriptive and inferential statistics",
      progress: 60,
      difficulty: "Beginner",
      concepts: 18,
      hours: 20,
      projects: 3,
      locked: false
    },
    {
      id: "probability",
      title: "Probability",
      description: "Probability distributions and random variables",
      progress: 50,
      difficulty: "Beginner",
      concepts: 15,
      hours: 15,
      projects: 2,
      locked: false
    },
    {
      id: "data-analysis",
      title: "Data Analysis",
      description: "Exploratory data analysis and visualization",
      progress: 40,
      difficulty: "Beginner",
      concepts: 14,
      hours: 18,
      projects: 4,
      locked: false
    },
    {
      id: "pandas-numpy",
      title: "Pandas & NumPy",
      description: "Data manipulation and numerical computing",
      progress: 70,
      difficulty: "Beginner",
      concepts: 12,
      hours: 15,
      projects: 3,
      locked: false
    },
    {
      id: "sql",
      title: "SQL",
      description: "Database querying and SQL fundamentals",
      progress: 80,
      difficulty: "Beginner",
      concepts: 10,
      hours: 12,
      projects: 2,
      locked: false
    },
    {
      id: "data-visualization",
      title: "Data Visualization",
      description: "Matplotlib, Seaborn, and Tableau",
      progress: 30,
      difficulty: "Intermediate",
      concepts: 12,
      hours: 14,
      projects: 3,
      locked: false
    },
    {
      id: "business-analytics",
      title: "Business Analytics",
      description: "Metrics, KPIs, and business intelligence",
      progress: 0,
      difficulty: "Intermediate",
      concepts: 10,
      hours: 12,
      projects: 2,
      locked: true
    }
  ],
  "cloud-devops": [
    {
      id: "aws",
      title: "AWS",
      description: "Amazon Web Services fundamentals",
      progress: 20,
      difficulty: "Intermediate",
      concepts: 15,
      hours: 25,
      projects: 4,
      locked: false
    },
    {
      id: "azure",
      title: "Azure",
      description: "Microsoft Azure cloud services",
      progress: 0,
      difficulty: "Intermediate",
      concepts: 14,
      hours: 22,
      projects: 3,
      locked: true
    },
    {
      id: "gcp",
      title: "GCP",
      description: "Google Cloud Platform",
      progress: 0,
      difficulty: "Intermediate",
      concepts: 13,
      hours: 20,
      projects: 3,
      locked: true
    },
    {
      id: "docker",
      title: "Docker",
      description: "Containerization and Docker Compose",
      progress: 40,
      difficulty: "Intermediate",
      concepts: 10,
      hours: 12,
      projects: 2,
      locked: false
    },
    {
      id: "kubernetes",
      title: "Kubernetes",
      description: "Container orchestration and K8s",
      progress: 0,
      difficulty: "Advanced",
      concepts: 15,
      hours: 20,
      projects: 4,
      locked: true
    },
    {
      id: "ci-cd",
      title: "CI/CD",
      description: "GitHub Actions, Jenkins, and GitLab CI",
      progress: 0,
      difficulty: "Intermediate",
      concepts: 10,
      hours: 15,
      projects: 2,
      locked: true
    },
    {
      id: "monitoring",
      title: "Monitoring & Observability",
      description: "Prometheus, Grafana, and logging",
      progress: 0,
      difficulty: "Advanced",
      concepts: 12,
      hours: 14,
      projects: 3,
      locked: true
    },
    {
      id: "infrastructure",
      title: "Infrastructure as Code",
      description: "Terraform and AWS CloudFormation",
      progress: 0,
      difficulty: "Advanced",
      concepts: 10,
      hours: 16,
      projects: 2,
      locked: true
    }
  ],
  "cybersecurity": [
    {
      id: "networking",
      title: "Networking",
      description: "Network fundamentals and protocols",
      progress: 50,
      difficulty: "Beginner",
      concepts: 15,
      hours: 18,
      projects: 3,
      locked: false
    },
    {
      id: "security-fundamentals",
      title: "Security Fundamentals",
      description: "CIA triad, threats, and vulnerabilities",
      progress: 40,
      difficulty: "Beginner",
      concepts: 12,
      hours: 12,
      projects: 2,
      locked: false
    },
    {
      id: "ethical-hacking",
      title: "Ethical Hacking",
      description: "Penetration testing methodologies",
      progress: 0,
      difficulty: "Intermediate",
      concepts: 18,
      hours: 25,
      projects: 4,
      locked: true
    },
    {
      id: "penetration-testing",
      title: "Penetration Testing",
      description: "Web app, network, and mobile pentesting",
      progress: 0,
      difficulty: "Advanced",
      concepts: 20,
      hours: 30,
      projects: 5,
      locked: true
    },
    {
      id: "cryptography",
      title: "Cryptography",
      description: "Symmetric, asymmetric, and hash functions",
      progress: 0,
      difficulty: "Intermediate",
      concepts: 15,
      hours: 20,
      projects: 3,
      locked: true
    },
    {
      id: "secure-coding",
      title: "Secure Coding",
      description: "OWASP Top 10 and secure development",
      progress: 0,
      difficulty: "Advanced",
      concepts: 14,
      hours: 18,
      projects: 3,
      locked: true
    }
  ],
  "career-preparation": [
    {
      id: "resume-building",
      title: "Resume & LinkedIn",
      description: "Crafting a compelling resume and LinkedIn profile",
      progress: 60,
      difficulty: "Beginner",
      concepts: 8,
      hours: 6,
      projects: 1,
      locked: false
    },
    {
      id: "interview-questions",
      title: "Technical Interview Questions",
      description: "DSA, system design, and behavioral questions",
      progress: 30,
      difficulty: "Intermediate",
      concepts: 25,
      hours: 40,
      projects: 4,
      locked: false
    },
    {
      id: "aptitude",
      title: "Aptitude & Logical Reasoning",
      description: "Quantitative, verbal, and logical reasoning",
      progress: 50,
      difficulty: "Beginner",
      concepts: 20,
      hours: 20,
      projects: 2,
      locked: false
    },
    {
      id: "system-design-interview",
      title: "System Design Interview",
      description: "Designing scalable systems for interviews",
      progress: 0,
      difficulty: "Advanced",
      concepts: 15,
      hours: 25,
      projects: 3,
      locked: true
    },
    {
      id: "mock-interviews",
      title: "Mock Interviews",
      description: "Practice interviews with feedback",
      progress: 0,
      difficulty: "Expert",
      concepts: 10,
      hours: 15,
      projects: 0,
      locked: true
    },
    {
      id: "portfolio",
      title: "Portfolio Building",
      description: "Creating an impressive project portfolio",
      progress: 0,
      difficulty: "Intermediate",
      concepts: 10,
      hours: 15,
      projects: 5,
      locked: true
    }
  ],
  "research-innovation": [
    {
      id: "research-papers",
      title: "Reading Research Papers",
      description: "How to read and understand ML/AI papers",
      progress: 20,
      difficulty: "Advanced",
      concepts: 10,
      hours: 12,
      projects: 2,
      locked: false
    },
    {
      id: "implementing-papers",
      title: "Implementing Papers",
      description: "Reproducing research results from papers",
      progress: 0,
      difficulty: "Expert",
      concepts: 15,
      hours: 30,
      projects: 5,
      locked: true
    },
    {
      id: "open-source",
      title: "Open Source",
      description: "Contributing to open source projects",
      progress: 0,
      difficulty: "Intermediate",
      concepts: 10,
      hours: 18,
      projects: 3,
      locked: true
    },
    {
      id: "emerging-tech",
      title: "Emerging Technologies",
      description: "Quantum computing, AGI, and future trends",
      progress: 0,
      difficulty: "Expert",
      concepts: 12,
      hours: 20,
      projects: 2,
      locked: true
    },
    {
      id: "research-projects",
      title: "Research Projects",
      description: "Conducting research and writing papers",
      progress: 0,
      difficulty: "Expert",
      concepts: 15,
      hours: 40,
      projects: 3,
      locked: true
    }
  ]
};

const DEFAULT_LEARNING_TRACKS: LearningTrack[] = [
  {
    id: "foundations",
    title: "Foundations",
    description: "Introduction to the subject",
    progress: 0,
    difficulty: "Beginner",
    concepts: 10,
    hours: 10,
    projects: 2,
    locked: false
  },
  {
    id: "intermediate",
    title: "Intermediate",
    description: "Intermediate concepts and techniques",
    progress: 0,
    difficulty: "Intermediate",
    concepts: 15,
    hours: 15,
    projects: 3,
    locked: true
  },
  {
    id: "advanced",
    title: "Advanced",
    description: "Advanced topics and applications",
    progress: 0,
    difficulty: "Advanced",
    concepts: 20,
    hours: 25,
    projects: 4,
    locked: true
  },
  {
    id: "projects",
    title: "Projects",
    description: "Build real-world projects",
    progress: 0,
    difficulty: "Expert",
    concepts: 10,
    hours: 30,
    projects: 5,
    locked: true
  }
];

const CONCEPT_STEPS = [
  { id: "learn", title: "Learn", icon: BookOpen, completed: true },
  { id: "watch", title: "Watch", icon: Video, completed: false },
  { id: "practice", title: "Practice", icon: Code, completed: false },
  { id: "quiz", title: "Quiz", icon: Brain, completed: false },
  { id: "build", title: "Build", icon: Layers, completed: false },
  { id: "master", title: "Master", icon: Trophy, completed: false }
];

export function CategoryLearningHub() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const token = useUserStore((s) => s.token);
  const [screen, setScreen] = useState<"universe" | "mission" | "concept">("universe");
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null);
  const [currentConceptStep, setCurrentConceptStep] = useState<string>("learn");
  const [tutorOpen, setTutorOpen] = useState(false);

  const { data: categoryData } = useQuery({
    queryKey: ["category", slug],
    queryFn: async () => {
      try {
        const listRes = await api("/categories") as any;
        if (listRes.data?.categories) {
          const category = listRes.data.categories.find((c: any) => 
            c.slug === slug || slugify(c.name) === slug
          );
          if (category) return category;
        }
        return {
          id: slug,
          name: slug?.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || "Category",
          description: "Master this field with our structured learning path"
        };
      } catch (err: any) {
        return {
          id: slug,
          name: slug?.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || "Category",
          description: "Master this field with our structured learning path"
        };
      }
    }
  });

  // Get published learning universes for this category
  const { data: learningUniversesData, isLoading: learningUniversesLoading } = useQuery({
    queryKey: ["published-learning-universes", slug],
    queryFn: async () => {
      if (!slug) return null;
      return getPublishedLearningUniverses({ categorySlug: slug }) as any;
    },
    enabled: !!slug,
  });

  const { data: luEnrollmentsData } = useQuery({
    queryKey: ["lu-enrollments", "category-hub"],
    queryFn: async () => {
      const res = await api<{ enrollments: any[] }>("/learning-universes/my-enrollments");
      if (res.error) return { enrollments: [] };
      return res.data!;
    },
    enabled: !!token,
  });

  const { data: myLearningData } = useQuery({
    queryKey: ["learning", "my", "category-hub"],
    queryFn: async () => {
      const res = await api<{ items: { type: string; id: string; progressPercent: number; isCompleted: boolean; continueUrl: string }[] }>("/learning/my");
      if (res.error) return { items: [] };
      return res.data!;
    },
    enabled: !!token,
  });

  const luEnrollments = luEnrollmentsData?.enrollments ?? [];
  const learningItems = myLearningData?.items ?? [];

  const getLuEnrollment = (luId: string) =>
    luEnrollments.find((e: any) => e.learningUniverseId === luId || e.learningUniverse?.id === luId);

  const getLuLearningItem = (luId: string) =>
    learningItems.find((i) => i.type === "learning_universe" && i.id === luId);

  // Get category-specific learning tracks or fallback to default
  const learningTracks = CATEGORY_LEARNING_TRACKS[slug || ""] || DEFAULT_LEARNING_TRACKS;

  const publishedUniverses = learningUniversesData?.data || [];
  const hasRealContent = publishedUniverses.length > 0;

  const categoryLuProgress = publishedUniverses.map((lu: any) => {
    const enrollment = getLuEnrollment(lu.id);
    const learningItem = getLuLearningItem(lu.id);
    const progress = enrollment?.progress?.percentComplete ?? learningItem?.progressPercent ?? 0;
    const isEnrolled = !!enrollment;
    const isCompleted = enrollment?.isCompleted || progress === 100;
    const continueUrl = learningItem?.continueUrl ?? `/student/learning-universe/${lu.id}/learn`;
    return { lu, progress, isEnrolled, isCompleted, continueUrl };
  });

  const enrolledInCategory = categoryLuProgress.filter((p: any) => p.isEnrolled);
  const categoryAvgProgress = enrolledInCategory.length
    ? Math.round(enrolledInCategory.reduce((sum: number, p: any) => sum + p.progress, 0) / enrolledInCategory.length)
    : 0;

  // Use real published universes for stats when available
  const totalStats = hasRealContent
    ? {
        concepts: publishedUniverses.length * 5,
        hours: publishedUniverses.length * 10,
        projects: publishedUniverses.length * 2,
        progress: categoryAvgProgress,
      }
    : learningTracks.reduce((acc, track) => ({
        concepts: acc.concepts + track.concepts,
        hours: acc.hours + track.hours,
        projects: acc.projects + track.projects,
        progress: acc.progress + (track.progress / learningTracks.length),
      }), { concepts: 0, hours: 0, projects: 0, progress: 0 });

  const renderLearningUniverse = () => (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="app-workspace w-full max-w-none px-4 py-8">
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary border border-border text-sm font-semibold mb-4">
            <Zap className="w-4 h-4 text-primary" />
            Learning Universe
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4">
            {categoryData?.name || "Category"}
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-8">
            {categoryData?.description || "Master this field with our structured learning path"}
          </p>
          
          <div className="flex flex-wrap justify-center gap-8 mb-12">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-1">{totalStats.hours}+</div>
              <div className="text-sm text-muted-foreground">Hours</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-1">{totalStats.projects}+</div>
              <div className="text-sm text-muted-foreground">Projects</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-1">{totalStats.concepts}+</div>
              <div className="text-sm text-muted-foreground">Concepts</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-1">{Math.round(totalStats.progress)}%</div>
              <div className="text-sm text-muted-foreground">Complete</div>
            </div>
          </div>
        </div>

        {/* Published Learning Universes Section */}
        {(learningUniversesData as any)?.data && (learningUniversesData as any).data.length > 0 && (
          <div className="mb-16">
            <h2 className="text-2xl font-bold mb-8 text-foreground">Published Learning Universes</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {categoryLuProgress.map(({ lu, progress, isEnrolled, isCompleted, continueUrl }: any) => (
                <Card key={lu.id} className="p-6 border border-border hover:border-primary/40 transition-all duration-300 hover:-translate-y-1">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-xl font-bold text-foreground">{lu.title}</h3>
                    {isEnrolled && isCompleted && (
                      <span className="bg-green-500/20 text-green-500 border border-green-500/30 px-2 py-0.5 rounded-full text-xs font-bold shrink-0">
                        <Award className="w-3 h-3 inline mr-1" />
                        Done
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">{lu.description}</p>
                  {lu.categoryRel && (
                    <div className="mb-4">
                      <span className="inline-block px-3 py-1 bg-secondary rounded-full text-xs font-medium text-foreground">
                        {lu.categoryRel.name}
                      </span>
                    </div>
                  )}
                  <span className="inline-block px-3 py-1 bg-primary/10 rounded-full text-xs font-medium text-primary mb-4">
                    {lu.difficulty}
                  </span>
                  {isEnrolled && (
                    <div className="mb-4 space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span className="font-semibold">{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  )}
                  <Button
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                    onClick={() => navigate(isEnrolled ? continueUrl : `/learning-universe/${lu.id}/course`)}
                  >
                    {isEnrolled ? (
                      isCompleted ? (
                        <>Review Content<ChevronRight className="w-4 h-4" /></>
                      ) : (
                        <><Play className="w-4 h-4" />Continue Learning<ChevronRight className="w-4 h-4" /></>
                      )
                    ) : (
                      <>Start Learning<ChevronRight className="w-4 h-4" /></>
                    )}
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        )}

        {!hasRealContent && (
        <div className="relative">
          <div className="absolute left-1/2 transform -translate-x-1/2 top-0 bottom-0 w-1 bg-gradient-to-b from-primary to-muted"></div>
          <div className="space-y-8">
            {learningTracks.map((track, index) => (
              <div key={track.id} className="flex items-center gap-6">
                <div className="w-8 h-8 rounded-full flex items-center justify-center z-10 shrink-0 border-4 bg-background"
                  style={{
                    borderColor: track.locked ? "hsl(var(--border))" : "hsl(var(--primary))"
                  }}
                >
                  {track.locked ? (
                    <Lock className="w-3 h-3 text-muted-foreground" />
                  ) : track.progress === 100 ? (
                    <CheckCircle2 className="w-3 h-3 text-green-600" />
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-primary"></div>
                  )}
                </div>
                <Card
                  className={`flex-1 cursor-pointer transition-all hover:shadow-lg hover:border-primary/40 ${
                    track.locked ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                  onClick={() => {
                    if (!track.locked) {
                      navigate("/student/browse");
                    }
                  }}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-bold">{track.title}</h3>
                          <span className="px-2 py-0.5 text-xs rounded-full bg-secondary text-muted-foreground">
                            {track.difficulty}
                          </span>
                        </div>
                        <p className="text-muted-foreground mb-4">{track.description}</p>
                        <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <BookOpen className="w-4 h-4" />
                            {track.concepts} concepts
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {track.hours} hours
                          </div>
                          <div className="flex items-center gap-1">
                            <Layers className="w-4 h-4" />
                            {track.projects} projects
                          </div>
                        </div>
                      </div>
                      <div className="w-32">
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="font-semibold">{track.progress}%</span>
                        </div>
                        <Progress value={track.progress} className="h-2" />
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </div>
        )}
      </div>
    </div>
  );

  const renderMissionPage = () => {
    const track = learningTracks.find(t => t.id === selectedTrack);
    if (!track) return null;

    return (
      <div className="min-h-screen bg-background text-foreground pb-20">
        <div className="app-workspace w-full max-w-none px-4 py-8">
          <Button
            variant="ghost"
            className="mb-8"
            onClick={() => setScreen("universe")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Learning Universe
          </Button>

          <div className="w-full min-w-0">
            <div className="mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary border border-border text-sm font-semibold mb-4">
                <GraduationCap className="w-4 h-4 text-primary" />
                Mission
              </div>
              <h1 className="text-4xl md:text-5xl font-bold mb-4">{track.title}</h1>
              <p className="text-lg text-muted-foreground mb-8">{track.description}</p>

              <div className="grid md:grid-cols-4 gap-6 mb-12">
                <Card className="p-4 text-center">
                  <div className="text-3xl font-bold text-primary mb-1">{track.hours}</div>
                  <div className="text-sm text-muted-foreground">Hours</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-3xl font-bold text-primary mb-1">{track.concepts}</div>
                  <div className="text-sm text-muted-foreground">Concepts</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-3xl font-bold text-primary mb-1">{track.projects}</div>
                  <div className="text-sm text-muted-foreground">Projects</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-3xl font-bold text-primary mb-1">{track.difficulty}</div>
                  <div className="text-sm text-muted-foreground">Difficulty</div>
                </Card>
              </div>

              <Card className="p-8 mb-8 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                <h3 className="text-xl font-bold mb-4">What You'll Learn</h3>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    <span>Foundational concepts and theories</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    <span>Hands-on coding and implementation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    <span>Real-world projects and applications</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    <span>Interview preparation and career readiness</span>
                  </li>
                </ul>
              </Card>

              <div className="flex justify-center">
                <Button
                  size="lg"
                  className="px-12 py-6 text-lg"
                  onClick={() => {
                    setSelectedConcept("example-concept");
                    setScreen("concept");
                  }}
                >
                  Start Mission
                  <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderConceptJourney = () => (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="app-workspace w-full max-w-none px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => setScreen("mission")}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Linear Regression</h1>
              <p className="text-sm text-muted-foreground">Your journey to mastery</p>
            </div>
          </div>
        </div>

        <div className="mb-12">
          <div className="flex items-center justify-between w-full min-w-0">
            {CONCEPT_STEPS.map((step, index) => {
              const isActive = step.id === currentConceptStep;
              const isCompleted = CONCEPT_STEPS.findIndex(s => s.id === currentConceptStep) > index;
              const Icon = step.icon;
              return (
                <div key={step.id} className="flex flex-col items-center">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all cursor-pointer ${
                      isActive
                        ? "bg-primary border-primary text-primary-foreground shadow-lg"
                        : isCompleted
                        ? "bg-green-100 border-green-600 text-green-600"
                        : "bg-muted border-border text-muted-foreground"
                    }`}
                    onClick={() => {
                      const canClick = isCompleted || step.id === CONCEPT_STEPS[CONCEPT_STEPS.findIndex(s => s.id === currentConceptStep) + 1]?.id || step.id === currentConceptStep;
                      if (canClick) {
                        setCurrentConceptStep(step.id);
                      }
                    }}
                  >
                    {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <div className={`text-sm font-semibold mt-2 ${
                    isActive ? "text-primary" : isCompleted ? "text-green-600" : "text-muted-foreground"
                  }`}>
                    {step.title}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="w-full min-w-0 mt-2">
            <div className="h-1 bg-muted relative">
              <div
                className="absolute left-0 top-0 h-full bg-primary transition-all"
                style={{
                  width: `${(CONCEPT_STEPS.findIndex(s => s.id === currentConceptStep) / (CONCEPT_STEPS.length - 1)) * 100}%`
                }}
              ></div>
            </div>
          </div>
        </div>

        <div className="w-full min-w-0">
          {currentConceptStep === "learn" && (
            <div className="space-y-6">
              <h2 className="text-3xl font-bold mb-6">Learn</h2>
              <Card className="p-6">
                <h3 className="text-xl font-bold mb-4">Introduction</h3>
                <p className="text-muted-foreground mb-4">
                  Linear regression is a fundamental machine learning algorithm used for predicting continuous values.
                  It models the relationship between a dependent variable and one or more independent variables.
                </p>
              </Card>
              <Card className="p-6">
                <h3 className="text-xl font-bold mb-4">History</h3>
                <p className="text-muted-foreground mb-4">
                  The method was first introduced by Legendre in 1805 and later by Gauss in 1809.
                  It has since become one of the most widely used algorithms in statistics and machine learning.
                </p>
              </Card>
              <Card className="p-6">
                <h3 className="text-xl font-bold mb-4">Intuition</h3>
                <p className="text-muted-foreground mb-4">
                  Imagine trying to fit a straight line through a scatter plot of data points.
                  Linear regression finds the line that minimizes the distance between the line and all the points.
                </p>
              </Card>
              <div className="flex justify-end mt-8">
                <Button onClick={() => setCurrentConceptStep("watch")}>
                  Next: Watch
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {currentConceptStep === "watch" && (
            <div className="space-y-6">
              <h2 className="text-3xl font-bold mb-6">Watch</h2>
              <Card className="p-6">
                <div className="aspect-video bg-muted rounded-lg flex items-center justify-center mb-6">
                  <div className="text-center">
                    <Video className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">Andrew Ng - Linear Regression (25 min)</p>
                  </div>
                </div>
                <h3 className="text-xl font-bold mb-4">Key Takeaways</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <div className="mt-1 w-1.5 h-1.5 rounded-full bg-primary"></div>
                    Understand the mathematical formulation
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="mt-1 w-1.5 h-1.5 rounded-full bg-primary"></div>
                    Learn how gradient descent works
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="mt-1 w-1.5 h-1.5 rounded-full bg-primary"></div>
                    Feature scaling and normalization
                  </li>
                </ul>
              </Card>
              <div className="flex justify-between mt-8">
                <Button variant="ghost" onClick={() => setCurrentConceptStep("learn")}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Previous
                </Button>
                <Button onClick={() => setCurrentConceptStep("practice")}>
                  Next: Practice
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {currentConceptStep === "practice" && (
            <div className="space-y-6">
              <h2 className="text-3xl font-bold mb-6">Practice</h2>
              <Card className="p-6">
                <h3 className="text-xl font-bold mb-4">Exercise 1: Implement Gradient Descent</h3>
                <p className="text-muted-foreground mb-4">Write a Python function that performs gradient descent for linear regression.</p>
                <Button>Start Exercise</Button>
              </Card>
              <Card className="p-6">
                <h3 className="text-xl font-bold mb-4">Exercise 2: Boston House Prices</h3>
                <p className="text-muted-foreground mb-4">Apply linear regression to predict house prices using the Boston dataset.</p>
                <Button>Start Exercise</Button>
              </Card>
              <div className="flex justify-between mt-8">
                <Button variant="ghost" onClick={() => setCurrentConceptStep("watch")}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Previous
                </Button>
                <Button onClick={() => setCurrentConceptStep("quiz")}>
                  Next: Quiz
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {currentConceptStep === "quiz" && (
            <div className="space-y-6">
              <h2 className="text-3xl font-bold mb-6">Quiz</h2>
              <Card className="p-6 text-center">
                <Brain className="w-16 h-16 text-primary mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Linear Regression Fundamentals</h3>
                <p className="text-muted-foreground mb-6">Test your knowledge with 10 questions</p>
                <Button className="bg-primary hover:bg-primary/90" size="lg">
                  Start Quiz
                </Button>
              </Card>
              <div className="flex justify-between mt-8">
                <Button variant="ghost" onClick={() => setCurrentConceptStep("practice")}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Previous
                </Button>
                <Button onClick={() => setCurrentConceptStep("build")}>
                  Next: Build
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {currentConceptStep === "build" && (
            <div className="space-y-6">
              <h2 className="text-3xl font-bold mb-6">Build</h2>
              <Card className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                    <Layers className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-2">Beginner: Predict House Prices</h3>
                    <p className="text-muted-foreground mb-4">Build a model to predict house prices using linear regression</p>
                    <div className="flex items-center gap-2 mb-4">
                      <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Beginner</span>
                      <span className="text-xs text-muted-foreground">~2 hours</span>
                    </div>
                    <Button>Start Project</Button>
                  </div>
                </div>
              </Card>
              <div className="flex justify-between mt-8">
                <Button variant="ghost" onClick={() => setCurrentConceptStep("quiz")}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Previous
                </Button>
                <Button onClick={() => setCurrentConceptStep("master")}>
                  Next: Master
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {currentConceptStep === "master" && (
            <div className="space-y-6">
              <h2 className="text-3xl font-bold mb-6">Master</h2>
              <Card className="p-8 text-center">
                <Trophy className="w-20 h-20 text-primary mx-auto mb-6" />
                <h3 className="text-2xl font-bold mb-4">Congratulations!</h3>
                <p className="text-muted-foreground mb-8">You've completed the Linear Regression journey</p>
                <div className="grid md:grid-cols-4 gap-4 mb-8">
                  <div className="p-4 bg-secondary rounded-lg">
                    <div className="text-2xl font-bold text-primary">95%</div>
                    <div className="text-sm text-muted-foreground">Concept Score</div>
                  </div>
                  <div className="p-4 bg-secondary rounded-lg">
                    <div className="text-2xl font-bold text-primary">85%</div>
                    <div className="text-sm text-muted-foreground">Quiz Score</div>
                  </div>
                  <div className="p-4 bg-secondary rounded-lg">
                    <div className="text-2xl font-bold text-primary">100%</div>
                    <div className="text-sm text-muted-foreground">Project Score</div>
                  </div>
                  <div className="p-4 bg-secondary rounded-lg">
                    <div className="text-2xl font-bold text-primary">93%</div>
                    <div className="text-sm text-muted-foreground">Mastery</div>
                  </div>
                </div>
                <Button size="lg">
                  Claim Certificate Badge
                </Button>
              </Card>
              <div className="flex justify-center mt-8">
                <Button variant="ghost" onClick={() => setCurrentConceptStep("build")}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Previous
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative">
      {renderLearningUniverse()}
    </div>
  );
}
