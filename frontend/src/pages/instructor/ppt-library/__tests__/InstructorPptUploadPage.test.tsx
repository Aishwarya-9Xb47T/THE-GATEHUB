import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { InstructorPptUploadPage } from "../InstructorPptUploadPage";

// Mock API responses
const mockTopics = [
  {
    id: "topic-1",
    name: "Programming",
    slug: "programming",
    description: "Core coding concepts",
    displayOrder: 1,
    isActive: true,
    subtopics: [
      { id: "sub-1", topicId: "topic-1", name: "Python", slug: "python", isActive: true, displayOrder: 1 },
      { id: "sub-2", topicId: "topic-1", name: "Java", slug: "java", isActive: true, displayOrder: 2 },
    ],
  },
  {
    id: "topic-2",
    name: "Artificial Intelligence",
    slug: "artificial-intelligence",
    description: "Machine learning and AI",
    displayOrder: 2,
    isActive: true,
    subtopics: [
      { id: "sub-3", topicId: "topic-2", name: "Machine Learning", slug: "ml", isActive: true, displayOrder: 1 },
    ],
  },
];

vi.mock("@/lib/pptLibrary/api", () => ({
  fetchLibraryTopics: vi.fn(() => Promise.resolve(mockTopics)),
  fetchTopicSubtopics: vi.fn((topicId: string) => {
    const found = mockTopics.find((t) => t.id === topicId);
    return Promise.resolve(found?.subtopics || []);
  }),
  createTopic: vi.fn((data: any) =>
    Promise.resolve({
      success: true,
      data: { id: "topic-new", name: data.name, slug: "new-topic", isActive: true, displayOrder: 3, subtopics: [] },
    })
  ),
  createSubtopic: vi.fn((data: any) =>
    Promise.resolve({
      success: true,
      data: { id: "sub-new", topicId: data.topicId, name: data.name, slug: "new-subtopic", isActive: true, displayOrder: 3 },
    })
  ),
  uploadPptResource: vi.fn(() =>
    Promise.resolve({
      success: true,
      data: { id: "res-1", title: "Test Document" },
    })
  ),
}));

vi.mock("@/store/userStore", () => ({
  useUserStore: () => ({
    user: {
      id: "inst-1",
      name: "Professor Turing",
      role: "instructor",
      instructorApprovalStatus: "APPROVED",
    },
    isLoading: false,
  }),
  isAdminRole: () => false,
  isInstructorApproved: () => true,
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

describe("InstructorPptUploadPage Unified Topic-Building Workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Unified Study Material Builder with all 4 core sections", async () => {
    renderWithClient(<InstructorPptUploadPage />);

    // Header & badge
    expect(screen.getByText("Unified Study Material Builder")).toBeTruthy();
    expect(screen.getByText("Create Topic & Upload Materials")).toBeTruthy();

    // Section 1: Main Topic
    expect(screen.getByText("1. Main Topic")).toBeTruthy();
    expect(screen.getByPlaceholderText(/e.g. Deep Learning/i)).toBeTruthy();

    // Section 2: Main Topic Materials (Direct Upload)
    expect(screen.getByText(/2. Main Topic Materials \(Direct Upload\)/i)).toBeTruthy();

    // Section 3: Subtopics & Modules
    expect(screen.getByText(/3. Subtopics & Modules/i)).toBeTruthy();

    // Section 4: Settings & Publish bar
    expect(screen.getByText("Publish Entire Topic")).toBeTruthy();
  });

  it("allows adding multiple subtopics (e.g. CNN, ANN, RNN)", async () => {
    renderWithClient(<InstructorPptUploadPage />);

    // Initial has 1 subtopic
    const subtopicTitleInputs = screen.getAllByPlaceholderText(/e.g. CNN, ANN, RNN/i);
    expect(subtopicTitleInputs.length).toBe(1);

    // Click "+ Add Subtopic"
    const addButtons = screen.getAllByText("Add Subtopic");
    fireEvent.click(addButtons[0]);

    // Should now have 2 subtopics
    await waitFor(() => {
      const inputs = screen.getAllByPlaceholderText(/e.g. CNN, ANN, RNN/i);
      expect(inputs.length).toBe(2);
    });

    // Fill titles for both
    const inputs = screen.getAllByPlaceholderText(/e.g. CNN, ANN, RNN/i);
    fireEvent.change(inputs[0], { target: { value: "CNN" } });
    fireEvent.change(inputs[1], { target: { value: "ANN" } });

    expect((inputs[0] as HTMLInputElement).value).toBe("CNN");
    expect((inputs[1] as HTMLInputElement).value).toBe("ANN");
  });

  it("switches to Add to Existing Topic mode and shows category dropdown", async () => {
    renderWithClient(<InstructorPptUploadPage />);

    const existingBtn = screen.getByText("Add to Existing Topic");
    fireEvent.click(existingBtn);

    await waitFor(() => {
      expect(screen.getByText(/Select Existing Topic/i)).toBeTruthy();
      expect(screen.getByRole("option", { name: /Programming/i })).toBeTruthy();
    });
  });
});
