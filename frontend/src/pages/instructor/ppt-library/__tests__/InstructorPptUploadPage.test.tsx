import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InstructorPptUploadPage } from "../InstructorPptUploadPage";

const mockTopics = [
  {
    id: "topic-prog",
    name: "Programming",
    slug: "programming",
    description: "Core programming",
    displayOrder: 1,
    isActive: true,
    subtopics: [],
  },
  {
    id: "topic-ai",
    name: "Artificial Intelligence",
    slug: "artificial-intelligence",
    description: "AI & ML",
    displayOrder: 2,
    isActive: true,
    subtopics: [],
  },
];

const mockSubtopics = [
  { id: "sub-py", topicId: "topic-prog", name: "Python", slug: "python", displayOrder: 1, isActive: true },
  { id: "sub-java", topicId: "topic-prog", name: "Java", slug: "java", displayOrder: 2, isActive: true },
];

vi.mock("@/lib/pptLibrary/api", () => ({
  fetchLibraryTopics: vi.fn(() => Promise.resolve(mockTopics)),
  fetchTopicSubtopics: vi.fn((topicId: string) => {
    if (topicId === "topic-prog") return Promise.resolve(mockSubtopics);
    return Promise.resolve([]);
  }),
  createTopic: vi.fn((data: any) =>
    Promise.resolve({
      success: true,
      data: { id: "topic-new", name: data.name, slug: "new-topic", displayOrder: 99, isActive: true, subtopics: [] },
    })
  ),
  createSubtopic: vi.fn((data: any) =>
    Promise.resolve({
      success: true,
      data: { id: "sub-new", topicId: data.topicId, name: data.name, slug: "new-sub", displayOrder: 99, isActive: true },
    })
  ),
  uploadPptResource: vi.fn(),
  getPptDownloadUrl: (id: string) => `/api/ppt-library/${id}/download`,
}));

vi.mock("@/store/userStore", () => ({
  useUserStore: () => ({
    user: {
      id: "inst-1",
      role: "instructor",
      firstName: "Jane",
      lastName: "Doe",
      instructorApprovalStatus: "APPROVED",
    },
    isAuthenticated: true,
  }),
  isAdminRole: () => false,
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("InstructorPptUploadPage Category and Subtopic Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads categories from backend and renders them in the topic dropdown", async () => {
    renderWithClient(<InstructorPptUploadPage />);

    // Page title and form header
    expect(screen.getByText("Upload Presentation")).toBeTruthy();

    // Verify categories appear in dropdown
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Programming" })).toBeTruthy();
      expect(screen.getByRole("option", { name: "Artificial Intelligence" })).toBeTruthy();
    });
  });

  it("populates subtopics when a topic is selected", async () => {
    renderWithClient(<InstructorPptUploadPage />);

    // Initial topic auto-selects Programming
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Python" })).toBeTruthy();
      expect(screen.getByRole("option", { name: "Java" })).toBeTruthy();
    });
  });

  it("shows category action buttons for approved instructors", async () => {
    renderWithClient(<InstructorPptUploadPage />);

    expect(screen.getByText("New Category")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("Add Subtopic")).toBeTruthy();
    });
  });
});
