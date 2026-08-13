import { emitLearningUniverseDsl } from "./src/services/learningUniverseDslEmitter.js";
import { parseLearningUniverseLatex } from "./src/controllers/learning-universe-parser.js";
import { publishLearningUniverse } from "./src/controllers/learning-universe-controller.js";
import type { LearningUniverseStructured } from "./src/services/learningUniverseSchema.js";
import { prisma } from "./src/utils/prisma.js";

const structured: LearningUniverseStructured = {
  universe: {
    title: "AI & Machine Learning Engineering",
    description: "Master modern AI, deep learning, neural networks, and LLM engineering from university-level theory to production deployment.",
    difficulty: "Intermediate",
    estimatedHours: 40,
    skills: ["Artificial Intelligence", "Machine Learning", "Python", "Neural Networks"],
  },
  authoringMode: "visual",
  tracks: [
    {
      title: "Foundations of Artificial Intelligence",
      description: "Core principles, mathematical foundations, and modern AI paradigms.",
      modules: [
        {
          title: "Introduction & Scope of AI",
          description: "Understanding intelligent agents, problem domains, and historical context.",
          lessons: [
            {
              title: "What is Artificial Intelligence?",
              overviewMarkdown: "Artificial Intelligence represents the frontier of computer science, blending mathematics, computer systems, and cognitive modeling to build autonomous problem-solving systems.",
              contentBlocks: [
                {
                  type: "theory",
                  content: {
                    title: "Learning Objectives",
                    body: "By the end of this lesson, you will be able to:\n- Differentiate between Artificial Intelligence, Machine Learning, and Deep Learning.\n- Classify intelligent agents based on environment observability and autonomy.\n- Formulate search problems using state spaces and transition functions.",
                  },
                },
                {
                  type: "theory",
                  content: {
                    title: "Real-World Analogy",
                    body: "Think of Artificial Intelligence like an experienced pilot navigating through turbulence. Rather than following rigid pre-programmed rules, the pilot perceives environmental sensors, predicts future trajectories, and adapts controls dynamically to reach the destination safely.",
                  },
                },
                {
                  type: "theory",
                  content: {
                    title: "Core Theory & Formal Definition",
                    body: "An Intelligent Agent is formally modeled as a mapping function f: P* -> A from percept sequences to actions. In deterministic environments, optimal decision-making simplifies to utility maximization: max E[U(s') | a, s].",
                  },
                },
                {
                  type: "theory",
                  content: {
                    title: "Further Reading & Academic References",
                    body: "1. Russell, S., & Norvig, P. (2020). Artificial Intelligence: A Modern Approach (4th ed.). Pearson.\n2. MIT OpenCourseWare: 6.034 Artificial Intelligence (https://ocw.mit.edu/courses/6-034-artificial-intelligence-fall-2010/)\n3. Stanford CS221: Artificial Intelligence Principles and Techniques (https://stanford.edu/~shervine/teaching/cs-221/)",
                  },
                },
              ],
              videos: [],
              resources: [],
            },
          ],
        },
      ],
    },
  ],
};

async function main() {
  console.log("Publishing AI & Machine Learning Engineering course...");
  const dsl = emitLearningUniverseDsl(structured);
  const parsed = parseLearningUniverseLatex(dsl);

  const instructor =
    (await prisma.user.findFirst({ where: { role: "instructor" } })) ||
    (await prisma.user.findFirst());
  if (!instructor) throw new Error("No instructor user found in database");

  const published = await publishLearningUniverse(dsl, instructor.id, [], { parsed });
  console.log("SUCCESSFULLY PUBLISHED AI COURSE!");
  console.log("Published ID:", published.id);
  console.log("Course Title:", published.title);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
