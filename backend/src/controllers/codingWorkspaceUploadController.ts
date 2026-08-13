/**
 * Coding Workspace Upload Controller
 * Handles file uploads and ZIP extraction for multi-file projects.
 * Handles GitHub repository imports.
 * Preserves uploaded files byte-for-byte - no modification.
 */
import { Request, Response } from 'express';
// @ts-ignore - adm-zip types not available, using any
import AdmZip from 'adm-zip';
import axios from 'axios';
import type { CodingWorkspaceBlock } from '../services/aiCourseArchitect/schemas/lessonBlockSchemas.js';

interface UploadedFile {
  name: string;
  size: number;
  path: string;
  content: string;
}

interface GitHubImportConfig {
  repository: string;
  branch?: string;
  commit?: string;
  path?: string;
}

/**
 * Handle single file upload for coding workspace
 */
export const uploadWorkspaceFile = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const file = req.file as Express.Multer.File;
    
    // Read file content as-is (no modification)
    const content = file.buffer.toString('utf-8');

    const uploadedFile: UploadedFile = {
      name: file.originalname,
      size: file.size,
      path: file.originalname,
      content,
    };

    return res.json({
      success: true,
      file: uploadedFile,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to upload file';
    console.error(`[CODING WORKSPACE UPLOAD ERROR]: ${message}`);
    return res.status(500).json({
      success: false,
      error: message,
    });
  }
};

/**
 * Handle ZIP file upload and extraction for multi-file projects
 * Uses adm-zip for proper ZIP extraction
 */
export const uploadWorkspaceZip = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No ZIP file uploaded' });
    }

    const file = req.file as Express.Multer.File;
    
    // Extract files from ZIP using adm-zip (preserving content exactly)
    const zip = new AdmZip(file.buffer);
    const zipEntries = zip.getEntries();
    
    const extractedFiles: UploadedFile[] = [];
    const zipStructure: Array<{ path: string; size: number; isDirectory: boolean }> = [];
    
    for (const entry of zipEntries) {
      const entryPath = entry.entryName;
      
      // Skip directory entries (they end with /)
      if (entry.isDirectory) {
        zipStructure.push({
          path: entryPath,
          size: 0,
          isDirectory: true,
        });
        continue;
      }
      
      // Read file content as-is (no modification)
      const content = entry.getData().toString('utf-8');
      
      extractedFiles.push({
        name: entryPath.split('/').pop() || entryPath,
        size: entry.header?.size || 0,
        path: entryPath,
        content,
      });
      
      zipStructure.push({
        path: entryPath,
        size: entry.header?.size || 0,
        isDirectory: false,
      });
    }

    return res.json({
      success: true,
      files: extractedFiles,
      zipStructure,
      count: extractedFiles.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to extract ZIP file';
    console.error(`[CODING WORKSPACE ZIP ERROR]: ${message}`);
    return res.status(500).json({
      success: false,
      error: message,
    });
  }
};

/**
 * Handle GitHub repository import
 */
export const importGitHubRepository = async (req: Request, res: Response) => {
  try {
    const { repository, branch, commit, path } = req.body as GitHubImportConfig;
    
    if (!repository) {
      return res.status(400).json({ success: false, error: 'Repository is required' });
    }
    
    // Validate repository format (owner/repo)
    const repoPattern = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/;
    if (!repoPattern.test(repository)) {
      return res.status(400).json({ success: false, error: 'Invalid repository format. Use owner/repo format' });
    }
    
    // Use GitHub API to get repository contents
    const githubToken = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
    };
    
    if (githubToken) {
      headers['Authorization'] = `token ${githubToken}`;
    }
    
    const ref = commit || branch || 'main';
    const apiUrl = `https://api.github.com/repos/${repository}/contents/${path || ''}?ref=${ref}`;
    
    const response = await axios.get(apiUrl, { headers });
    
    if (response.status !== 200) {
      return res.status(response.status).json({
        success: false,
        error: `GitHub API error: ${response.statusText}`,
      });
    }
    
    const data = response.data;
    const extractedFiles: UploadedFile[] = [];
    
    if (Array.isArray(data)) {
      // Directory - recursively fetch files
      for (const item of data) {
        if (item.type === 'file') {
          try {
            const fileResponse = await axios.get(item.url, { headers });
            const fileData = fileResponse.data;
            const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
            
            extractedFiles.push({
              name: item.name,
              size: item.size,
              path: item.path,
              content,
            });
          } catch (err) {
            console.error(`Failed to fetch file ${item.path}:`, err);
          }
        }
      }
    } else if (data.type === 'file') {
      // Single file
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      extractedFiles.push({
        name: data.name,
        size: data.size,
        path: data.path,
        content,
      });
    }
    
    return res.json({
      success: true,
      files: extractedFiles,
      count: extractedFiles.length,
      githubConfig: {
        repository,
        branch,
        commit,
        path,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to import GitHub repository';
    console.error(`[CODING WORKSPACE GITHUB IMPORT ERROR]: ${message}`);
    return res.status(500).json({
      success: false,
      error: message,
    });
  }
};

/**
 * Handle multiple file uploads
 */
export const uploadWorkspaceFiles = async (req: Request, res: Response) => {
  try {
    if (!req.files || !Array.isArray(req.files)) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const files = req.files as Express.Multer.File[];
    
    const uploadedFiles: UploadedFile[] = files.map((file) => ({
      name: file.originalname,
      size: file.size,
      path: file.originalname,
      content: file.buffer.toString('utf-8'),
    }));

    return res.json({
      success: true,
      files: uploadedFiles,
      count: uploadedFiles.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to upload files';
    console.error(`[CODING WORKSPACE FILES ERROR]: ${message}`);
    return res.status(500).json({
      success: false,
      error: message,
    });
  }
};

/**
 * Validate uploaded files for coding workspace
 */
export const validateWorkspaceFiles = async (req: Request, res: Response) => {
  try {
    const { files } = req.body;

    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ success: false, error: 'Invalid files array' });
    }

    const validationResults = files.map((file: any) => {
      const errors: string[] = [];
      
      if (!file.path) errors.push('Missing file path');
      if (file.content === undefined || file.content === null) errors.push('Missing file content');
      
      // Check for authoring syntax (reject if found)
      if (file.content && containsAuthoringSyntax(file.content)) {
        errors.push('Authoring syntax detected in file content');
      }
      
      return {
        path: file.path,
        valid: errors.length === 0,
        errors,
      };
    });

    const allValid = validationResults.every((r) => r.valid);

    return res.json({
      success: allValid,
      results: validationResults,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to validate files';
    console.error(`[CODING WORKSPACE VALIDATION ERROR]: ${message}`);
    return res.status(500).json({
      success: false,
      error: message,
    });
  }
};

/**
 * Check for authoring syntax in content
 */
function containsAuthoringSyntax(content: string): boolean {
  const patterns = [
    /\\theory\{/,
    /\\section\{/,
    /\\title\{/,
    /graph LR/,
    /graph TD/,
    /flowchart TD/,
    /flowchart LR/,
    /\{\{/,
    /\[\[/,
    /title=/,
    /body=/,
    /```mermaid/,
    /```latex/,
    /```markdown/,
  ];
  return patterns.some((pattern) => pattern.test(content));
}
