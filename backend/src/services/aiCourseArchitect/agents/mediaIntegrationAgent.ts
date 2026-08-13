/**
 * V4 Agent 9 — Media Integration AI
 */
import type { ArchitectBlueprint, AICourseArchitectInterview } from "../types.js";
import type { MediaIntegrationOutput } from "../orchestrator/contracts.js";
import type { ArchitectQualityReport } from "../types.js";
import { assignVideosToLessons, normalizeVideoMappings } from "../videoAssignmentEngine.js";
import { runAgent } from "../orchestrator/agentRunner.js";

function validateMedia(output: MediaIntegrationOutput, queued: number): ArchitectQualityReport {
  const allAssigned = queued === 0 || output.unassignedVideos === 0;
  return {
    score: allAssigned ? 100 : Math.max(40, 100 - output.unassignedVideos * 15),
    passed: allAssigned,
    checks: [
      { id: "assigned", label: "Videos assigned", status: allAssigned ? "pass" : "fail", detail: `${output.videosAssigned}/${queued} assigned` },
      { id: "coverage", label: "Lesson coverage", status: output.lessonsWithVideo > 0 || queued === 0 ? "pass" : "fail", detail: `${output.lessonsWithVideo} lessons` },
    ],
    suggestions: allAssigned ? [] : ["Assign all instructor videos to lessons or modules"],
  };
}

function buildMediaReport(blueprint: ArchitectBlueprint, interview: AICourseArchitectInterview): MediaIntegrationOutput {
  const placements: MediaIntegrationOutput["placements"] = [];
  let videosAssigned = 0;
  for (const mod of blueprint.modules) {
    for (const lesson of mod.lessons) {
      for (const v of lesson.videos ?? []) {
        videosAssigned++;
        placements.push({ lessonKey: `${mod.id}/${lesson.id}`, videoTitle: v.title, type: v.type });
      }
    }
  }
  const queued = normalizeVideoMappings(interview.videoStrategy.mappings).length;
  return {
    videosAssigned,
    lessonsWithVideo: new Set(placements.map((p) => p.lessonKey)).size,
    unassignedVideos: Math.max(0, queued - videosAssigned),
    placements,
  };
}

export async function runMediaIntegrationAgent(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
) {
  const mappings = normalizeVideoMappings(interview.videoStrategy.mappings);
  const placement = interview.videoStrategy.placement ?? "ai-auto";

  return runAgent({
    stage: "media-integration",
    input: { blueprint, interview, mappings, placement },
    execute: async ({ blueprint: bp, interview: iv, mappings: m, placement: p }) => {
      const updated =
        m.length && iv.videoStrategy.includeVideos !== false ? assignVideosToLessons(bp, m, p) : bp;
      return { blueprint: updated, media: buildMediaReport(updated, iv) };
    },
    validate: ({ media }) => validateMedia(media, mappings.length),
    maxAttempts: 2,
    minConfidence: 90,
  });
}
