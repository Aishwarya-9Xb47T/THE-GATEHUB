import type { LearningUniverseStructured } from "@/lib/learningUniverseSchema";
import { createEmptyLesson } from "@/lib/learningUniverseSchema";

function lessonWithBlocks(title: string, blocks: ReturnType<typeof createEmptyLesson>["contentBlocks"], overview = "") {
  const lesson = createEmptyLesson(title);
  lesson.overviewMarkdown = overview;
  lesson.contentBlocks = blocks;
  return lesson;
}

export const COURSE_TEMPLATES: Record<string, { label: string; data: LearningUniverseStructured }> = {
  programming: {
    label: "Programming Course",
    data: {
      universe: { title: "Programming Fundamentals", description: "Learn to code from scratch", difficulty: "Beginner", estimatedHours: 20, skills: ["Python", "Problem Solving"] },
      tracks: [{
        title: "Programming Track", description: "Core programming concepts", difficulty: "Beginner",
        modules: [{
          title: "Getting Started", description: "Variables, loops, functions", estimatedHours: 10,
          lessons: [
            lessonWithBlocks("Variables and Output", [
              { type: "theory", content: { title: "Variables", body: "Variables store data values." } },
              { type: "practice", content: { title: "Hello World", language: "python", initialCode: 'print("Hello")', expectedOutput: "Hello", solution: 'print("Hello")' } },
              { type: "quiz", content: { title: "Basics Quiz", questions: [{ text: "Which keyword prints output?", type: "single", options: [{ text: "print", isCorrect: true }, { text: "echo", isCorrect: false }], explanation: "Python uses print()" }] } },
            ], "Introduction to programming"),
          ],
        }],
      }],
      authoringMode: "visual",
    },
  },
  ai: {
    label: "AI Course",
    data: {
      universe: { title: "AI & Machine Learning", description: "From basics to neural networks", difficulty: "Intermediate", estimatedHours: 40, skills: ["ML", "Python", "TensorFlow"] },
      tracks: [{ title: "AI Track", description: "ML foundations", modules: [{ title: "ML Basics", description: "Supervised learning", lessons: [lessonWithBlocks("Intro to ML", [{ type: "theory", content: { title: "What is ML?", body: "Machine learning learns patterns from data." } }, { type: "video", content: { type: "youtube", url: "https://www.youtube.com/watch?v=ukzFI9rgwfU", title: "ML Intro" } }])] }] }],
      authoringMode: "visual",
    },
  },
  networking: {
    label: "Networking Course",
    data: {
      universe: { title: "Computer Networking", description: "TCP/IP, DNS, HTTP, security", difficulty: "Intermediate", estimatedHours: 30, skills: ["TCP/IP", "DNS", "HTTP"] },
      tracks: [{ title: "Networking", description: "Protocols and layers", modules: [{ title: "Fundamentals", description: "OSI and TCP/IP", lessons: [lessonWithBlocks("OSI Model", [{ type: "theory", content: { title: "Seven Layers", body: "Physical, Data Link, Network, Transport, Session, Presentation, Application" } }, { type: "keypoints", content: { text: "Layers, Protocols, Packets" } }])] }] }],
      authoringMode: "visual",
    },
  },
  cybersecurity: {
    label: "Cybersecurity Course",
    data: { universe: { title: "Cybersecurity Essentials", description: "Threats, defense, encryption", difficulty: "Intermediate", estimatedHours: 25, skills: ["Security", "Encryption"] }, tracks: [{ title: "Security Track", description: "", modules: [{ title: "Threats", description: "", lessons: [lessonWithBlocks("Common Threats", [{ type: "warning", content: { text: "Never share passwords." } }, { type: "theory", content: { title: "Threats", body: "Malware, phishing, DDoS" } }])] }] }], authoringMode: "visual" },
  },
  datascience: {
    label: "Data Science Course",
    data: { universe: { title: "Data Science", description: "Pandas, visualization, statistics", difficulty: "Intermediate", estimatedHours: 35, skills: ["Pandas", "Statistics"] }, tracks: [{ title: "Data Track", description: "", modules: [{ title: "Analysis", description: "", lessons: [lessonWithBlocks("DataFrames", [{ type: "codeexample", content: { language: "python", code: "import pandas as pd\ndf = pd.DataFrame({'a':[1,2]})\nprint(df)", output: "   a\n0  1\n1  2" } }])] }] }], authoringMode: "visual" },
  },
  mathematics: {
    label: "Mathematics Course",
    data: { universe: { title: "Mathematics", description: "Algebra and calculus", difficulty: "Beginner", estimatedHours: 30, skills: ["Algebra", "Calculus"] }, tracks: [{ title: "Math Track", description: "", modules: [{ title: "Algebra", description: "", lessons: [lessonWithBlocks("Equations", [{ type: "theory", content: { title: "Linear Equations", body: "y = mx + b" } }])] }] }], authoringMode: "visual" },
  },
};
