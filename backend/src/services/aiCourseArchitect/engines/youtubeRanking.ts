/**
 * V6 Part 3 — YouTube ranking engine with preferred educational channels.
 */
import type { VideoMapping } from "../types.js";

export interface RankedVideo extends VideoMapping {
  rankScore: number;
  learningObjectives?: string[];
  transcriptAvailable?: boolean;
  officialChannel?: boolean;
}

const PREFERRED_CHANNELS = [
  "mit opencourseware",
  "stanford",
  "harvard",
  "deeplearning.ai",
  "freecodecamp",
  "google developers",
  "google for developers",
  "aws",
  "microsoft learn",
  "nvidia",
  "computerphile",
  "statquest",
  "3blue1brown",
  "fireship",
  "hussein nasser",
];

function channelScore(channel: string | undefined): number {
  if (!channel) return 0;
  const lower = channel.toLowerCase();
  for (let i = 0; i < PREFERRED_CHANNELS.length; i++) {
    if (lower.includes(PREFERRED_CHANNELS[i])) return 0.9 - i * 0.02;
  }
  return 0.4;
}

function topicSimilarity(title: string, lessonTitle: string): number {
  const tokens = lessonTitle.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
  const titleLower = title.toLowerCase();
  if (!tokens.length) return 0.5;
  const hits = tokens.filter((t) => titleLower.includes(t)).length;
  return Math.min(1, hits / Math.max(2, tokens.length * 0.6));
}

function parseDurationMinutes(duration?: string): number {
  if (!duration) return 20;
  const parts = duration.split(":").map((p) => parseInt(p, 10) || 0);
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return 15;
}

export function rankYouTubeCandidates(
  candidates: VideoMapping[],
  lessonTitle: string,
  lessonObjectives: string[] = []
): RankedVideo[] {
  const objectiveText = lessonObjectives.join(" ");
  return candidates
    .map((v) => {
      const ch = channelScore(v.youtubeTitle);
      const topic = topicSimilarity(v.title ?? v.youtubeTitle ?? "", lessonTitle);
      const transcript = topicSimilarity(v.title ?? "", objectiveText);
      const duration = parseDurationMinutes(v.youtubeDuration);
      const durationScore = duration >= 5 && duration <= 45 ? 0.85 : duration <= 90 ? 0.7 : 0.5;
      const official = ch >= 0.7;

      const rankScore = Math.round(
        (topic * 0.3 + transcript * 0.15 + ch * 0.25 + durationScore * 0.1 + (official ? 0.15 : 0.05) + 0.05) * 100
      );

      return {
        ...v,
        rankScore,
        officialChannel: official,
        transcriptAvailable: false,
        learningObjectives: lessonObjectives.slice(0, 3),
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, 10);
}
