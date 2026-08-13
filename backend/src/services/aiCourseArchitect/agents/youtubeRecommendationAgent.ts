/**
 * Agent — YouTube Recommendation AI
 * Generates 5-10 high-quality YouTube videos per lesson
 */
import OpenAI from "openai";
import { getOpenAi } from "../openaiClient.js";
import type {
  AICourseArchitectInterview,
  ArchitectLessonBlueprint,
  ArchitectModuleBlueprint,
  VideoMapping,
  ArchitectQualityReport,
} from "../types.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext } from "../instructorPersona.js";
import { getArchitectModel } from "../architectModels.js";
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import { runAgent } from "../orchestrator/agentRunner.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { isSubstantiveText } from "../pipeline/placeholderGuards.js";


export interface YouTubeRecommendation {
  title: string;
  channel: string;
  duration: string;
  url: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  reason: string;
}

export async function generateYouTubeRecommendations(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview
): Promise<VideoMapping[]> {
  const recommendations = getOpenAi()
    ? await generateRecommendationsWithAI(lesson, mod, interview)
    : null;

  if (recommendations && recommendations.length >= 5) {
    return recommendations;
  }

  // Fallback heuristic recommendations
  return buildHeuristicRecommendations(lesson, mod, interview);
}

async function generateRecommendationsWithAI(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview
): Promise<VideoMapping[] | null> {
  if (!getOpenAi()) return null;

  const prompt = `You are a senior course content curator. Recommend EXACTLY 10 high-quality YouTube videos for a lesson titled "${lesson.title}" in module "${mod.title}" of a ${interview.courseInfo.subject} course.

${buildInterviewContext(interview)}

Lesson content:
- Introduction: ${lesson.introduction?.slice(0, 500)}
- Theory: ${lesson.theory?.slice(0, 1500)}
- Key concepts: ${lesson.keyTakeaways?.join("; ")}

Requirements:
- ONLY recommend highly relevant videos
- Prefer videos from: MIT OpenCourseWare, Stanford Online, DeepLearning.AI, Coursera, freeCodeCamp.org, Google for Developers, Microsoft Learn, NVIDIA Developer, official framework docs, or official conference talks
- Reject unrelated videos entirely
- Mix of theory explanations, practical tutorials, and deep-dive videos
- Include only publicly available content
- No low-quality or outdated videos

Return JSON with an array of "videos":
{
  "videos": [
    {
      "title": "video title",
      "channel": "channel name",
      "url": "https://www.youtube.com/watch?v=...",
      "duration": "e.g., 15:30 or 1:23:45",
      "difficulty": "beginner|intermediate|advanced",
      "reason": "Why this video is perfect for this lesson and how it aligns with the lesson objectives"
    }
  ]
}

Only return valid JSON, no other text.`;

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("youtube"),
      messages: [
        { role: "system", content: PROFESSOR_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 2500,
    });

    const raw = res.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const videos = parsed.videos || parsed.recommendations || parsed;

    if (!Array.isArray(videos)) {
      return null;
    }

    return videos.map((v: any) => ({
      type: "youtube",
      title: v.title || "YouTube Video",
      url: v.url || "",
      youtubeTitle: v.title,
      youtubeDuration: v.duration,
      difficulty: v.difficulty || "intermediate",
    } as VideoMapping));
  } catch (err) {
    console.error("[YouTube Recommendation Agent] OpenAI failed:", err);
    return null;
  }
}

function buildHeuristicRecommendations(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview
): VideoMapping[] {
  const topic = lesson.title.split("—").pop()?.trim() || lesson.title;
  const subject = interview.courseInfo.subject;

  const channels = [
    "freeCodeCamp.org",
    "MIT OpenCourseWare",
    "Stanford Online",
    "DeepLearning.AI",
    "Google for Developers",
    "Microsoft Learn",
  ];

  return channels.slice(0, 6).map((channel, i) => {
    const difficulty = i < 2 ? "beginner" : i < 4 ? "intermediate" : "advanced";
    return {
      type: "youtube" as const,
      title: `${topic} - ${channel} Tutorial`,
      url: "https://www.youtube.com/results?search_query=" + encodeURIComponent(`${subject} ${topic}`),
      youtubeTitle: `${topic} - ${channel} Tutorial`,
      youtubeDuration: "30:00",
      difficulty,
    };
  });
}

function validateVideos(videos: VideoMapping[]): ArchitectQualityReport {
  const checks = [
    {
      id: "count",
      label: "Video count",
      status: videos.length >= 5 ? ("pass" as const) : videos.length >= 3 ? ("warn" as const) : ("fail" as const),
      detail: `${videos.length}/5`,
    },
    {
      id: "quality",
      label: "Video quality",
      status: videos.every((v) => isSubstantiveText(v.title, 3) && v.url) ? ("pass" as const) : ("fail" as const),
      detail: "All videos have titles and URLs",
    },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return {
    score: Math.max(0, 100 - fail * 35 - (videos.length < 5 ? 10 : 0)),
    passed: fail === 0 && videos.length >= 3,
    checks,
    suggestions: fail || videos.length < 5 ? ["Generate 5-10 high-quality YouTube videos for this lesson"] : [],
  };
}

export async function runYoutubeRecommendationAgent(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  lesson: ArchitectLessonBlueprint
) {
  return runAgent({
    stage: "video-recommendation",
    input: { ctx, plan, lesson },
    execute: async ({ ctx: c, plan: p, lesson: l }) => {
      // Don't overwrite instructor-provided videos
      const existingInstructorVideos = (l.videos || []).filter((v) => v.type === "upload");
      const generatedVideos = await generateYouTubeRecommendations(l, c.mod, c.interview);
      return [...existingInstructorVideos, ...generatedVideos];
    },
    validate: validateVideos,
    maxAttempts: AGENT_MAX_ATTEMPTS,
    minConfidence: 80,
  });
}
