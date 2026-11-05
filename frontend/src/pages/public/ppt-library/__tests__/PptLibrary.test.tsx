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
  {
    id: "ppt-2",
    title: "Direct Cloud Overview",
    description: "Uploaded directly under Cloud Computing main topic.",
    topicId: "topic-1",
    subtopicId: null,
    instructorId: "inst-1",
    originalFileName: "cloud_overview.pdf",
    fileType: "pdf",
    storageKey: "/uploads/ppt-2/cloud_overview.pdf",
    mimeType: "application/pdf",
    fileSize: 1200000,
    thumbnailUrl: null,
    status: "published",
    language: "en",
    tags: ["cloud"],
    academicLevel: "Undergraduate",
    slideCount: null,
    pageCount: 10,
    downloadCount: 8,
    viewCount: 19,
    createdAt: new Date().toISOString(),
    topic: { id: "topic-1", name: "Cloud Computing", slug: "cloud-computing" },
    subtopic: null,
    instructor: { id: "inst-1", firstName: "Shoeb", lastName: "Ahmad", avatar: null },
  },
];

const mockTopics = [
  {
    id: "topic-1",
    name: "Cloud Computing",
    slug: "cloud-computing",
    description: "Cloud platforms, DevOps and architecture",
    icon: "Globe",
    resourceCount: 2,
    subtopics: [{ id: "sub-1", topicId: "topic-1", name: "DevOps", slug: "devops", resourceCount: 1 }],
  },
];

vi.mock("@/lib/pptLibrary/api", () => ({
  fetchLibraryResources: vi.fn((params?: any) => {
    let data = [...mockResources];
    if (params?.subtopicId) {
      data = data.filter((r) => r.subtopicId === params.subtopicId);
    }
    return Promise.resolve({
      data,
      pagination: { total: data.length, page: 1, limit: 12, totalPages: 1 },
    });
  }),
  fetchLibraryTopics: vi.fn(() => Promise.resolve(mockTopics)),
  getPptDownloadUrl: vi.fn((id: string) => `/api/ppt-library/${id}/download`),
  getPptPreviewUrl: vi.fn((id: string) => `/api/ppt-library/${id}/preview`),
  createTopic: vi.fn((data: any) => Promise.resolve({ success: true, data })),
  updateTopic: vi.fn(() => Promise.resolve({ success: true })),
  deleteTopic: vi.fn(() => Promise.resolve({ success: true, message: "Deleted" })),
  createSubtopic: vi.fn((data: any) => Promise.resolve({ success: true, data })),
  updateSubtopic: vi.fn(() => Promise.resolve({ success: true })),
  deleteSubtopic: vi.fn(() => Promise.resolve({ success: true, message: "Deleted" })),
  updatePptMetadata: vi.fn(() => Promise.resolve({ success: true })),
  deletePptResource: vi.fn(() => Promise.resolve({ success: true, message: "Deleted" })),
}));

vi.mock("@/store/userStore", () => ({
  useUserStore: () => ({ user: null }),
  isAdminRole: () => false,
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe("PptLibraryPage Hierarchical Public Browsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Level 1: renders page header, search bar, and main topics cards with subtopic and resource counts without leaking materials", async () => {
    renderWithClient(
      <MemoryRouter initialEntries={["/ppt-library"]}>
        <PptLibraryPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Study Materials/i)).toBeTruthy();
    expect(screen.getByText(/Main Topics & Categories/i)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getAllByText("Cloud Computing").length).toBeGreaterThan(0);
      expect(screen.getByText("1 Subtopic")).toBeTruthy();
      expect(screen.getByText("2 Materials")).toBeTruthy();
    });

    // Level 1 must not display material cards directly
    expect(screen.queryByText("Docker & Container Fundamentals")).toBeNull();
  });

  it("Level 2: navigates into main topic and shows subtopics and direct materials with breadcrumbs", async () => {
    renderWithClient(
      <MemoryRouter initialEntries={["/ppt-library?topicId=topic-1"]}>
        <PptLibraryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      // Breadcrumbs
      expect(screen.getByRole("button", { name: "Study Materials" })).toBeTruthy();
      expect(screen.getAllByRole("button", { name: "Cloud Computing" }).length).toBeGreaterThan(0);
    });

    // Subtopic listed (Matching Box 2 in diagram: CNN, ANN, DevOps...)
    expect(screen.getByText(/Subtopics in Cloud Computing/i)).toBeTruthy();
    expect(screen.getAllByText("DevOps").length).toBeGreaterThan(0);

    // Direct materials section
    expect(screen.getByText(/Direct Materials under Cloud Computing/i)).toBeTruthy();
    expect(screen.getByText("Direct Cloud Overview")).toBeTruthy();

    // Subtopic material is not shown on Level 2 until subtopic is clicked
    expect(screen.queryByText("Docker & Container Fundamentals")).toBeNull();
  });

  it("Level 3: navigates into subtopic and shows subtopic materials with preview and download actions", async () => {
    renderWithClient(
      <MemoryRouter initialEntries={["/ppt-library?topicId=topic-1&subtopicId=sub-1"]}>
        <PptLibraryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Docker & Container Fundamentals")).toBeTruthy();
    });

    // Subtopic banner
    expect(screen.getByRole("button", { name: "Back to Cloud Computing" })).toBeTruthy();
    expect(screen.getAllByText(/study material/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("DevOps").length).toBeGreaterThan(0);

    // Material card details
    expect(screen.getByText("24 slides")).toBeTruthy();
    expect(screen.getAllByText("Shoeb Ahmad").length).toBeGreaterThan(0);
    expect(screen.getAllByText("View Slides").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Download").length).toBeGreaterThan(0);
  });

  it("Search: renders global search results across materials with topic and subtopic breadcrumbs", async () => {
    renderWithClient(
      <MemoryRouter initialEntries={["/ppt-library?search=Docker"]}>
        <PptLibraryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Docker & Container Fundamentals")).toBeTruthy();
    });

    expect(screen.getByText(/Search Results for “Docker”/i)).toBeTruthy();
    expect(screen.getByText("View All Topics")).toBeTruthy();
  });
});
