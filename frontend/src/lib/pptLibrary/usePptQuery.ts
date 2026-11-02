import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchLibraryTopics,
  fetchTopicSubtopics,
  PPTTopic,
  PPTSubtopic,
} from "./api";

export const PPT_QUERY_KEYS = {
  topics: (includeInactive = false) => ["ppt-library", "topics", { includeInactive }] as const,
  subtopics: (topicId: string, includeInactive = false) =>
    ["ppt-library", "subtopics", topicId, { includeInactive }] as const,
};

export function usePptTopics(includeInactive = false) {
  return useQuery<PPTTopic[], Error>({
    queryKey: PPT_QUERY_KEYS.topics(includeInactive),
    queryFn: () => fetchLibraryTopics(includeInactive),
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnWindowFocus: true,
  });
}

export function usePptSubtopics(topicId: string, includeInactive = false) {
  return useQuery<PPTSubtopic[], Error>({
    queryKey: PPT_QUERY_KEYS.subtopics(topicId, includeInactive),
    queryFn: () => fetchTopicSubtopics(topicId, includeInactive),
    enabled: Boolean(topicId),
    staleTime: 1000 * 60 * 2,
  });
}

export function useInvalidatePptCategories() {
  const queryClient = useQueryClient();

  const invalidate = async (topicId?: string) => {
    await queryClient.invalidateQueries({ queryKey: ["ppt-library", "topics"] });
    if (topicId) {
      await queryClient.invalidateQueries({ queryKey: ["ppt-library", "subtopics", topicId] });
    } else {
      await queryClient.invalidateQueries({ queryKey: ["ppt-library", "subtopics"] });
    }
  };

  return { invalidate };
}
