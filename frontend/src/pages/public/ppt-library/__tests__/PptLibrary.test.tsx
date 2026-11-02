import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PptLibraryPage } from "../PptLibraryPage";

const mockTopics = [
  {
    id: "topic-1",
    name: "Cloud Computing",
    slug: "cloud-computing",
    description: "Cloud computing and architecture",
    displayOrder: 1,
    isActive: true,
    subtopics: [
      { id: "sub-1", topicId: "topic-1", name: "Kubernetes", slug: "kubernetes", displayOrder: 1, isActive: true },
    ],
  },
];

const mockResources = [
  {
    id: "ppt-1",
    title: "Docker & Container Fundamentals",
    description: "Master containers and images from scratch",
    topicId: "topic-1",
    subtopicId: "sub-1",
    instructorId: "inst-1",
    originalFileName: "docker-fundamentals.pptx",
    storageKey: "/uploads/ppt-library/ppt-1/docker.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    fileSize: 4500000,
    slideCount: 24,
    status: "published",
    language: "en",
    tags: ["docker", "containers"],
    downloadCount: 42,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    topic: { id: "topic-1", name: "Cloud Computing", slug: "cloud-computing" },
    subtopic: { id: "sub-1", name: "Kubernetes", slug: "kubernetes" },
    instructor: { id: "inst-1", firstName: "Shoeb", lastName: "Ahmad", email: "shoeb@thegatehub.com", role: "instructor" },
  },
];

vi.mock("@/lib/pptLibrary/api", () => ({
  fetchLibraryTopics: vi.fn(() => Promise.resolve(mockTopics)),
  fetchLibraryResources: vi.fn(() =>
    Promise.resolve({
      data: mockResources,
      pagination: {
        total: 1,
        page: 1,
        limit: 12,
        totalPages: 1,
      },
    })
  ),
  downloadResourceBlob: vi.fn(),
  getPptDownloadUrl: (id: string) => `/api/ppt-library/${id}/download`,
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "student-1", role: "student", firstName: "Alex", lastName: "Smith" },
    isAuthenticated: true,
  }),
}));

describe("PptLibraryPage Public Browsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page header, topics filter, and presentation cards", async () => {
    render(
      <MemoryRouter>
        <PptLibraryPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/PPT Library/i)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("Docker & Container Fundamentals")).toBeTruthy();
    });

    expect(screen.getAllByText("Cloud Computing").length).toBeGreaterThan(0);
    expect(screen.getByText("24 slides")).toBeTruthy();
    expect(screen.getByText("Shoeb Ahmad")).toBeTruthy();
    expect(screen.getByText("View PPT")).toBeTruthy();
    expect(screen.getByText("Download")).toBeTruthy();
  });
});
