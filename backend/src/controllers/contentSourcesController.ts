/**
 * Content Sources Controller
 * 
 * Controller for processing content from various sources (PDF, DOCX, Google Docs, etc.)
 * All sources are unified into an AssessmentDocument.
 */

import type { Request, Response } from 'express';
import { AppError } from '../middlewares/errorHandler.js';
import type { AuthRequest } from '../middlewares/auth.js';
import { contentSourceAdapterFactory } from '../services/content-sources/index.js';
import type { SourceData, AssessmentDocument } from '../services/content-sources/ContentSourceAdapter.js';

/**
 * Process content from a source
 */
export async function processContent(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, 'Unauthorized');
  
  const { provider, sourceType, sourceData } = req.body;
  
  if (!provider || !sourceType || !sourceData) {
    throw new AppError(400, 'Missing required fields: provider, sourceType, sourceData');
  }
  
  // Build SourceData object
  let sourceDataObj: SourceData;
  
  if (provider === 'local') {
    // Local file upload
    if (sourceType === 'paste-text') {
      sourceDataObj = {
        type: 'text',
        data: sourceData.text,
        metadata: { title: sourceData.title || 'Pasted Text' },
      };
    } else {
      // File upload (PDF, DOCX, etc.)
      sourceDataObj = {
        type: 'file',
        data: sourceData.file,
        metadata: { filename: sourceData.filename },
      };
    }
  } else {
    // Cloud provider (Google, OneDrive, etc.)
    sourceDataObj = {
      type: 'provider-file',
      data: {
        providerId: provider,
        fileId: sourceData.fileId,
      },
      metadata: { fileName: sourceData.fileName },
    };
  }
  
  try {
    // Process content using the appropriate adapter
    const assessmentDocument = await contentSourceAdapterFactory.process(sourceDataObj, req.user.id);
    
    // Store the job in database (simplified - in production, use a proper job system)
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    res.json({
      success: true,
      data: {
        jobId,
        assessmentDocument,
      },
    });
  } catch (error) {
    console.error('Content processing error:', error);
    
    // Return user-friendly error message
    const errorMessage = error instanceof Error ? error.message : 'Failed to process content';
    
    if (errorMessage.includes('No adapter found')) {
      throw new AppError(400, 'Unsupported file type');
    }
    
    if (errorMessage.includes('provider not registered')) {
      throw new AppError(400, 'Provider not available');
    }
    
    throw new AppError(500, "We couldn't read this document");
  }
}

/**
 * Get available content source types
 */
export async function getSourceTypes(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, 'Unauthorized');
  
  const adapters = contentSourceAdapterFactory.getAll();
  
  const sourceTypes = adapters.map(adapter => ({
    id: adapter.adapterId,
    name: adapter.adapterName,
    supportedSourceTypes: adapter.supportedSourceTypes,
  }));
  
  res.json({ success: true, data: sourceTypes });
}
