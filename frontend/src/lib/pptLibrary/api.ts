import { api, apiUrl, apiFormData } from "@/lib/api";

export interface PPTTopic {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  displayOrder: number;
  isActive: boolean;
  resourceCount?: number;
  subtopics: PPTSubtopic[];
}

export interface PPTSubtopic {
  id: string;
  topicId: string;
  name: string;
  slug: string;
  description?: string | null;
  displayOrder: number;
  isActive: boolean;
  resourceCount?: number;
}

export interface PPTResource {
  id: string;
  title: string;
  description?: string | null;
  topicId: string;
  subtopicId: string;
  instructorId: string;
  originalFileName: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  thumbnailUrl?: string | null;
  previewStorageKey?: string | null;
  status: "draft" | "published" | "archived";
  language: string;
  tags: string[];
  academicLevel?: string | null;
  slideCount?: number | null;
  fileType?: "ppt" | "pptx" | "pdf";
  pageCount?: number | null;
  downloadCount: number;
  viewCount: number;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  topic: { id: string; name: string; slug: string };
  subtopic: { id: string; name: string; slug: string };
  instructor: {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string | null;
    profileImage?: string | null;
    designation?: string | null;
  };
  versions?: PPTVersion[];
}

export interface PPTVersion {
  id: string;
  versionNumber: number;
  originalFileName: string;
  fileType?: "ppt" | "pptx" | "pdf";
  fileSize: number;
  mimeType: string;
  changeNote?: string | null;
  createdAt: string;
  uploadedBy?: { id: string; firstName: string; lastName: string };
}

export interface PPTLibraryListResponse {
  data: PPTResource[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats?: {
    totalPpts: number;
    publishedPpts: number;
    draftPpts: number;
    totalDownloads: number;
    totalViews: number;
  };
}

export interface PPTAdminStats {
  totalPpts: number;
  publishedPpts: number;
  draftPpts: number;
  totalDownloads: number;
  totalViews: number;
  totalTopics: number;
  totalSubtopics: number;
  contributingInstructors: number;
}

// ==========================================
// API Calls
// ==========================================

export async function fetchLibraryResources(params?: {
  page?: number;
  limit?: number;
  search?: string;
  topicId?: string;
  subtopicId?: string;
  language?: string;
  academicLevel?: string;
  fileType?: string;
  sort?: string;
}): Promise<PPTLibraryListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.search) query.set("search", params.search);
  if (params?.topicId) query.set("topicId", params.topicId);
  if (params?.subtopicId) query.set("subtopicId", params.subtopicId);
  if (params?.language) query.set("language", params.language);
  if (params?.academicLevel) query.set("academicLevel", params.academicLevel);
  if (params?.fileType && params.fileType !== "all") query.set("fileType", params.fileType);
  if (params?.sort) query.set("sort", params.sort);

  const qs = query.toString();
  const res = await api<{ success: boolean; data: PPTResource[]; pagination: PPTLibraryListResponse["pagination"] }>(
    `/ppt-library${qs ? `?${qs}` : ""}`
  );
  if (res.error || !res.data) throw new Error(res.error || "Failed to fetch study materials");
  return {
    data: res.data.data,
    pagination: res.data.pagination,
  };
}

export async function fetchLibraryTopics(includeInactive = false): Promise<PPTTopic[]> {
  const res = await api<{ success: boolean; data: PPTTopic[] }>(
    `/ppt-library/topics${includeInactive ? "?all=true" : ""}`
  );
  if (res.error || !res.data) throw new Error(res.error || "Failed to fetch topics");
  return res.data.data;
}

export async function fetchLibraryTopic(topicId: string): Promise<PPTTopic> {
  const res = await api<{ success: boolean; data: PPTTopic }>(`/ppt-library/topics/${topicId}`);
  if (res.error || !res.data) throw new Error(res.error || "Failed to fetch topic");
  return res.data.data;
}

export async function fetchTopicSubtopics(topicId: string, includeInactive = false): Promise<PPTSubtopic[]> {
  const res = await api<{ success: boolean; data: PPTSubtopic[] }>(
    `/ppt-library/topics/${topicId}/subtopics${includeInactive ? "?all=true" : ""}`
  );
  if (res.error || !res.data) throw new Error(res.error || "Failed to fetch subtopics");
  return res.data.data;
}

export async function fetchResourceDetail(pptId: string): Promise<PPTResource> {
  const res = await api<{ success: boolean; data: PPTResource }>(`/ppt-library/${pptId}`);
  if (res.error || !res.data) throw new Error(res.error || "Failed to fetch material details");
  return res.data.data;
}

export function getPptDownloadUrl(pptId: string): string {
  return apiUrl(`/ppt-library/${pptId}/download`);
}

export function getPptPreviewUrl(pptId: string): string {
  return apiUrl(`/ppt-library/${pptId}/preview`);
}

export async function fetchMyResources(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  fileType?: string;
}): Promise<PPTLibraryListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  if (params?.fileType && params.fileType !== "all") query.set("fileType", params.fileType);

  const qs = query.toString();
  const res = await api<{
    success: boolean;
    data: PPTResource[];
    pagination: PPTLibraryListResponse["pagination"];
    stats: PPTLibraryListResponse["stats"];
  }>(`/ppt-library/my${qs ? `?${qs}` : ""}`);

  if (res.error || !res.data) throw new Error(res.error || "Failed to fetch your study materials");
  return {
    data: res.data.data,
    pagination: res.data.pagination,
    stats: res.data.stats,
  };
}

export async function uploadPptResource(formData: FormData): Promise<{ success: boolean; data: PPTResource }> {
  const res = await apiFormData<{ success: boolean; data: PPTResource }>("/ppt-library/upload", formData);
  if (res.error || !res.data) throw new Error(res.error || "Failed to upload study material");
  return res.data;
}

export async function replacePptFile(
  pptId: string,
  formData: FormData
): Promise<{ success: boolean; data: PPTResource }> {
  const res = await apiFormData<{ success: boolean; data: PPTResource }>(`/ppt-library/${pptId}/replace`, formData);
  if (res.error || !res.data) throw new Error(res.error || "Failed to replace material file");
  return res.data;
}

export async function updatePptMetadata(
  pptId: string,
  data: {
    title?: string;
    description?: string;
    topicId?: string;
    subtopicId?: string;
    language?: string;
    academicLevel?: string;
    tags?: string[];
  }
): Promise<{ success: boolean; data: PPTResource }> {
  const res = await api<{ success: boolean; data: PPTResource }>(`/ppt-library/${pptId}`, {
    method: "PATCH",
    body: data,
  });
  if (res.error || !res.data) throw new Error(res.error || "Failed to update material details");
  return res.data;
}

export async function publishPptResource(pptId: string): Promise<{ success: boolean; data: PPTResource }> {
  const res = await api<{ success: boolean; data: PPTResource }>(`/ppt-library/${pptId}/publish`, {
    method: "POST",
  });
  if (res.error || !res.data) throw new Error(res.error || "Failed to publish material");
  return res.data;
}

export async function unpublishPptResource(pptId: string): Promise<{ success: boolean; data: PPTResource }> {
  const res = await api<{ success: boolean; data: PPTResource }>(`/ppt-library/${pptId}/unpublish`, {
    method: "POST",
  });
  if (res.error || !res.data) throw new Error(res.error || "Failed to unpublish material");
  return res.data;
}

export async function deletePptResource(pptId: string): Promise<{ success: boolean; message: string }> {
  const res = await api<{ success: boolean; message: string }>(`/ppt-library/${pptId}`, {
    method: "DELETE",
  });
  if (res.error || !res.data) throw new Error(res.error || "Failed to delete material");
  return res.data;
}

// Topics & Subtopics
export async function createTopic(data: {
  name: string;
  description?: string;
  icon?: string;
  displayOrder?: number;
  isActive?: boolean;
}): Promise<{ success: boolean; data: PPTTopic }> {
  const res = await api<{ success: boolean; data: PPTTopic }>("/ppt-library/topics", {
    method: "POST",
    body: data,
  });
  if (res.error || !res.data) throw new Error(res.error || "Failed to create topic");
  return res.data;
}

export async function updateTopic(
  topicId: string,
  data: {
    name?: string;
    description?: string;
    icon?: string;
    displayOrder?: number;
    isActive?: boolean;
  }
): Promise<{ success: boolean; data: PPTTopic }> {
  const res = await api<{ success: boolean; data: PPTTopic }>(`/ppt-library/topics/${topicId}`, {
    method: "PATCH",
    body: data,
  });
  if (res.error || !res.data) throw new Error(res.error || "Failed to update topic");
  return res.data;
}

export async function deleteTopic(topicId: string): Promise<{ success: boolean; message: string }> {
  const res = await api<{ success: boolean; message: string }>(`/ppt-library/topics/${topicId}`, {
    method: "DELETE",
  });
  if (res.error || !res.data) throw new Error(res.error || "Failed to delete topic");
  return res.data;
}

export async function createSubtopic(data: {
  topicId: string;
  name: string;
  description?: string;
  displayOrder?: number;
  isActive?: boolean;
}): Promise<{ success: boolean; data: PPTSubtopic }> {
  const res = await api<{ success: boolean; data: PPTSubtopic }>("/ppt-library/subtopics", {
    method: "POST",
    body: data,
  });
  if (res.error || !res.data) throw new Error(res.error || "Failed to create subtopic");
  return res.data;
}

export async function updateSubtopic(
  subtopicId: string,
  data: {
    name?: string;
    description?: string;
    displayOrder?: number;
    isActive?: boolean;
  }
): Promise<{ success: boolean; data: PPTSubtopic }> {
  const res = await api<{ success: boolean; data: PPTSubtopic }>(`/ppt-library/subtopics/${subtopicId}`, {
    method: "PATCH",
    body: data,
  });
  if (res.error || !res.data) throw new Error(res.error || "Failed to update subtopic");
  return res.data;
}

export async function deleteSubtopic(subtopicId: string): Promise<{ success: boolean; message: string }> {
  const res = await api<{ success: boolean; message: string }>(`/ppt-library/subtopics/${subtopicId}`, {
    method: "DELETE",
  });
  if (res.error || !res.data) throw new Error(res.error || "Failed to delete subtopic");
  return res.data;
}

// Admin
export async function fetchAdminPptLibrary(params?: {
  page?: number;
  limit?: number;
  search?: string;
  topicId?: string;
  status?: string;
  instructorId?: string;
  fileType?: string;
  sort?: string;
}): Promise<PPTLibraryListResponse & { stats: PPTAdminStats }> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.search) query.set("search", params.search);
  if (params?.topicId) query.set("topicId", params.topicId);
  if (params?.status) query.set("status", params.status);
  if (params?.instructorId) query.set("instructorId", params.instructorId);
  if (params?.fileType && params.fileType !== "all") query.set("fileType", params.fileType);
  if (params?.sort) query.set("sort", params.sort);

  const qs = query.toString();
  const res = await api<{
    success: boolean;
    data: PPTResource[];
    pagination: PPTLibraryListResponse["pagination"];
    stats: PPTAdminStats;
  }>(`/ppt-library/admin/all${qs ? `?${qs}` : ""}`);

  if (res.error || !res.data) throw new Error(res.error || "Failed to fetch admin study materials");
  return {
    data: res.data.data,
    pagination: res.data.pagination,
    stats: res.data.stats,
  };
}

export async function updateAdminPptStatus(
  pptId: string,
  status: "published" | "draft" | "archived"
): Promise<{ success: boolean; data: PPTResource }> {
  const res = await api<{ success: boolean; data: PPTResource }>(`/ppt-library/admin/${pptId}/status`, {
    method: "PATCH",
    body: { status },
  });
  if (res.error || !res.data) throw new Error(res.error || "Failed to update material status");
  return res.data;
}
