
import { renderCourseDocument } from "./src/services/luProject/luCourseRenderer.js";
import { blueprintToCourseDocument } from "./src/services/luProject/luBlueprintNormalizer.js";
import { compileLatexLocally } from "./src/services/latexCompileService.js";
import type { ArchitectBlueprint, AICourseArchitectInterview } from "./src/services/aiCourseArchitect/types.js";
import type { LuCourseDocument } from "./src/services/luProject/luCourseContentSchema.js";
import type { LuProjectFileEntry } from "./src/services/luProject/luProjectFileEmitter.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { prisma } from "./src/utils/prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testFullAppCompilation() {
  console.log("🧪 Starting full app compilation test...");

  // 1. Create test course content
  const testBlueprint: ArchitectBlueprint = {
    courseTitle: "Full App Compilation Test",
    subtitle: "Complete End-to-End Test",
    description: "This course tests the entire compilation pipeline",
    difficulty: "Beginner",
    estimatedHours: 4,
    category: "Programming",
    modules: [
      {
        id: "module-01",
        title: "Test Module 1",
        description: "Module for testing compilation",
        lessons: [
          {
            id: "lesson-01",
            title: "Lesson 1: Introduction",
            durationMinutes: 45,
            overview: "Welcome to this lesson about programming basics. This is a comprehensive overview that covers all the key concepts you need to know.",
            objectives: ["Understand basic variables", "Learn about data types", "Write simple functions", "Debug basic errors"],
            realWorldAnalogy: "Think of variables like labeled boxes that hold different items. Each box has a type that tells you what kind of item it can hold.",
            theory: "Variables are the fundamental building blocks of programming. They allow us to store and manipulate data in our programs. Every programming language has its own way of declaring and using variables.",
            conceptExplanation: "1. Variables: Containers for storing data\n2. Data Types: Defines the kind of data (numbers, strings, booleans)\n3. Functions: Reusable blocks of code that perform a specific task\n4. Comments: Notes for developers that are ignored by the compiler",
            examples: "Example 1: Declaring variables\n```javascript\nlet name = 'John';\nlet age = 30;\nlet isStudent = true;\n```\n\nExample 2: A simple function\n```javascript\nfunction greet(name) {\n  return 'Hello, ' + name + '!';\n}\n```",
            commonMistakes: ["Forgetting to declare variables before using them", "Using the wrong data type for a value", "Misspelling variable names", "Forgetting semicolons (in languages that require them)"],
            bestPractices: ["Use descriptive variable names", "Comment your code to explain why, not what", "Keep functions small and focused on one task", "Test your code frequently"],
            industryNotes: "All professional developers follow these practices. They help make code more maintainable and easier to understand for other developers.",
            summary: "In this lesson, we covered the basic building blocks of programming: variables, data types, functions, and comments. We also learned about common mistakes to avoid and best practices to follow.",
            keyTakeaways: ["Variables store data", "Data types define what kind of data a variable can hold", "Functions are reusable blocks of code", "Good coding practices make code maintainable"],
            references: [
              { citation: "The Pragmatic Programmer by David Thomas and Andrew Hunt" },
              { citation: "Clean Code by Robert C. Martin" },
              { citation: "JavaScript: The Good Parts by Douglas Crockford" },
              { citation: "Eloquent JavaScript by Marijn Haverbeke" },
              { citation: "You Don't Know JS by Kyle Simpson" }
            ]
          }
        ]
      }
    ],
    marketing: { tags: ["test", "compilation"] }
  };

  const testInterview: AICourseArchitectInterview = {
    courseInfo: { title: "Full App Compilation Test", subject: "Programming" },
    courseScale: { id: "standard" },
    difficultyDistribution: { mode: "ai-decides" },
    learningStyle: ["balanced"],
    teachingStyle: ["professional"],
    lessonStructure: [],
    practicalComponents: [],
    assessmentStrategy: { style: "Quiz after every module", methods: [] },
    curriculumStrategy: { progression: ["beginner-intermediate-advanced"], aiDecidesCurriculum: true },
    learningComponents: [],
    videoStrategy: { includeVideos: false, method: "add-later", placement: "ai-auto", mappings: [] }
  };

  console.log("📄 Rendering course files...");
  const courseDoc: LuCourseDocument = blueprintToCourseDocument(testBlueprint, testInterview);
  const renderResult = renderCourseDocument(courseDoc);

  // 2. Write test project to DB (using prisma directly)
  console.log("💾 Writing project to DB...");
  const project = await prisma.project.create({
    data: {
      title: "Full App Compilation Test",
      type: "learning-universe",
      visibility: "private",
      status: "active"
    }
  });
  const projectId = project.id;
  console.log("✅ Project created in DB with ID:", projectId);

  // 3. Write all files to the project's latexFiles table
  console.log("📝 Writing project files...");
  for (const file of renderResult.files) {
    await prisma.latexFile.create({
      data: {
        projectId,
        path: file.path,
        name: file.name,
        isFolder: file.isFolder,
        content: file.isFolder ? null : file.content
      }
    });
    console.log(`   ✅ ${file.path}`);
  }

  // 4. Write project.json
  const projectJsonContent = JSON.stringify(renderResult.project, null, 2);
  await prisma.latexFile.create({
    data: {
      projectId,
      path: "/project.json",
      name: "project.json",
      isFolder: false,
      content: projectJsonContent
    }
  });
  console.log("   ✅ /project.json");

  // 3. Compile the project using compileLatexLocally!
  console.log("🏗️ Compiling project...");
  const compileResult = await compileLatexLocally(projectId, "main.tex", {
    maxPasses: 2,
    copyReferencedImages: false,
    enableBibtex: false,
    timeoutMs: 300000
  });

  console.log("\n� Compilation result:");
  console.log("Success?", compileResult.success);
  console.log("Compiler used:", compileResult.compilerUsed);
  console.log("Compilation time:", compileResult.compilationTime, "ms");

  if (compileResult.success) {
    console.log("\n🎉 SUCCESS! PDF created at:", compileResult.pdfPath);
    const stat = fs.statSync(compileResult.pdfPath!);
    console.log("   PDF size:", stat.size, "bytes");
    console.log("   Last modified:", stat.mtime);
  } else {
    console.error("\n❌ Compilation failed!");
    console.error("Errors:", compileResult.errors);
    console.log("\n=== Compilation logs ===");
    console.log(compileResult.logs);
  }

  console.log("\n✅ Test complete!");
}

testFullAppCompilation();
