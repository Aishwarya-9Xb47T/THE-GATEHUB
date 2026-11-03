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

describe("InstructorPptUploadPage Category, Subtopic and File Selection Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads categories from backend and renders them in the topic dropdown", async () => {
    renderWithClient(<InstructorPptUploadPage />);

    // Page title and form header
    expect(screen.getByText("Upload Study Material")).toBeTruthy();

    // Verify categories appear in dropdown
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Programming" })).toBeTruthy();
      expect(screen.getByRole("option", { name: "Artificial Intelligence" })).toBeTruthy();
    });
  });

  it("populates subtopics when a topic is selected", async () => {
    renderWithClient(<InstructorPptUploadPage />);

    // Initial topic auto-selects Programming and shows subtopics immediately
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Python" })).toBeTruthy();
      expect(screen.getByRole("option", { name: "Java" })).toBeTruthy();
    });
  });

  it("shows category action buttons for approved instructors", async () => {
    renderWithClient(<InstructorPptUploadPage />);

    expect(screen.getByText("New Category")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("New Subtopic")).toBeTruthy();
    });
  });

  it("allows switching between PowerPoint and PDF upload modes", async () => {
    renderWithClient(<InstructorPptUploadPage />);

    const pdfCard = screen.getByText("PDF Document");
    expect(pdfCard).toBeTruthy();
    fireEvent.click(pdfCard);

    // Verify button text updates to PDF mode
    expect(screen.getByText("Upload & Publish PDF")).toBeTruthy();
  });
});
