// import { ImportEngine } from "../import/ImportEngine.js"; // TODO: ImportEngine does not exist yet
import { ContentInput, SourceType, ContentSource } from "../import/unifiedTypes.js";
import { AppError } from "../../../middlewares/errorHandler.js";
import { DocumentIntelligenceAdapter } from "../import/extractors/DocumentIntelligenceAdapter.js";

/** Bridge AI studio sources to unified import engine. */
export async function extractRawContent(params: {
  source: SourceType;
  userId: string;
  buffer?: Buffer;
  mimeType?: string;
  text?: string;
  url?: string;
  fileName?: string;
}): Promise<string> {
  const { source, userId, buffer, mimeType, text, url, fileName } = params;

  // Use DocumentIntelligenceAdapter for DOCX files when enabled
  if (source === SourceType.DOCX && buffer && DocumentIntelligenceAdapter.shouldUseDocumentIntelligence()) {
    try {
      console.log('[aiContentBridge] Using DocumentIntelligenceAdapter for DOCX extraction');
      const questions = await DocumentIntelligenceAdapter.extract({
        buffer,
        name: fileName || 'file.docx',
        mimeType: mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      
      // Return a summary of extracted content for AI generation
      const content = questions.map(q => q.text).join('\n\n');
      console.log('[aiContentBridge] DocumentIntelligenceAdapter extracted:', {
        questionCount: questions.length,
        contentLength: content.length,
      });
      return content;
    } catch (error) {
      console.error('[aiContentBridge] DocumentIntelligenceAdapter failed, falling back:', error);
      // Fall through to old pipeline
    }
  }

  const contentSource = source;

  const input: ContentInput = {
    source: contentSource === SourceType.GOOGLE_DOCS || contentSource === SourceType.GOOGLE_FORMS
      ? ContentSource.GOOGLE_DOCS
      : contentSource === SourceType.YOUTUBE || contentSource === SourceType.WEBSITE
        ? ContentSource.URL
        : ContentSource.FILE,
    url,
    googleAccessToken: undefined, // AI studio doesn't have OAuth tokens
    file: buffer ? {
      name: fileName || 'file',
      mimeType: mimeType || 'application/octet-stream',
      buffer,
      size: buffer.length,
    } : undefined,
  };

  try {
    if (buffer) {
      if (source === SourceType.PDF || mimeType?.includes("pdf")) {
        const { extractTextFromPdf } = await import("../import/textExtractors.js");
        return await extractTextFromPdf(buffer);
      }
      if (source === SourceType.DOCX || mimeType?.includes("wordprocessingml")) {
        const { extractTextFromDocx } = await import("../import/textExtractors.js");
        return await extractTextFromDocx(buffer);
      }
      if (source === SourceType.PPTX || mimeType?.includes("presentationml")) {
        const { extractTextFromPptx } = await import("../import/textExtractors.js");
        return await extractTextFromPptx(buffer);
      }
      if (source === SourceType.IMAGE || mimeType?.startsWith("image/")) {
        const { extractTextFromImage } = await import("../import/textExtractors.js");
        return await extractTextFromImage(buffer, mimeType || "image/png");
      }
    }
    return text || "";
  } catch (error) {
    if (error instanceof AppError) throw error;
    return text || "";
  }
}
