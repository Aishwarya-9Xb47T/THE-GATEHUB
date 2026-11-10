import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { PptLibraryPage } from "../PptLibraryPage";

// Mock API data mirroring real hierarchical structures:
// topic-1 ("Cloud Computing"): has 1 direct material (ppt-2) + 2 subtopics ("DevOps" -> ppt-1, "Kubernetes" -> ppt-3) + 1 empty subtopic ("Serverless")
// topic-2 ("Deep Learning"): has NO direct materials + 2 subtopics ("CNN" -> ppt-4, "ANN" -> ppt-5)
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
  {
    id: "ppt-3",
    title: "Kubernetes Pod Scheduling",
    description: "Cluster orchestration slides.",
    topicId: "topic-1",
    subtopicId: "sub-2",
    instructorId: "inst-1",
    originalFileName: "k8s_pods.pptx",
    fileType: "pptx",
    storageKey: "/uploads/ppt-3/k8s_pods.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    fileSize: 2200000,
    thumbnailUrl: null,
    status: "published",
    language: "en",
    tags: ["k8s"],
    academicLevel: "Undergraduate",
    slideCount: 18,
    pageCount: null,
    downloadCount: 4,
    viewCount: 11,
    createdAt: new Date().toISOString(),
    topic: { id: "topic-1", name: "Cloud Computing", slug: "cloud-computing" },
    subtopic: { id: "sub-2", name: "Kubernetes", slug: "kubernetes" },
    instructor: { id: "inst-1", firstName: "Shoeb", lastName: "Ahmad", avatar: null },
  },
  {
    id: "ppt-4",
    title: "CNN Architecture",
    description: "Convolutional layers and pooling.",
    topicId: "topic-2",
    subtopicId: "sub-cnn",
    instructorId: "inst-1",
    originalFileName: "cnn_arch.pdf",
    fileType: "pdf",
    storageKey: "/uploads/ppt-4/cnn_arch.pdf",
    mimeType: "application/pdf",
    fileSize: 980000,
    thumbnailUrl: null,
    status: "published",
    language: "en",
    tags: ["cnn"],
    academicLevel: "Undergraduate",
    slideCount: null,
    pageCount: 12,
    downloadCount: 10,
    viewCount: 25,
    createdAt: new Date().toISOString(),
    topic: { id: "topic-2", name: "Deep Learning", slug: "deep-learning" },
    subtopic: { id: "sub-cnn", name: "CNN", slug: "cnn" },
    instructor: { id: "inst-1", firstName: "Shoeb", lastName: "Ahmad", avatar: null },
  },
  {
    id: "ppt-5",
    title: "ANN Backpropagation",
    description: "Artificial neural networks.",
    topicId: "topic-2",
    subtopicId: "sub-ann",
    instructorId: "inst-1",
    originalFileName: "ann_backprop.pptx",
    fileType: "pptx",
    storageKey: "/uploads/ppt-5/ann_backprop.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    fileSize: 1500000,
    thumbnailUrl: null,
    status: "published",
    language: "en",
    tags: ["ann"],
    academicLevel: "Undergraduate",
    slideCount: 16,
    pageCount: null,
    downloadCount: 7,
    viewCount: 14,
    createdAt: new Date().toISOString(),
    topic: { id: "topic-2", name: "Deep Learning", slug: "deep-learning" },
    subtopic: { id: "sub-ann", name: "ANN", slug: "ann" },
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
    resourceCount: 3,
    subtopics: [
      { id: "sub-1", topicId: "topic-1", name: "DevOps", slug: "devops", resourceCount: 1 },
      { id: "sub-2", topicId: "topic-1", name: "Kubernetes", slug: "kubernetes", resourceCount: 1 },
      { id: "sub-empty", topicId: "topic-1", name: "Serverless", slug: "serverless", resourceCount: 0 },
    ],
  },
  {
    id: "topic-2",
    name: "Deep Learning",
    slug: "deep-learning",
    description: "Neural networks and deep architectures",
    icon: "Brain",
    resourceCount: 2,
    subtopics: [
      { id: "sub-cnn", topicId: "topic-2", name: "CNN", slug: "cnn", resourceCount: 1 },
      { id: "sub-ann", topicId: "topic-2", name: "ANN", slug: "ann", resourceCount: 1 },
    ],
  },
];

vi.mock("@/lib/pptLibrary/api", () => ({
  fetchLibraryResources: vi.fn((params?: any) => {
    let data = [...mockResources];
    if (params?.topicId) {
      data = data.filter((r) => r.topicId === params.topicId);
    }
    if (params?.subtopicId) {
      if (params.subtopicId === "null" || params.subtopicId === "none") {
        data = data.filter((r) => !r.subtopicId);
      } else {
        data = data.filter((r) => r.subtopicId === params.subtopicId);
      }
    }
    if (params?.search) {
      const q = params.search.toLowerCase();
      data = data.filter((r) => r.title.toLowerCase().includes(q));
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

  it("Level 1: renders page header, search bar, and main topics horizontal rows with subtopic and resource counts without leaking materials", async () => {
    renderWithClient(
      <MemoryRouter initialEntries={["/ppt-library"]}>
        <PptLibraryPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Study Materials/i)).toBeTruthy();
    expect(screen.getByText(/Main Topics & Categories/i)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getAllByText("Cloud Computing").length).toBeGreaterThan(0);
      expect(screen.getByText("3 Subtopics")).toBeTruthy();
      expect(screen.getByText("3 Materials")).toBeTruthy();
    });

    // Level 1 must not display material rows directly
    expect(screen.queryByText("Docker & Container Fundamentals")).toBeNull();
    expect(screen.queryByText("Direct Cloud Overview")).toBeNull();
  });

  it("Level 2: shows Main Topic Materials strictly BEFORE Subtopics when direct materials exist, without mixing subtopic docs", async () => {
    renderWithClient(
      <MemoryRouter initialEntries={["/ppt-library?topicId=topic-1"]}>
        <PptLibraryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      // Breadcrumbs
      expect(screen.getByRole("button", { name: "Study Materials" })).toBeTruthy();
      expect(screen.getAllByRole("button", { name: "Cloud Computing" }).length).toBeGreaterThan(0);
      expect(screen.getByText("Direct Cloud Overview")).toBeTruthy();
    });

    const mainMaterialsHeading = screen.getByText(/Main Topic Materials/i);
    const subtopicsHeading = screen.getByText(/Subtopics in Cloud Computing/i);

    expect(screen.getByText(/Direct Materials under Cloud Computing/i)).toBeTruthy();
    expect(screen.getAllByText("DevOps").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Kubernetes").length).toBeGreaterThan(0);

    // STRICT ORDER CHECK: Main Topic Materials MUST appear before Subtopics in the DOM
    const positionRelation = mainMaterialsHeading.compareDocumentPosition(subtopicsHeading);
    expect(positionRelation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Subtopic materials must NEVER appear on Level 2
    expect(screen.queryByText("Docker & Container Fundamentals")).toBeNull();
    expect(screen.queryByText("Kubernetes Pod Scheduling")).toBeNull();
  });

  it("Level 2 (No Direct Materials): completely hides Main Topic Materials section and shows Subtopics first", async () => {
    renderWithClient(
      <MemoryRouter initialEntries={["/ppt-library?topicId=topic-2"]}>
        <PptLibraryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Subtopics in Deep Learning/i)).toBeTruthy();
    });

    expect(screen.queryByText(/Main Topic Materials/i)).toBeNull();
    expect(screen.getByText("CNN")).toBeTruthy();
    expect(screen.getByText("ANN")).toBeTruthy();
    expect(screen.queryByText("CNN Architecture")).toBeNull();
    expect(screen.queryByText("ANN Backpropagation")).toBeNull();
  });

  it("Level 3: navigates into subtopic and shows ONLY that subtopic's materials (never direct materials or sibling subtopic materials)", async () => {
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

    // Strictly ONLY DevOps document appears; Direct Cloud Overview and Kubernetes Pod Scheduling MUST NOT appear
    expect(screen.queryByText("Direct Cloud Overview")).toBeNull();
    expect(screen.queryByText("Kubernetes Pod Scheduling")).toBeNull();

    // Material row details
    expect(screen.getByText("24 slides")).toBeTruthy();
    expect(screen.getAllByText("Shoeb Ahmad").length).toBeGreaterThan(0);
    expect(screen.getAllByText("View Slides").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Download").length).toBeGreaterThan(0);
  });

  it("Level 3 (Sibling & Empty Subtopics): ANN shows only ANN docs; Serverless shows proper empty state", async () => {
    const { unmount } = renderWithClient(
      <MemoryRouter initialEntries={["/ppt-library?topicId=topic-2&subtopicId=sub-ann"]}>
        <PptLibraryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("ANN Backpropagation")).toBeTruthy();
    });
    expect(screen.queryByText("CNN Architecture")).toBeNull();
    unmount();

    renderWithClient(
      <MemoryRouter initialEntries={["/ppt-library?topicId=topic-1&subtopicId=sub-empty"]}>
        <PptLibraryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/No study materials in Serverless yet/i)).toBeTruthy();
    });
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
