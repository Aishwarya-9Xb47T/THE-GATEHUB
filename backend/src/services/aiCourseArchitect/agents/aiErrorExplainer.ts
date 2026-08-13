/**
 * AI Error Explainer
 * Provides AI-powered error explanations without revealing hidden solutions.
 * Explains errors in a way that guides students without giving away the answer.
 */

import { OpenAI } from 'openai';
import { getOpenAi } from "../openaiClient.js";


interface ErrorExplanationRequest {
  language: string;
  code: string;
  error: {
    type: 'compilation' | 'runtime' | 'syntax' | 'logic' | 'timeout' | 'memory';
    message: string;
    line?: number;
    column?: number;
    stackTrace?: string;
  };
  workspaceMode: 'practice' | 'assignment' | 'interview' | 'exam' | 'sandbox' | 'notebook';
  hintLevel: 'minimal' | 'moderate' | 'detailed';
  revealSolution: boolean;
}

interface ErrorExplanationResponse {
  explanation: string;
  suggestedFix?: string;
  commonCauses?: string[];
  learningResources?: string[];
  shouldRevealSolution: boolean;
}

/**
 * Generate AI-powered error explanation
 * Explains the error without revealing the solution
 */
export async function explainError(request: ErrorExplanationRequest): Promise<ErrorExplanationResponse> {
  if (!getOpenAi()) {
    return generateHeuristicExplanation(request);
  }

  const { language, code, error, workspaceMode, hintLevel, revealSolution } = request;

  // In exam/interview mode, provide minimal explanations
  if (workspaceMode === 'exam' || workspaceMode === 'interview') {
    return generateMinimalExplanation(request);
  }

  // Build context-aware prompt
  const prompt = `You are an expert programming tutor helping a student debug their ${language} code.

**Error Details:**
- Type: ${error.type}
- Message: ${error.message}
- Line: ${error.line || 'unknown'}
- Column: ${error.column || 'unknown'}
${error.stackTrace ? `- Stack Trace: ${error.stackTrace}` : ''}

**Student's Code:**
\`\`\`${language}
${code}
\`\`\`

**Instructions:**
- Explain the error in ${hintLevel} detail
- Guide the student to understand the problem
- NEVER reveal the complete solution
- NEVER provide code that directly fixes the problem
- Suggest debugging strategies instead
- If ${hintLevel === 'minimal'}, give only a brief hint
- If ${hintLevel === 'moderate'}, explain the concept and suggest approaches
- If ${hintLevel === 'detailed'}, provide step-by-step debugging guidance
${revealSolution ? '- If the student is completely stuck, you may provide a partial solution after explaining the concept' : '- Do not reveal the solution under any circumstances'}

**Response Format:**
{
  "explanation": "Clear explanation of what went wrong",
  "suggestedFix": "General approach to fix (not the exact solution)",
  "commonCauses": ["Common cause 1", "Common cause 2"],
  "learningResources": ["Topic to study 1", "Topic to study 2"],
  "shouldRevealSolution": false
}`;

  try {
    const response = await getOpenAi()!.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a patient programming tutor who guides students to solve problems themselves. Never give complete solutions. Focus on teaching debugging skills and conceptual understanding.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return generateHeuristicExplanation(request);
    }

    const parsed = JSON.parse(content) as ErrorExplanationResponse;
    
    // Ensure solution is not revealed unless explicitly allowed
    if (!revealSolution) {
      parsed.shouldRevealSolution = false;
    }

    return parsed;
  } catch (error) {
    console.error('[AI ERROR EXPLAINER] Failed to generate explanation:', error);
    return generateHeuristicExplanation(request);
  }
}

/**
 * Generate heuristic error explanation (fallback when AI is unavailable)
 */
function generateHeuristicExplanation(request: ErrorExplanationRequest): ErrorExplanationResponse {
  const { language, error, hintLevel } = request;

  const explanations: Record<string, string> = {
    'syntax': `This appears to be a syntax error in your ${language} code. Syntax errors occur when the code doesn't follow the language's grammar rules. Check for missing semicolons, unmatched brackets, or incorrect keywords.`,
    'runtime': `This is a runtime error that occurs while your code is executing. The error message indicates what went wrong. Check the line number mentioned in the error and review your logic.`,
    'compilation': `This is a compilation error. The compiler found issues with your code structure. Review the error message for specific details about what needs to be fixed.`,
    'logic': `This appears to be a logic error. Your code runs but produces incorrect results. Review your algorithm and check edge cases.`,
    'timeout': `Your code took too long to execute. This might indicate an infinite loop or inefficient algorithm. Consider optimizing your approach.`,
    'memory': `Your code exceeded the memory limit. This could be due to memory leaks or inefficient data structures. Review your memory usage.`,
  };

  const explanation = explanations[error.type] || 'An error occurred while executing your code. Review the error message for details.';

  return {
    explanation,
    suggestedFix: hintLevel === 'detailed' ? 'Review the error message and check the mentioned line number.' : undefined,
    commonCauses: ['Typo in code', 'Missing import', 'Incorrect variable name'],
    learningResources: [`Debugging in ${language}`, 'Error handling best practices'],
    shouldRevealSolution: false,
  };
}

/**
 * Generate minimal explanation for exam/interview modes
 */
function generateMinimalExplanation(request: ErrorExplanationRequest): ErrorExplanationResponse {
  const { error } = request;

  return {
    explanation: `Error: ${error.message}. Check line ${error.line || 'unknown'}.`,
    suggestedFix: undefined,
    commonCauses: undefined,
    learningResources: undefined,
    shouldRevealSolution: false,
  };
}

/**
 * Generate hint based on error type and language
 */
export async function generateHint(
  language: string,
  errorType: string,
  errorMessage: string,
  hintLevel: 'minimal' | 'moderate' | 'detailed'
): Promise<string> {
  if (!getOpenAi()) {
    return generateHeuristicHint(language, errorType, errorMessage, hintLevel);
  }

  const prompt = `Generate a ${hintLevel} hint for a ${language} programming error.

Error type: ${errorType}
Error message: ${errorMessage}

Requirements:
- Guide the student without revealing the solution
- Focus on the concept, not the specific fix
- If minimal: one sentence hint
- If moderate: explain the concept
- If detailed: step-by-step guidance

Return only the hint text.`;

  try {
    const response = await getOpenAi()!.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a programming tutor. Provide hints that guide without giving away solutions.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    return response.choices[0]?.message?.content || generateHeuristicHint(language, errorType, errorMessage, hintLevel);
  } catch {
    return generateHeuristicHint(language, errorType, errorMessage, hintLevel);
  }
}

/**
 * Generate heuristic hint
 */
function generateHeuristicHint(
  language: string,
  errorType: string,
  errorMessage: string,
  hintLevel: 'minimal' | 'moderate' | 'detailed'
): string {
  const hints: Record<string, Record<string, string>> = {
    minimal: {
      syntax: 'Check your code for syntax errors.',
      runtime: 'Review the error message and check your logic.',
      compilation: 'Review the compiler error message.',
      logic: 'Think about the algorithm you\'re using.',
    },
    moderate: {
      syntax: `Syntax errors in ${language} often involve missing punctuation or incorrect keywords. Check the line mentioned in the error.`,
      runtime: `Runtime errors occur during execution. The error message tells you what went wrong. Check variable values and function calls.`,
      compilation: `Compilation errors prevent your code from running. The compiler tells you exactly what's wrong. Read the error message carefully.`,
      logic: `Logic errors mean your code runs but produces wrong results. Trace through your algorithm with sample inputs to find where it goes wrong.`,
    },
    detailed: {
      syntax: `Check for: missing semicolons, unmatched brackets, incorrect keywords, misspelled variable names, or incorrect operator usage. The error message usually points to the specific line.`,
      runtime: `Runtime errors include: null pointer exceptions, division by zero, index out of bounds, type errors. Check: variable initialization, array bounds, function parameters, and data types.`,
      compilation: `Common compilation errors: missing imports, incorrect types, undefined variables, syntax errors. Read the compiler output carefully - it tells you the exact issue and location.`,
      logic: `To debug logic errors: 1) Add print statements to trace execution, 2) Check edge cases, 3) Verify algorithm correctness, 4) Test with known inputs, 5) Compare expected vs actual output.`,
    },
  };

  return hints[hintLevel]?.[errorType] || 'Review the error message and check your code.';
}

/**
 * Validate that an explanation doesn't reveal the solution
 */
export function validateExplanationSafety(explanation: string, code: string): boolean {
  // Check if explanation contains large chunks of the original code
  const codeLines = code.split('\n');
  const explanationLines = explanation.split('\n');
  
  let matchingLines = 0;
  for (const expLine of explanationLines) {
    for (const codeLine of codeLines) {
      if (expLine.trim() === codeLine.trim() && expLine.trim().length > 10) {
        matchingLines++;
      }
    }
  }
  
  // If more than 3 lines match exactly, it might be revealing the solution
  if (matchingLines > 3) {
    return false;
  }
  
  // Check for solution-revealing phrases
  const forbiddenPhrases = [
    'the solution is',
    'here is the fix',
    'change this line to',
    'replace with',
    'correct code is',
    'the answer is',
  ];
  
  const lowerExplanation = explanation.toLowerCase();
  for (const phrase of forbiddenPhrases) {
    if (lowerExplanation.includes(phrase)) {
      return false;
    }
  }
  
  return true;
}
