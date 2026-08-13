
import { renderCourseDocument } from "./src/services/luProject/luCourseRenderer.js";
import { blueprintToCourseDocument } from "./src/services/luProject/luBlueprintNormalizer.js";
import type { ArchitectBlueprint, AICourseArchitectInterview } from "./src/services/aiCourseArchitect/types.js";
import type { LuCourseDocument } from "./src/services/luProject/luCourseContentSchema.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testTempDir = path.join(__dirname, "full-test-temp");

async function runFullPipeline() {
  console.log("=== STARTING FULL COMPILE PIPELINE TEST ===\n");

  // Step 1: Clean and create temp dir
  console.log("Step 1: Cleaning and creating temp directory...");
  if (fs.existsSync(testTempDir)) fs.rmSync(testTempDir, { recursive: true });
  fs.mkdirSync(testTempDir, { recursive: true });
  console.log("✅ Temp directory created at", testTempDir, "\n");

  // Step 2: Create test blueprint and interview
  console.log("Step 2: Creating test course data...");
  const testBlueprint: ArchitectBlueprint = {
    courseTitle: "Final Compilation Test Course",
    subtitle: "End-to-end pipeline test",
    description: "This is the ultimate test of our fixes!",
    difficulty: "Beginner",
    estimatedHours: 4,
    category: "Programming",
    modules: [
      {
        id: "module-01",
        title: "Test Module 1",
        description: "Module Description",
        lessons: [
          {
            id: "lesson-01",
            title: "Lesson 1: The Basics",
            durationMinutes: 45,
            overview: "Welcome to this lesson about programming basics.",
            objectives: [
              "Learn what a variable is",
              "Understand basic data types",
              "Write your first function"
            ],
            realWorldAnalogy: "Think of variables like containers that hold things.",
            theory: "Variables are the building blocks of programming.",
            conceptExplanation: "1. Variables store data.\n2. Data types tell the program what kind of data it is.",
            examples: "Example 1: Variables in action\nExample 2: Working with data types",
            commonMistakes: [
              "Forgetting to declare variables",
              "Using the wrong data type"
            ],
            bestPractices: [
              "Use descriptive variable names",
              "Comment your code"
            ],
            industryNotes: "Professional developers follow these practices every day.",
            summary: "You've learned the basics of variables and data types!",
            keyTakeaways: [
              "Variables are containers",
              "Data types matter"
            ],
            references: [
              { citation: "The Pragmatic Programmer" },
              { citation: "Clean Code" }
            ]
          }
        ]
      }
    ],
    marketing: { tags: ["test", "full-pipeline"] }
  };
  const testInterview: AICourseArchitectInterview = {
    courseInfo: { title: "Final Compilation Test Course", subject: "Programming" },
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
  console.log("✅ Test course data created\n");

  // Step 3: Render course files
  console.log("Step 3: Rendering course files...");
  const courseDoc: LuCourseDocument = blueprintToCourseDocument(testBlueprint, testInterview);
  const renderResult = renderCourseDocument(courseDoc);
  
  console.log("\nGenerated and writing files to disk:");
  for (const file of renderResult.files) {
    const filePath = file.path.replace(/^\//, "");
    const diskPath = path.join(testTempDir, filePath);
    if (file.isFolder) {
      fs.mkdirSync(diskPath, { recursive: true });
    } else {
      const dir = path.dirname(diskPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(diskPath, file.content, "utf8");
      console.log(`   - ${file.path}`);
    }
  }
  console.log("✅ All course files written\n");

  // Step 4: Dump the directory tree to see everything
  console.log("Step 4: Directory tree:");
  const dumpTree = (dir: string, indent: string) => {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      const relPath = path.relative(testTempDir, fullPath);
      if (file.isDirectory()) {
        console.log(`${indent}📁 ${relPath}/`);
        dumpTree(fullPath, indent + "   ");
      } else {
        console.log(`${indent}📄 ${relPath}`);
      }
    }
  };
  dumpTree(testTempDir, "");

  // Step 5: Show content of the key files
  console.log("\nStep 5: Key file contents:");
  const keyFiles = [
    "main.tex",
    "metadata.tex",
    "track-01/track.tex",
    "track-01/module-01/module.tex",
    "track-01/module-01/lesson-01.tex"
  ];
  for (const keyFile of keyFiles) {
    const fullPath = path.join(testTempDir, keyFile);
    console.log(`\n--- ${keyFile} ---`);
    console.log(fs.readFileSync(fullPath, "utf8"));
  }

  // Step 6: Run pdflatex!
  console.log("\nStep 6: Running pdflatex in", testTempDir);
  const pdflatex = spawn("pdflatex", [
    "-interaction=nonstopmode",
    "-halt-on-error",
    "-file-line-error",
    "main.tex"
  ], {
    cwd: testTempDir,
    shell: true
  });

  let stdout = "";
  let stderr = "";

  pdflatex.stdout.on("data", (data) => {
    const s = data.toString();
    stdout += s;
    process.stdout.write(s);
  });

  pdflatex.stderr.on("data", (data) => {
    const s = data.toString();
    stderr += s;
    process.stderr.write(s);
  });

  pdflatex.on("close", (code) => {
    console.log("\n=== pdflatex exited with code", code, "===");

    // Check if PDF exists
    const pdfPath = path.join(testTempDir, "main.pdf");
    if (fs.existsSync(pdfPath)) {
      const stat = fs.statSync(pdfPath);
      console.log("\n🎉🎉🎉 PDF GENERATED SUCCESSFULLY! 🎉🎉🎉");
      console.log(`   PDF Path: ${pdfPath}`);
      console.log(`   Size: ${stat.size} bytes`);
      console.log(`   Last modified: ${stat.mtime}`);
    } else {
      console.log("\n❌ pdflatex finished, but PDF not found!");
      console.log("\n=== stdout ===");
      console.log(stdout);
      console.log("\n=== stderr ===");
      console.log(stderr);
    }
  });
}

runFullPipeline().catch((err) => {
  console.error("\n❌ TEST FAILED COMPLETELY!");
  console.error(err);
  process.exit(1);
});
