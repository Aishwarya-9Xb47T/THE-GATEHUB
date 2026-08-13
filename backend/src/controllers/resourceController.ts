import { Request, Response } from "express";
import { marked } from "marked";
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import os from "os";
import { spawn, exec } from "child_process";
import { v4 as uuidv4 } from "uuid";
import katex from "katex";
import axios from "axios";
import { AuthRequest } from "../middlewares/auth.js";
import { prisma } from "../utils/prisma.js";
import { recordProjectVersion } from "../services/latexVersionService.js";
import { generateStructuredContent, compileLatexToHtml } from "../services/contentBlockParser.js";

// Create a new resource course
export const createResourceCourse = async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, thumbnail } = req.body;
    const instructorId = req.user!.id;

    // 1. Check if a course with the same title already exists for this instructor to prevent accidental duplicates
    const existing = await prisma.resourceCourse.findFirst({
      where: {
        title: title.trim(),
        instructorId
      }
    });

    if (existing) {
      return res.status(200).json(existing); // Return existing instead of creating new
    }

    // 2. Create the ResourceCourse
    const course = await prisma.resourceCourse.create({
      data: {
        title: title.trim(),
        description: description?.trim(),
        thumbnail: thumbnail?.trim() || undefined,
        instructorId,
      },
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // 3. IMPORTANT: Create a corresponding LatexProject so the editor can open it
    await prisma.latexProject.create({
      data: {
        id: course.id,
        title: title.trim(),
        ownerId: instructorId,
        files: {
          create: {
            name: 'main.tex',
            path: '/main.tex',
            content: `\\topic{${title.trim()}}\n\nWelcome to your new interactive learning resource!\n\n# Getting Started\n\nEdit this content using Markdown or LaTeX.\n\n\\begin{note}\nThis is a note block. You can use it to highlight important information.\n\\end{note}\n\n# Formulas\n\nYou can include math like this: $E = mc^2$ or display math:\n\n$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$\n\n# Media\n\nUpload images/videos and reference them:\n% \\includegraphics{my-image.png}\n% \\video{my-video.mp4}\n\n# Interactive Code\n\n\\begin{tryit}[javascript]{app.js}\nconsole.log("Hello from the interactive playground!");\n\\end{tryit}`,
            isFolder: false
          }
        }
      }
    });

    res.status(201).json(course);
  } catch (error) {
    console.error("Error creating resource course:", error);
    res.status(500).json({ error: "Failed to create resource course" });
  }
};

// Update a resource course
export const updateResourceCourse = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, thumbnail } = req.body;
    const instructorId = req.user!.id;

    const course = await prisma.resourceCourse.update({
      where: { 
        id,
        instructorId // Ensure owner is updating
      },
      data: {
        title: title?.trim(),
        description: description?.trim(),
        thumbnail: thumbnail?.trim(),
      },
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        content: {
          select: {
            updatedAt: true,
          },
        },
      },
    });

    res.json(course);
  } catch (error) {
    console.error("Error updating resource course:", error);
    res.status(500).json({ error: "Failed to update resource course" });
  }
};

// Get all resource courses (public) — Free Learning library only
export const getAllResourceCourses = async (req: Request, res: Response) => {
  try {
    const { filterUniversesForFreeLibrary, inferProductType, isFreeLearningProduct } = await import(
      "../services/productRoutingService.js"
    );

    const [publishedCourses, publishedUniverses] = await Promise.all([
      prisma.resourceCourse.findMany({
        where: { published: true },
        include: {
          instructor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          content: {
            select: {
              updatedAt: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.learningUniverse.findMany({
        where: { status: "published" },
        select: {
          id: true,
          title: true,
          description: true,
          subtitle: true,
          thumbnail: true,
          bannerUrl: true,
          updatedAt: true,
          structuredData: true,
          instructor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    ]);

    const freeUniverses = filterUniversesForFreeLibrary(publishedUniverses);
    const freeUniverseIds = new Set(freeUniverses.map((u) => u.id));

    const luBackedCourses = freeUniverses.map((u) => ({
      id: u.id,
      title: u.title,
      description: u.description || u.subtitle || "",
      thumbnail: u.bannerUrl || u.thumbnail,
      bannerUrl: u.bannerUrl || u.thumbnail,
      instructorId: u.instructor.id,
      published: true,
      createdAt: u.updatedAt,
      updatedAt: u.updatedAt,
      instructor: u.instructor,
      content: null,
      deliveryMode: "learning-universe" as const,
    }));

    const legacyCourses = publishedCourses
      .filter((course) => {
        if (!course.content) return false;
        if (freeUniverseIds.has(course.id)) return false;
        const linkedLu = publishedUniverses.find((u) => u.id === course.id);
        if (linkedLu && !isFreeLearningProduct(inferProductType(linkedLu.structuredData))) {
          return false;
        }
        return true;
      })
      .map((course) => {
        const linkedLu = publishedUniverses.find((u) => u.id === course.id);
        const banner = linkedLu?.bannerUrl || linkedLu?.thumbnail || course.thumbnail;
        return {
          ...course,
          thumbnail: banner,
          bannerUrl: linkedLu?.bannerUrl || banner,
          deliveryMode: "legacy-resource" as const,
        };
      });

    const merged = [...luBackedCourses, ...legacyCourses];
    const uniqueCourses = Array.from(new Map(merged.map((c) => [c.id, c])).values());

    res.json(uniqueCourses);
  } catch (error) {
    console.error("Error getting resource courses:", error);
    res.status(500).json({ error: "Failed to get resource courses" });
  }
};

// Toggle publish status of a resource course (free-learning legacy rows only)
export const togglePublishCourse = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const instructorId = req.user!.id;

    const course = await prisma.resourceCourse.findUnique({
      where: { id },
      include: { content: true },
    });

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    if (course.instructorId !== instructorId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const lu = await prisma.learningUniverse.findUnique({
      where: { id },
      select: { structuredData: true, status: true },
    });

    if (lu) {
      const { inferProductType, isFreeLearningProduct } = await import(
        "../services/productRoutingService.js"
      );
      const productType = inferProductType(lu.structuredData);
      if (!isFreeLearningProduct(productType)) {
        return res.status(422).json({
          error:
            "This product must be published through Academic Studio. Use the Learning Universe publish flow.",
        });
      }
      if (!course.published && lu.status !== "published") {
        return res.status(422).json({
          error: "Publish the Learning Universe from Academic Studio before listing in Free Learning.",
        });
      }
    }

    const updatedCourse = await prisma.resourceCourse.update({
      where: { id },
      data: {
        published: !course.published,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      published: updatedCourse.published,
      message: updatedCourse.published ? "Course published" : "Course unpublished",
    });
  } catch (error) {
    console.error("Error toggling course publish status:", error);
    res.status(500).json({ error: "Failed to toggle publish status" });
  }
};

// Get all resource courses for an instructor — Free Learning only
export const getInstructorResourceCourses = async (req: AuthRequest, res: Response) => {
  try {
    const instructorId = req.user!.id;
    const { filterUniversesForFreeLibrary } = await import("../services/productRoutingService.js");

    const [courses, universes] = await Promise.all([
      prisma.resourceCourse.findMany({
        where: { instructorId },
        include: {
          instructor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          content: {
            select: {
              updatedAt: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.learningUniverse.findMany({
        where: { instructorId },
        select: {
          id: true,
          title: true,
          description: true,
          subtitle: true,
          thumbnail: true,
          bannerUrl: true,
          updatedAt: true,
          status: true,
          structuredData: true,
          instructor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    const freeUniverses = filterUniversesForFreeLibrary(universes);
    const freeIds = new Set(freeUniverses.map((u) => u.id));

    const luBacked = freeUniverses.map((u) => ({
      id: u.id,
      title: u.title,
      description: u.description || u.subtitle || "",
      thumbnail: u.bannerUrl || u.thumbnail,
      bannerUrl: u.bannerUrl || u.thumbnail,
      instructorId: u.instructor.id,
      published: u.status === "published",
      createdAt: u.updatedAt,
      updatedAt: u.updatedAt,
      instructor: u.instructor,
      content: null,
      deliveryMode: "learning-universe" as const,
    }));

    const legacy = courses
      .filter((course) => course.content && !freeIds.has(course.id))
      .map((course) => ({
        ...course,
        deliveryMode: "legacy-resource" as const,
      }));

    const merged = [...luBacked, ...legacy];
    const uniqueCourses = Array.from(new Map(merged.map((c) => [c.id, c])).values());

    res.json(uniqueCourses);
  } catch (error) {
    console.error("Error getting instructor resource courses:", error);
    res.status(500).json({ error: "Failed to get resource courses" });
  }
};

// Get a single resource course
export const getResourceCourse = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const course = await prisma.resourceCourse.findUnique({
      where: { id },
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        content: true,
      },
    });

    if (!course) {
      return res.status(404).json({ error: "Resource course not found" });
    }

    res.json(course);
  } catch (error) {
    console.error("Error getting resource course:", error);
    res.status(500).json({ error: "Failed to get resource course" });
  }
};

// Save or update resource content
export const saveResourceContent = async (req: AuthRequest, res: Response) => {
  try {
    const { courseId, latexContent, projectFiles: clientFiles, assets: clientAssets, pdfUrl } = req.body;
    const userId = req.user!.id;

    // 1. Resolve Project/Course Identity
    let project = await prisma.latexProject.findUnique({
      where: { id: courseId },
      include: { owner: true }
    });

    let resourceCourse = await prisma.resourceCourse.findUnique({
      where: { id: courseId }
    });

    // 2. Ownership Verification
    if (project && project.ownerId !== userId) {
      return res.status(403).json({ error: "Unauthorized access to project" });
    }
    if (resourceCourse && resourceCourse.instructorId !== userId) {
      return res.status(403).json({ error: "Unauthorized access to resource" });
    }

    // 3. Ensure ResourceCourse exists
    if (!resourceCourse) {
      resourceCourse = await prisma.resourceCourse.create({
        data: {
          id: courseId,
          title: project?.title || "New Learning Resource",
          description: "Published from THE GATEHUB Editor",
          instructorId: userId
        }
      });
    }

    // 4. Update the main.tex content in LatexFile to ensure persistence for the editor
    if (latexContent) {
      let finalLatexContent = latexContent;
      
      // Clean up custom tokens for the LaTeX engine so the PDF looks clean
      finalLatexContent = finalLatexContent
        .replace(/VIDEO_START\s*([\s\S]*?)\s*VIDEO_END/gi, (match, filename) => {
          const file = filename.trim();
          const slug = file.split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '-');
          const frontendBase = (process.env.FRONTEND_URL || process.env.CLIENT_URL || "").replace(/\/$/, "");
          const videoBase = frontendBase || "";
          return `\\href{${videoBase}/resources/course/${courseId}/video/${slug}}{Watch Video: ${file}}`;
        })
        .replace(/IMAGE_START\s*([\s\S]*?)\s*IMAGE_END/gi, (match, filename) => {
          return `\\begin{center}\\includegraphics[width=0.8\\textwidth]{${filename.trim()}}\\end{center}`;
        })
        .replace(/(PYTHON|JAVASCRIPT|NODE)_PLAYGROUND_START\s*([\s\S]*?)\s*(?:EXPECTED_OUTPUT_START\s*([\s\S]*?)\s*EXPECTED_OUTPUT_END\s*)?_PLAYGROUND_END/gi, (match, lang, code, expected) => {
          let out = `\\begin{verbatim}\n${code.trim()}\n\\end{verbatim}`;
          if (expected) {
            out += `\n\\textbf{Expected Output:}\n\\begin{verbatim}\n${expected.trim()}\n\\end{verbatim}`;
          }
          return out;
        });

    const environments = ['pythoncode', 'javascriptcode', 'tryit', 'lstlisting'];
    let definitionsNeeded = '';
    
    environments.forEach(env => {
      if (finalLatexContent.includes(`\\begin{${env}}`) && !finalLatexContent.includes(`\\newenvironment{${env}}`)) {
        if (env === 'tryit') {
          definitionsNeeded += `\\ifdefined\\tryit\\else\\newenvironment{tryit}[2][]{\\verbatim}{\\endverbatim}\\fi\n`;
        } else if (env === 'lstlisting') {
          definitionsNeeded += `\\ifdefined\\lstlisting\\else\\newenvironment{lstlisting}[1][]{\\verbatim}{\\endverbatim}\\fi\n`;
        } else {
          definitionsNeeded += `\\ifdefined\\${env}\\else\\newenvironment{${env}}{\\verbatim}{\\endverbatim}\\fi\n`;
        }
      }
    });

    if (finalLatexContent.includes('\\video{') && !finalLatexContent.includes('\\newcommand{\\video}')) {
      const frontendBase = (process.env.FRONTEND_URL || process.env.CLIENT_URL || "").replace(/\/$/, "");
      definitionsNeeded += `\\ifdefined\\video\\else\\newcommand{\\video}[1]{\\href{${frontendBase}/resources/video/#1}{Watch Video}}\\fi\n`;
    }

    if (finalLatexContent.includes('\\includegraphics') && !finalLatexContent.includes('\\usepackage{graphicx}')) {
      definitionsNeeded += `\\usepackage{graphicx}\n`;
    }

    if (definitionsNeeded) {
      if (finalLatexContent.includes('\\begin{document}')) {
        const injection = `\\usepackage{verbatim}\n\\usepackage{hyperref}\n${definitionsNeeded}`;
        finalLatexContent = finalLatexContent.replace('\\begin{document}', `${injection}\n\\begin{document}`);
      }
    }

      const mainFile = await prisma.latexFile.findFirst({
        where: { projectId: courseId, name: 'main.tex' }
      });
      if (mainFile) {
        await prisma.latexFile.update({
          where: { id: mainFile.id },
          data: { content: finalLatexContent, updatedAt: new Date() }
        });
      }
    }

    // 5. Fetch all files and assets for the project to create a full snapshot
    const dbFiles = await prisma.latexFile.findMany({
      where: { projectId: courseId }
    });

    // 5b. Ensure all assets are copied to public resources folder for serving
    const publicResourcesDir = path.join(process.cwd(), 'uploads', 'resources');
    if (!fs.existsSync(publicResourcesDir)) {
      fs.mkdirSync(publicResourcesDir, { recursive: true });
    }

    const projectDir = path.join(process.cwd(), 'uploads', 'projects', courseId);
    for (const file of dbFiles) {
      if (!file.isFolder && file.s3Url) {
        const physicalFilename = path.basename(file.s3Url);
        const sourcePath = path.join(projectDir, physicalFilename);
        const destPath = path.join(publicResourcesDir, file.name); // Use logical name with spaces as requested
        
        if (fs.existsSync(sourcePath)) {
          try {
            fs.copyFileSync(sourcePath, destPath);
            console.log(`[ASSET-COPY] Copied ${file.name} to public resources`);
          } catch (err) {
            console.error(`[ASSET-COPY] Failed to copy ${file.name}:`, err);
          }
        }
      }
    }

    // 6. Generate compiled outputs for student view
    // We use the provided latexContent (which is the latest from editor)
    const compiledHtml = compileLatexToHtml(latexContent || "");
    const structuredContent = generateStructuredContent(latexContent || "");

    console.log(
      "VIDEO BLOCKS:",
      JSON.stringify(structuredContent, null, 2)
    )

    // 7. Prepare Snapshot Data
    const projectFilesSnapshot = dbFiles.map(f => ({
      id: f.id,
      name: f.name,
      path: f.path,
      isFolder: f.isFolder,
      content: f.id === (latexContent ? courseId : null) ? latexContent : f.content, // Use latest if it's the main file
      s3Url: f.s3Url,
      updatedAt: f.updatedAt
    }));

    // Detect videos in latexContent for metadata
    const videoMatches = latexContent?.match(/\\video\{([^}]+)\}/g) || [];
    const videoMetadata = videoMatches.map(match => {
      const filename = match.match(/\\video\{([^}]+)\}/)?.[1] || "";
      return {
        type: "video",
        filename: filename,
        url: `/uploads/resources/${encodeURIComponent(filename)}`
      };
    });

    const assetsSnapshot = dbFiles
      .filter(f => f.s3Url)
      .map(f => {
        const isVideo = ['.mp4', '.webm', '.mov'].includes(path.extname(f.name).toLowerCase());
        return {
          id: f.id,
          name: f.name,
          path: f.path,
          url: `/uploads/resources/${encodeURIComponent(f.name)}`,
          type: isVideo ? "video" : "image",
          updatedAt: f.updatedAt
        };
      });

    // 8. Final Upsert into ResourceContent
    const content = await prisma.resourceContent.upsert({
      where: { courseId },
      update: {
        latexContent: latexContent || "",
        compiledHtml,
        structuredContent: structuredContent as any,
        projectFiles: projectFilesSnapshot as any,
        assets: assetsSnapshot as any,
        pdfUrl: pdfUrl || null,
        updatedAt: new Date()
      },
      create: {
        courseId,
        latexContent: latexContent || "",
        compiledHtml,
        structuredContent: structuredContent as any,
        projectFiles: projectFilesSnapshot as any,
        assets: assetsSnapshot as any,
        pdfUrl: pdfUrl || null
      },
    });

    // 9. Update ResourceCourse updatedAt
    await prisma.resourceCourse.update({
      where: { id: courseId },
      data: { updatedAt: new Date() }
    });

    if (project && latexContent) {
      recordProjectVersion(courseId, latexContent, "resource-publish", {
        authorId: userId,
        resourceCourseId: courseId,
        publishType: "resource-publish",
      }).catch(() => {});
    }

    res.json({ success: true, content });
  } catch (error: any) {
    console.error("Error saving resource content:", error);
    res.status(500).json({ error: `Failed to save resource content: ${error.message}` });
  }
};

// Get resource content for a course
export const getResourceContent = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;

    const content = await prisma.resourceContent.findUnique({
      where: { courseId },
    });

    if (!content) {
      return res.status(404).json({ error: "Content not found" });
    }

    res.json(content);
  } catch (error) {
    console.error("Error getting resource content:", error);
    res.status(500).json({ error: "Failed to get resource content" });
  }
};

// Execute code using local child_process execution with educational feedback
export const executeCode = async (req: Request, res: Response) => {
  try {
    const { language, code, expectedOutput } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, error: "Code is required" });
    }

    const { executeEducationalCode } = await import("../services/codeExecutionService.js");
    const result = await executeEducationalCode({
      language: language || "python",
      code,
      expectedOutput,
    });

    return res.json({
      success: result.success,
      output: result.output,
      validationIssues: result.validationIssues,
      educationalError: result.educationalError,
      outputMatchesExpected: result.outputMatchesExpected,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error during code execution";
    console.error(`[EXECUTION-FAILED]: ${message}`);
    return res.status(500).json({
      success: false,
      output: message,
    });
  }
};

export const executeCodingLab = async (req: Request, res: Response) => {
  try {
    const { language, code, testCases, action } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, error: "Code is required" });
    }
    
    // Use new languageExecutionService
    const { executeCode } = await import("../services/codeExecution/languageExecutionService.js");
    const result = await executeCode({
      action: action || "run",
      language: language || "python",
      code,
      files: req.body.files,
      stdin: req.body.stdin,
      testCases: testCases || [],
      timeLimit: req.body.timeLimit,
      memoryLimit: req.body.memoryLimit,
    });
    
    return res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error during coding lab execution";
    console.error(`[CODING-LAB-EXEC-FAILED]: ${message}`);
    return res.status(500).json({
      success: false,
      output: message,
    });
  }
};

export const submitCodingLab = async (req: Request, res: Response) => {
  try {
    const { language, code, testCases, userId, learningUniverseId, publishVersionId, lessonId, stepId } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, error: "Code is required" });
    }
    
    // Use new languageExecutionService
    const { executeCode } = await import("../services/codeExecution/languageExecutionService.js");
    const result = await executeCode({
      action: "submit",
      language: language || "python",
      code,
      files: req.body.files,
      stdin: req.body.stdin,
      testCases: testCases || [],
      timeLimit: req.body.timeLimit,
      memoryLimit: req.body.memoryLimit,
    });

    if (userId && learningUniverseId && lessonId && stepId) {
      try {
        const { upsertStepProgress, recalculateCourseProgressFromSteps } = await import(
          "../services/learnerStepProgressService.js"
        );
        const scope = {
          userId,
          learningUniverseId,
          publishVersionId: publishVersionId || "preview",
        };
        await upsertStepProgress(scope, {
          lessonId,
          stepId,
          completed: result.success,
          visited: true,
          progress: result.testResults ? (result.testResults.filter((r: any) => r.passed).length / result.testResults.length) * 100 : 0,
          componentState: {
            code,
            lastExecutionTimeMs: result.executionTimeMs,
            lastMemoryUsageMb: result.memoryUsageMb,
            submittedAt: new Date().toISOString(),
          },
        });
        await recalculateCourseProgressFromSteps(scope);
      } catch (err) {
        console.warn("[CodingLab] Progress recording warning:", err);
      }
    }

    return res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error during coding lab submission";
    console.error(`[CODING-LAB-SUBMIT-FAILED]: ${message}`);
    return res.status(500).json({
      success: false,
      output: message,
    });
  }
};


// Delete a course and all associated project data
export const deleteCourse = async (req: AuthRequest, res: Response) => {
  try {
    const { courseId } = req.params;
    const userId = req.user!.id;

    const course = await prisma.resourceCourse.findUnique({
      where: { id: courseId },
      include: { content: true }
    });

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    if (course.instructorId !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // 1. Delete associated LatexProject (if exists)
    // This will cascade delete LatexFiles due to schema relations
    const project = await prisma.latexProject.findUnique({
      where: { id: courseId }
    });

    if (project) {
      await prisma.latexProject.delete({
        where: { id: courseId }
      });
      
      // 2. Clean up physical files in uploads/projects/{projectId}
      const projectDir = path.join(process.cwd(), 'uploads', 'projects', courseId);
      if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
      }
    }

    // 3. Delete ResourceCourse (cascades to ResourceContent)
    await prisma.resourceCourse.delete({
      where: { id: courseId }
    });

    res.json({ success: true, message: "Resource and all associated project data deleted permanently" });
  } catch (error: any) {
    console.error("Error deleting course:", error);
    res.status(500).json({ error: `Failed to delete course: ${error.message}` });
  }
};
