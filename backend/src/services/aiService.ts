import { AppError } from "../middlewares/errorHandler.js";
import OpenAI from "openai";

const getOpenAi = (): OpenAI | null => {
  const k = process.env.OPENAI_API_KEY?.trim();
  return k ? new OpenAI({ apiKey: k }) : null;
};

export async function generateAutoDescription(title: string, content: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return `A comprehensive course on ${title}. This course covers various topics and provides in-depth knowledge to help you master the subject.`;
  }

  try {
    const response = await getOpenAi()!.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert course creator. Generate a clear, engaging, and professional course description based on the provided lectures and notes. Keep it concise (2-3 paragraphs), structured, and student-friendly. Use markdown for formatting."
        },
        {
          role: "user",
          content: `Course Title: ${title}\n\nContent Summary:\n${content}`
        }
      ],
    });

    return response.choices[0]?.message?.content || "";
  } catch (error) {
    console.error("OpenAI Description Generation Error:", error);
    return `Master ${title} with this detailed course.`;
  }
}

export interface AICourseDetails {
  description: string;
  whatYouWillLearn: string[];
  requirements: string[];
  skills: string[];
  targetAudience: string[];
}

export async function generateUdemyStyleContent(title: string, content: string): Promise<AICourseDetails> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      description: `Master ${title} with this comprehensive course.`,
      whatYouWillLearn: [`Understand core concepts of ${title}`, "Apply best practices", "Build real-world projects"],
      requirements: ["Basic computer knowledge", "Willingness to learn"],
      skills: [title, "Problem Solving"],
      targetAudience: ["Beginners", "Professionals looking to upskill"]
    };
  }

  try {
    const response = await getOpenAi()!.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert Udemy course creator. Generate high-quality course details in JSON format. Return ONLY raw JSON without any markdown formatting or code blocks."
        },
        {
          role: "user",
          content: `Generate course details for "${title}" based on this content: ${content}. 
          Return JSON with fields: description (markdown), whatYouWillLearn (array), requirements (array), skills (array), targetAudience (array).`
        }
      ],
      response_format: { type: "json_object" }
    });

    const contentStr = response.choices[0]?.message?.content || "{}";
    const data = JSON.parse(contentStr);
    return data as AICourseDetails;
  } catch (error) {
    console.error("AI Udemy Content Error:", error);
    return {
      description: `Comprehensive guide to ${title}.`,
      whatYouWillLearn: ["Foundational knowledge"],
      requirements: ["None"],
      skills: [title],
      targetAudience: ["Anyone"]
    };
  }
}

interface AIResponse {
  description: string;
  curriculum: Array<{
    title: string;
    topics: Array<{
      title: string;
      content: string;
      quiz?: {
        questions: Array<{
          text: string;
          options: string[];
          correctAnswer: string;
          explanation: string;
        }>
      }
    }>
  }>
}

export async function generateCourseContent(title: string): Promise<AIResponse> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  
  if (!apiKey) {
    // If no API key, return high-quality mock data for the given title
    // This allows the feature to work in development without a key
    return generateMockCourse(title);
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are an expert course creator. Generate a complete course structure in JSON format for the title: "${title}". 
            Include: 
            1. description (string)
            2. curriculum (array of modules)
            Each module has: 
            - title (string)
            - topics (array)
            Each topic has:
            - title (string)
            - content (string, detailed educational content in markdown)
            - quiz (optional object)
            Each quiz has:
            - questions (array)
            Each question has:
            - text (string)
            - options (array of 4 strings)
            - correctAnswer (string, matching one of the options)
            - explanation (string)
            
            Return ONLY the raw JSON.`
          }]
        }],
        generationConfig: {
          response_mime_type: "application/json",
        }
      })
    });

    const data: any = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error("AI generation failed");
    return JSON.parse(content);
  } catch (error) {
    console.error("AI Generation Error:", error);
    throw new AppError(500, "Failed to generate AI course content");
  }
}

function generateMockCourse(title: string): AIResponse {
  return {
    description: `This is a comprehensive AI-generated course on ${title}. You will learn the fundamental concepts, advanced techniques, and practical applications in this field.`,
    curriculum: [
      {
        title: "Module 1: Foundations",
        topics: [
          {
            title: `Introduction to ${title}`,
            content: `# Introduction\nWelcome to the course on ${title}. In this topic, we cover the history and core principles...`,
            quiz: {
              questions: [
                {
                  text: `What is the primary goal of ${title}?`,
                  options: ["Option A", "Option B", "Option C", "Option D"],
                  correctAnswer: "Option A",
                  explanation: "Option A is correct because it follows the fundamental principles of the field."
                }
              ]
            }
          }
        ]
      },
      {
        title: "Module 2: Intermediate Concepts",
        topics: [
          {
            title: "Core Mechanics",
            content: `# Core Mechanics\nDeep dive into how things work under the hood...`,
          }
        ]
      }
    ]
  };
}

export interface AILandingPageData {
  overview: string;
  learningOutcomes: string[];
  requirements: string[];
  targetAudience: string;
  skills: string[];
  longDescription: string;
}

export async function generateCourseLandingPage(
  title: string,
  contentSummary: string
): Promise<AILandingPageData> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    return generateMockLandingPage(title);
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are an expert marketing copywriter for online courses. 
            Based on the following course content summary: "${contentSummary}", 
            generate a professional course landing page for a course titled "${title}".
            
            Return ONLY a JSON object with:
            1. overview (string, engaging summary)
            2. learningOutcomes (array of 5-10 strings)
            3. requirements (array of strings)
            4. targetAudience (string, e.g. "Beginners in AI")
            5. skills (array of strings)
            6. longDescription (string, professional SEO-friendly description in markdown)
            
            Format the output as clean JSON.`
          }]
        }],
        generationConfig: {
          response_mime_type: "application/json",
        }
      })
    });

    const data: any = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error("AI landing page generation failed");
    return JSON.parse(content);
  } catch (error) {
    console.error("AI Landing Page Generation Error:", error);
    return generateMockLandingPage(title);
  }
}

export interface AICertificateData {
  certificateTitle: string;
  certificateBody: string;
}

export async function generateCertificateContent(
  studentName: string,
  courseName: string,
  completionDate: string
): Promise<AICertificateData> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      certificateTitle: "Certificate of Achievement",
      certificateBody: `This is to certify that ${studentName} has successfully completed the course "${courseName}" on ${completionDate}. Their dedication and commitment to learning have been exemplary.`
    };
  }

  try {
    const response = await getOpenAi()!.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a professional academic certificate writer. Generate formal, elegant, and professional certificate text. Return ONLY raw JSON with fields: certificateTitle, certificateBody."
        },
        {
          role: "user",
          content: `Generate a premium certificate text for:
          Student: ${studentName}
          Course: ${courseName}
          Date: ${completionDate}
          
          Make it formal, sophisticated, and suitable for a high-end learning platform.`
        }
      ],
      response_format: { type: "json_object" }
    });

    const contentStr = response.choices[0]?.message?.content || "{}";
    return JSON.parse(contentStr) as AICertificateData;
  } catch (error) {
    console.error("AI Certificate Generation Error:", error);
    return {
      certificateTitle: "Certificate of Completion",
      certificateBody: `In recognition of the successful completion of the course "${courseName}", this certificate is awarded to ${studentName} on ${completionDate}.`
    };
  }
}

function generateMockLandingPage(title: string): AILandingPageData {
  return {
    overview: `Master ${title} with this comprehensive, project-based course designed for modern learners.`,
    learningOutcomes: [
      `Understand the core principles of ${title}`,
      "Apply advanced techniques to real-world problems",
      "Build a professional portfolio of projects",
      "Master industry-standard tools and workflows",
      "Develop a deep conceptual understanding"
    ],
    requirements: [
      "Basic computer literacy",
      "A passion for learning",
      "No prior experience required"
    ],
    targetAudience: "Anyone looking to master " + title,
    skills: [title, "Problem Solving", "Critical Thinking"],
    longDescription: `## About This Course\n\nWelcome to the ultimate guide to **${title}**. In this course, we'll take you from a complete beginner to an advanced level...`
  };
}
