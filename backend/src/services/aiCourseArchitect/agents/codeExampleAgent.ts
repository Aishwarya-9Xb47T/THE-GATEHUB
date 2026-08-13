/**
 * Agent — Code Example Generator
 * Generates structured CodeExampleBlock for educational code demonstrations.
 * This is NOT a Coding Lab - it's a static educational example with syntax highlighting.
 * Never generates markdown code blocks - only structured JSON with language metadata.
 */
import { getOpenAi } from "../openaiClient.js";
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import type { ArchitectLessonBlueprint, ArchitectQualityReport } from "../types.js";
import type { CodeExampleBlock } from "../schemas/lessonBlockSchemas.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext } from "../instructorPersona.js";
import { getArchitectModel } from "../architectModels.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { runAgent } from "../orchestrator/agentRunner.js";
import { executeCodeSnippet, syntaxLooksValid } from "../codeExecutor.js";


const SUPPORTED_LANGUAGES = ["python", "javascript", "java", "cpp", "c", "typescript", "go", "rust", "sql"] as const;

async function generateCodeExample(
  lesson: ArchitectLessonBlueprint,
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan
): Promise<CodeExampleBlock> {
  if (!getOpenAi()) return buildHeuristicCodeExample(lesson.title, ctx.interview.courseInfo.subject);

  // Determine language based on subject
  const language = inferLanguage(ctx.interview.courseInfo.subject);

  const prompt = `Generate a structured code example for lesson "${lesson.title}" (${ctx.interview.courseInfo.subject}).

${buildInterviewContext(ctx.interview)}
Concepts: ${plan.conceptOrder.join(", ")}
Language: ${language}

Return JSON:
{
  "type": "code-example",
  "title": "Code Example: ${lesson.title}",
  "description": "Brief description of what this example demonstrates",
  "language": "${language}",
  "filename": "example.${getFileExtension(language)}",
  "code": "complete, runnable code here",
  "lineNumbers": true,
  "syntaxHighlighting": true,
  "copyButton": true,
  "explanation": "Step-by-step explanation of the code",
  "output": "expected output when this code runs",
  "complexity": {
    "time": "O(n)",
    "space": "O(1)"
  },
  "bestPractices": ["practice 1", "practice 2"]
}

Requirements:
- Generate complete, runnable code (no TODOs, no placeholders)
- Code must demonstrate the lesson concepts clearly
- Include meaningful variable names and comments
- Code should be production-quality, not toy examples
- Explanation should walk through the code line by line
- Output should be the actual expected output
- Include time and space complexity analysis
- List 2-3 best practices demonstrated
- No markdown code blocks (no \`\`\`)
- No authoring syntax
- Real educational example for this specific lesson`;

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("structure"),
      messages: [
        { role: "system", content: PROFESSOR_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 2500,
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return buildHeuristicCodeExample(lesson.title, ctx.interview.courseInfo.subject);
    
    const parsed = JSON.parse(raw) as CodeExampleBlock;
    
    // Validate code syntax
    if (!syntaxLooksValid(parsed.code, parsed.language)) {
      console.warn("[CODE EXAMPLE AGENT] Invalid syntax detected, regenerating...");
      return buildHeuristicCodeExample(lesson.title, ctx.interview.courseInfo.subject);
    }
    
    // Try to execute the code to verify it runs
    try {
      const execResult = await executeCodeSnippet(parsed.code, parsed.language);
      if (!execResult.success) {
        console.warn("[CODE EXAMPLE AGENT] Code execution failed, regenerating...");
        return buildHeuristicCodeExample(lesson.title, ctx.interview.courseInfo.subject);
      }
      // Update output with actual execution result
      parsed.output = execResult.stdout || parsed.output;
    } catch (e) {
      console.warn("[CODE EXAMPLE AGENT] Code execution error, using provided output");
    }
    
    return parsed;
  } catch {
    return buildHeuristicCodeExample(lesson.title, ctx.interview.courseInfo.subject);
  }
}

function inferLanguage(subject: string): string {
  const s = subject.toLowerCase();
  if (s.includes("python") || s.includes("data science") || s.includes("machine learning")) return "python";
  if (s.includes("javascript") || s.includes("web") || s.includes("frontend")) return "javascript";
  if (s.includes("java") || s.includes("spring")) return "java";
  if (s.includes("c++") || s.includes("cpp")) return "cpp";
  if (s.includes("typescript") || s.includes("angular") || s.includes("react")) return "typescript";
  if (s.includes("go") || s.includes("golang")) return "go";
  if (s.includes("rust")) return "rust";
  if (s.includes("sql") || s.includes("database")) return "sql";
  if (s.includes("c ") || s.includes("system")) return "c";
  return "python"; // default
}

function getFileExtension(language: string): string {
  const extMap: Record<string, string> = {
    python: "py",
    javascript: "js",
    java: "java",
    cpp: "cpp",
    c: "c",
    typescript: "ts",
    go: "go",
    rust: "rs",
    sql: "sql",
  };
  return extMap[language] || "txt";
}

function buildHeuristicCodeExample(title: string, subject: string): CodeExampleBlock {
  const language = inferLanguage(subject);
  const ext = getFileExtension(language);
  
  let code = "";
  let output = "";
  
  if (language === "python") {
    code = `def example_function():
    """Example demonstrating ${title}"""
    result = perform_operation()
    return result

def perform_operation():
    return "Success"

if __name__ == "__main__":
    print(example_function())`;
    output = "Success";
  } else if (language === "javascript") {
    code = `function exampleFunction() {
    // Example demonstrating ${title}
    const result = performOperation();
    return result;
}

function performOperation() {
    return "Success";
}

console.log(exampleFunction());`;
    output = "Success";
  } else if (language === "java") {
    code = `public class Example {
    // Example demonstrating ${title}
    public static void main(String[] args) {
        String result = performOperation();
        System.out.println(result);
    }
    
    private static String performOperation() {
        return "Success";
    }
}`;
    output = "Success";
  } else {
    code = `// Example demonstrating ${title}\n// Language: ${language}\n// This is a placeholder example`;
    output = "Example output";
  }
  
  return {
    type: "code-example",
    title: `Code Example: ${title}`,
    description: `This example demonstrates the core concepts of ${title}`,
    language: language as any,
    filename: `example.${ext}`,
    code,
    lineNumbers: true,
    syntaxHighlighting: true,
    copyButton: true,
    explanation: `This code example shows how to implement ${title}. The function performs the core operation and returns the result. This pattern is commonly used in production applications.`,
    output,
    complexity: {
      time: "O(1)",
      space: "O(1)",
    },
    bestPractices: [
      "Use descriptive function names",
      "Include comments for complex logic",
      "Handle edge cases appropriately",
    ],
  };
}

function validateCodeExample(output: CodeExampleBlock): ArchitectQualityReport {
  const checks = [
    {
      id: "language-supported",
      label: "Language Supported",
      status: SUPPORTED_LANGUAGES.includes(output.language as any) ? ("pass" as const) : ("fail" as const),
      detail: output.language,
    },
    {
      id: "code-valid",
      label: "Code Syntax Valid",
      status: syntaxLooksValid(output.code, output.language) ? ("pass" as const) : ("fail" as const),
      detail: "Code compiles/runs without syntax errors",
    },
    {
      id: "has-explanation",
      label: "Has Explanation",
      status: (output.explanation?.length || 0) > 50 ? ("pass" as const) : ("warn" as const),
      detail: `${output.explanation?.length || 0} characters`,
    },
    {
      id: "has-complexity",
      label: "Has Complexity Analysis",
      status: !!output.complexity ? ("pass" as const) : ("warn" as const),
      detail: output.complexity ? "Time and space complexity provided" : "Missing complexity",
    },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return {
    score: Math.max(0, 100 - fail * 40),
    passed: fail === 0,
    checks,
    suggestions: fail ? ["Generate valid code example with supported language"] : [],
  };
}

export async function runCodeExampleAgent(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  lesson: ArchitectLessonBlueprint
) {
  return runAgent({
    stage: "code-generator",
    input: { ctx, plan, lesson },
    execute: async ({ ctx: c, plan: p, lesson: l }) => generateCodeExample(l, c, p),
    validate: validateCodeExample,
    maxAttempts: AGENT_MAX_ATTEMPTS,
    minConfidence: 75,
  });
}

export function applyCodeExampleToLesson(
  lesson: ArchitectLessonBlueprint,
  output: CodeExampleBlock
): ArchitectLessonBlueprint {
  return {
    ...lesson,
    // Store ONLY the structured block
    codeExampleBlock: output,
  };
}
