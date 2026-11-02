import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import JSZip from "jszip";

// Set required JWT_SECRET before any imports
process.env.JWT_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const mockPrisma = {
  $transaction: jest.fn(async (arg: any) => {
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    if (typeof arg === "function") {
      return arg(mockPrisma);
    }
    return arg;
  }),
  pPTTopic: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  pPTSubtopic: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  pPTResource: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  pPTResourceFile: {
    findUnique: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
  },
  pPTResourceVersion: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  pPTDownloadLog: {
    create: jest.fn(),
    count: jest.fn(),
  },
};

jest.unstable_mockModule("../../utils/prisma.js", () => ({
  prisma: mockPrisma,
}));

const {
  slugify,
  detectSlideCount,
  createTopic,
  createSubtopic,
  deleteTopic,
  deleteSubtopic,
  listTopics,
  listSubtopicsByTopic,
  ensureInitialPptCategories,
  uploadAndCreateResource,
  replaceResourceFile,
  recordDownload,
  listResources,
} = await import("../pptLibraryService.js");

describe("PPT Library Service Core Functionality", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Slug generation and naming utilities", () => {
    it("generates URL-safe lowercase slugs with hyphens", () => {
      expect(slugify("Computer Networks & Protocols")).toBe("computer-networks-protocols");
      expect(slugify("  Advanced   Database   Systems   ")).toBe("advanced-database-systems");
      expect(slugify("C++ / Object Oriented Programming 101!")).toBe("c-object-oriented-programming-101");
    });
  });

  describe("Topic and Subtopic Management", () => {
    it("creates a topic with automatically formatted slug", async () => {
      (mockPrisma.pPTTopic.findFirst as any).mockResolvedValue(null);
      (mockPrisma.pPTTopic.create as any).mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "topic-1", ...data })
      );

      const topic = await createTopic({
        name: "Cloud Computing",
        description: "Everything on AWS, Azure, GCP",
      });

      expect(topic.slug).toBe("cloud-computing");
      expect(mockPrisma.pPTTopic.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Cloud Computing",
            slug: "cloud-computing",
          }),
        })
      );
    });

    it("creates a subtopic linked to its parent topic", async () => {
      (mockPrisma.pPTTopic.findUnique as any).mockResolvedValue({ id: "topic-1", name: "Cloud Computing" });
      (mockPrisma.pPTSubtopic.findFirst as any).mockResolvedValue(null);
      (mockPrisma.pPTSubtopic.create as any).mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "sub-1", ...data })
      );

      const subtopic = await createSubtopic({
        topicId: "topic-1",
        name: "Kubernetes & Containers",
      });

      expect(subtopic.slug).toBe("kubernetes-containers");
      expect(subtopic.topicId).toBe("topic-1");
    });

    it("prevents deleting a topic if active resources depend on it", async () => {
      (mockPrisma.pPTTopic.findUnique as any).mockResolvedValue({
        id: "topic-1",
        name: "Cloud Computing",
        _count: { resources: 3 },
      });

      await expect(deleteTopic("topic-1")).rejects.toThrow(
        'Cannot delete topic "Cloud Computing" because it contains 3 presentation(s)'
      );
      expect(mockPrisma.pPTTopic.delete).not.toHaveBeenCalled();
    });

    it("prevents deleting a subtopic if active resources depend on it", async () => {
      (mockPrisma.pPTSubtopic.findUnique as any).mockResolvedValue({
        id: "sub-1",
        name: "Kubernetes & Containers",
        _count: { resources: 2 },
      });

      await expect(deleteSubtopic("sub-1")).rejects.toThrow(
        'Cannot delete subtopic "Kubernetes & Containers" because it contains 2 presentation(s)'
      );
      expect(mockPrisma.pPTSubtopic.delete).not.toHaveBeenCalled();
    });

    it("allows deleting topic when no presentations are linked", async () => {
      (mockPrisma.pPTTopic.findUnique as any).mockResolvedValue({
        id: "topic-empty",
        name: "Empty Topic",
        _count: { resources: 0 },
      });
      (mockPrisma.pPTTopic.delete as any).mockResolvedValue({ id: "topic-empty" });

      const result = await deleteTopic("topic-empty");
      expect(result.success).toBe(true);
      expect(mockPrisma.pPTTopic.delete).toHaveBeenCalledWith({ where: { id: "topic-empty" } });
    });

    it("seeds initial categories idempotently if topics are missing", async () => {
      (mockPrisma.pPTTopic.findFirst as any).mockResolvedValue(null);
      (mockPrisma.pPTTopic.create as any).mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `topic-${data.slug}`, ...data })
      );
      (mockPrisma.pPTSubtopic.findFirst as any).mockResolvedValue(null);
      (mockPrisma.pPTSubtopic.create as any).mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `sub-${data.slug}`, ...data })
      );

      const stats = await ensureInitialPptCategories();
      expect(stats.topicsCreated).toBe(6);
      expect(stats.subtopicsCreated).toBeGreaterThanOrEqual(25);
    });

    it("lists subtopics by parent topic", async () => {
      (mockPrisma.pPTSubtopic.findMany as any).mockResolvedValue([
        { id: "sub-1", topicId: "topic-1", name: "Python", slug: "python", _count: { resources: 2 } },
        { id: "sub-2", topicId: "topic-1", name: "Java", slug: "java", _count: { resources: 0 } },
      ]);

      const subtopics = await listSubtopicsByTopic("topic-1");
      expect(subtopics.length).toBe(2);
      expect(subtopics[0].name).toBe("Python");
      expect(mockPrisma.pPTSubtopic.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { topicId: "topic-1", isActive: true },
        })
      );
    });
  });

  describe("Presentation Upload, ZIP Inspection, and Slide Counting", () => {
    it("extracts slide count from a real pptx zip buffer and creates resource", async () => {
      // Build a minimal mock .pptx zip buffer with 3 slide xmls
      const zip = new JSZip();
      zip.file("ppt/presentation.xml", "<p:presentation/>");
      zip.file("ppt/slides/slide1.xml", "<p:sld/>");
      zip.file("ppt/slides/slide2.xml", "<p:sld/>");
      zip.file("ppt/slides/slide3.xml", "<p:sld/>");
      const pptxBuffer = await zip.generateAsync({ type: "nodebuffer" });

      const count = await detectSlideCount(pptxBuffer, "test.pptx");
      expect(count).toBe(3);

      (mockPrisma.pPTSubtopic.findFirst as any).mockResolvedValue({ id: "sub-1", topicId: "topic-1" });
      (mockPrisma.pPTResource.create as any).mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: "res-101",
          ...data,
          topic: { id: "topic-1", name: "Cloud Computing", slug: "cloud-computing" },
          subtopic: { id: "sub-1", name: "Containers", slug: "containers" },
          instructor: { id: "inst-1", firstName: "Jane", lastName: "Doe" },
        })
      );
      (mockPrisma.pPTResourceFile.create as any).mockResolvedValue({ id: "file-1" });
      (mockPrisma.pPTResourceVersion.create as any).mockResolvedValue({ id: "ver-1" });

      const mockFile = {
        buffer: pptxBuffer,
        originalname: "docker-essentials.pptx",
        mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        size: pptxBuffer.length,
      } as Express.Multer.File;

      const result = await uploadAndCreateResource({
        file: mockFile,
        title: "Docker Essentials",
        description: "Fundamentals of containerization",
        topicId: "topic-1",
        subtopicId: "sub-1",
        instructorId: "inst-1",
        targetAudience: "beginners",
        tags: ["docker", "devops"],
      });

      expect(result.slideCount).toBe(3);
      expect(result.originalFileName).toBe("docker-essentials.pptx");
      expect(mockPrisma.pPTResourceFile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bytes: pptxBuffer,
            size: pptxBuffer.length,
          }),
        })
      );
      expect(mockPrisma.pPTResourceVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            versionNumber: 1,
            changeNote: "Initial upload",
          }),
        })
      );
    });

    it("handles legacy .ppt files gracefully with slideCount null/0 and proper extension", async () => {
      const dummyPptBuffer = Buffer.from("DUMMY_LEGACY_PPT_BINARY_DATA");

      const count = await detectSlideCount(dummyPptBuffer, "legacy.ppt");
      expect(count).toBeNull();

      (mockPrisma.pPTSubtopic.findFirst as any).mockResolvedValue({ id: "sub-1", topicId: "topic-1" });
      (mockPrisma.pPTResource.create as any).mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: "res-102",
          ...data,
          topic: { id: "topic-1", name: "Cloud Computing", slug: "cloud-computing" },
          subtopic: { id: "sub-1", name: "Containers", slug: "containers" },
          instructor: { id: "inst-1", firstName: "Jane", lastName: "Doe" },
        })
      );
      (mockPrisma.pPTResourceFile.create as any).mockResolvedValue({ id: "file-2" });
      (mockPrisma.pPTResourceVersion.create as any).mockResolvedValue({ id: "ver-1" });

      const mockFile = {
        buffer: dummyPptBuffer,
        originalname: "legacy_net.ppt",
        mimetype: "application/vnd.ms-powerpoint",
        size: dummyPptBuffer.length,
      } as Express.Multer.File;

      const result = await uploadAndCreateResource({
        file: mockFile,
        title: "Legacy Networking",
        description: "Networking slides",
        topicId: "topic-1",
        subtopicId: "sub-1",
        instructorId: "inst-1",
      });

      expect(result.originalFileName).toBe("legacy_net.ppt");
      expect(result.slideCount).toBeNull();
    });
  });

  describe("File Replacement & Version History", () => {
    it("increments version number and creates version record when replacing presentation file", async () => {
      const zip = new JSZip();
      zip.file("ppt/slides/slide1.xml", "<p:sld/>");
      const newBuffer = await zip.generateAsync({ type: "nodebuffer" });

      const currentResource = {
        id: "res-101",
        version: 1,
        instructorId: "inst-1",
        storageKey: "/uploads/ppt-library/res-101/v1.pptx",
        fileSize: 2048,
        slideCount: 1,
        originalFileName: "old_presentation.pptx",
        versions: [{ versionNumber: 1 }],
      };

      (mockPrisma.pPTResource.findUnique as any).mockResolvedValue(currentResource);
      (mockPrisma.pPTResource.update as any).mockImplementation(({ data }: any) =>
        Promise.resolve({ ...currentResource, ...data, version: 2 })
      );
      (mockPrisma.pPTResourceFile.upsert as any).mockResolvedValue({ resourceId: "res-101" });
      (mockPrisma.pPTResourceVersion.create as any).mockResolvedValue({ id: "ver-2" });

      const mockFile = {
        buffer: newBuffer,
        originalname: "updated_presentation.pptx",
        mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        size: newBuffer.length,
      } as Express.Multer.File;

      const updated = await replaceResourceFile(
        "res-101",
        mockFile,
        "inst-1",
        "instructor",
        "Fixed typo on slide 3"
      );

      expect(mockPrisma.pPTResourceVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            resourceId: "res-101",
            versionNumber: 2,
            changeNote: "Fixed typo on slide 3",
          }),
        })
      );
      expect(mockPrisma.pPTResourceFile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { resourceId: "res-101" },
          update: expect.objectContaining({
            bytes: newBuffer,
          }),
        })
      );
    });

    it("rejects unauthorized file replacement by non-owner when not admin", async () => {
      const currentResource = {
        id: "res-101",
        version: 1,
        instructorId: "inst-1",
        versions: [{ versionNumber: 1 }],
      };
      (mockPrisma.pPTResource.findUnique as any).mockResolvedValue(currentResource);

      const mockFile = {
        buffer: Buffer.from("test"),
        originalname: "test.pptx",
        mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        size: 4,
      } as Express.Multer.File;

      await expect(
        replaceResourceFile("res-101", mockFile, "inst-other", "instructor")
      ).rejects.toThrow("You do not have permission to replace this presentation");
    });
  });

  describe("Download Tracking and Logging", () => {
    it("increments download counter and logs user details", async () => {
      (mockPrisma.pPTResource.update as any).mockResolvedValue({ id: "res-101", downloadCount: 5 });
      (mockPrisma.pPTDownloadLog.create as any).mockResolvedValue({ id: "log-1" });

      await recordDownload(
        "res-101",
        "student-1",
        "192.168.1.1",
        "Mozilla/5.0"
      );

      expect(mockPrisma.pPTResource.update).toHaveBeenCalledWith({
        where: { id: "res-101" },
        data: { downloadCount: { increment: 1 } },
      });
      expect(mockPrisma.pPTDownloadLog.create).toHaveBeenCalledWith({
        data: {
          resourceId: "res-101",
          userId: "student-1",
          ipAddress: "192.168.1.1",
          userAgent: "Mozilla/5.0",
        },
      });
    });
  });

  describe("Query and Filter Rules", () => {
    it("filters by published status for public/student requests", async () => {
      (mockPrisma.pPTResource.findMany as any).mockResolvedValue([]);
      (mockPrisma.pPTResource.count as any).mockResolvedValue(0);

      await listResources({
        status: "published",
        search: "Cloud",
      });

      expect(mockPrisma.pPTResource.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([{ status: "published" }]),
          }),
        })
      );
    });
  });
});
