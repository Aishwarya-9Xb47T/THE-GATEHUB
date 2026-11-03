import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { PptLibraryPage } from "../PptLibraryPage";

// Mock API
const mockResources = [
  {
    id: "ppt-1",
    title: "Docker & Container Fundamentals",
    description: "Deep dive into container architectures.",
    topicId: "topic-1",
    subtopicId: "sub-1",
    instructorId: "inst-1",
    originalFileName: "docker_mastery.pptx",
    fileType: "pptx",
    storageKey: "/uploads/ppt-1/docker_mastery.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    fileSize: 4500000,
    thumbnailUrl: null,
    status: "published",
    language: "en",
    tags: ["docker", "devops"],
    academicLevel: "Undergraduate",
    slideCount: 24,
    pageCount: null,
    downloadCount: 15,
    viewCount: 42,
    createdAt: new Date().toISOString(),
    topic: { id: "topic-1", name: "Cloud Computing", slug: "cloud-computing" },
    subtopic: { id: "sub-1", name: "DevOps", slug: "devops" },
    instructor: { id: "inst-1", firstName: "Shoeb", lastName: "Ahmad", avatar: null },
  },
];

const mockTopics = [
  {
    id: "topic-1",
    name: "Cloud Computing",
    slug: "cloud-computing",
    resourceCount: 1,
    subtopics: [{ id: "sub-1", name: "DevOps", slug: "devops", resourceCount: 1 }],
  },
];

vi.mock("@/lib/pptLibrary/api", () => ({
  fetchLibraryResources: vi.fn(() =>
    Promise.resolve({
      data: mockResources,
      pagination: { total: 1, page: 1, limit: 12, totalPages: 1 },
    })
  ),
  fetchLibraryTopics: vi.fn(() => Promise.resolve(mockTopics)),
  getPptDownloadUrl: vi.fn((id: string) => `/api/ppt-library/${id}/download`),
  getPptPreviewUrl: vi.fn((id: string) => `/api/ppt-library/${id}/preview`),
}));

vi.mock("@/store/userStore", () => ({
  useUserStore: () => ({ user: null }),
  isAdminRole: () => false,
}));

describe("PptLibraryPage Public Browsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page header, topics filter, and material cards", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <PptLibraryPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText(/Study Materials/i)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("Docker & Container Fundamentals")).toBeTruthy();
    });

    expect(screen.getAllByText("Cloud Computing").length).toBeGreaterThan(0);
    expect(screen.getByText("24 slides")).toBeTruthy();
    expect(screen.getByText("Shoeb Ahmad")).toBeTruthy();
    expect(screen.getByText("View Slides")).toBeTruthy();
    expect(screen.getByText("Download")).toBeTruthy();
  });
});
