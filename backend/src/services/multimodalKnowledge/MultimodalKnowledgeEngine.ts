import { FormatDetector, FileInput } from './FormatDetector.js';
import { NativeExtractor } from './NativeExtractor.js';
import { FallbackOcrService } from './FallbackOcrService.js';
import { VisionUnderstandingEngine } from './VisionUnderstandingEngine.js';
import { MathCodeAnalyzer } from './MathCodeAnalyzer.js';
import { UniversalQuestionReasoner } from './UniversalQuestionReasoner.js';
import { KnowledgeGraphEngine } from './KnowledgeGraphEngine.js';
import { AiEnrichmentEngine } from './AiEnrichmentEngine.js';
import { OpenXmlNativeParser } from './OpenXmlNativeParser.js';
import { SemanticQuestionBlockAssociator } from './SemanticQuestionBlockAssociator.js';
import { StructuralEquivalenceValidator } from './StructuralEquivalenceValidator.js';
import { KnowledgeExtractionResult, DocumentSourceType } from './types.js';
import { UnifiedExtractionEngine } from '../extraction/UnifiedExtractionEngine.js';

export interface ExtractionOptions {
  enableOcrFallback?: boolean;
  enableAiEnrichment?: boolean;
  language?: string;
}

export class MultimodalKnowledgeEngine {
  /**
   * Main Entry Point - Process ANY educational content into ONE structured Knowledge Object
   */
  public static async process(
    input: FileInput,
    options?: ExtractionOptions
  ): Promise<KnowledgeExtractionResult> {
    const startTime = Date.now();
    console.log('=== MultimodalKnowledgeEngine.process ENTRY ===', { name: input.name, url: input.url });

    try {
      // Pass through UnifiedExtractionEngine
      const unifiedRes = await UnifiedExtractionEngine.process({
        buffer: input.buffer,
        fileName: input.name || 'Document',
        mimeType: input.mimeType,
        url: input.url,
      });

      // Stage 1 & 2: Format Detection & Source Routing
      const formatInfo = FormatDetector.detect(input);
      console.log('[Pipeline Stage 1 & 2] Format & Source Detected:', formatInfo);

      // Stage 3 & 4: Native Structural Extraction
      let nativeOutput = await NativeExtractor.extract(
        {
          buffer: input.buffer || Buffer.from(input.url || ''),
          name: input.name || 'Document',
          mimeType: input.mimeType || formatInfo.mimeType,
        },
        formatInfo.sourceType
      );

      console.log('[Pipeline Stage 3 & 4] Native Extraction Completed:', {
        pages: nativeOutput.pages.length,
        blocks: nativeOutput.blocks.length,
        isRasterized: nativeOutput.isRasterized,
      });

      // Stage 5: Precision Fallback OCR (Strictly LAST resort when rasterized)
      let ocrApplied = false;
      if ((formatInfo.isRasterized || nativeOutput.isRasterized) && options?.enableOcrFallback !== false) {
        console.log('[Pipeline Stage 5] Rasterized content detected. Activating Fallback OCR...');
        const ocrResult = await FallbackOcrService.processRasterizedContent(
          input.buffer || Buffer.from(''),
          { language: options?.language }
        );

        if (ocrResult.ocrApplied && ocrResult.extractedText.length > 0) {
          ocrApplied = true;
          nativeOutput.rawText += `\n${ocrResult.extractedText}`;
          nativeOutput.blocks.push(...ocrResult.blocks);
          nativeOutput.tables.push(...ocrResult.tables);
          nativeOutput.codeBlocks.push(...ocrResult.codeBlocks);
          nativeOutput.equations.push(...ocrResult.equations);
        }
      }

      // Stage 6: Vision Understanding Engine (Diagrams, Flowcharts, Charts)
      const visualOutput = VisionUnderstandingEngine.processVisuals(
        nativeOutput.rawText,
        nativeOutput.images
      );

      // Stage 7: Math & Code Structural Analyzer (20+ languages, LaTeX, MathML)
      const mathCodeOutput = MathCodeAnalyzer.analyze(
        nativeOutput.blocks,
        nativeOutput.rawText
      );

      const allCodeBlocks = [...nativeOutput.codeBlocks, ...mathCodeOutput.codeBlocks];
      const allEquations = [...nativeOutput.equations, ...mathCodeOutput.equations];

      // Stage 8 & 9: Universal Question, Dynamic Option & Signal Answer Detection
      const questions = UniversalQuestionReasoner.extractQuestions(
        nativeOutput.blocks,
        nativeOutput.rawText,
        nativeOutput.tables,
        visualOutput.images,
        allCodeBlocks,
        allEquations,
        nativeOutput.speakerNotes
      );

      console.log('[Pipeline Stage 8 & 9] Question & Answer Extraction Completed:', {
        questionsExtracted: questions.length,
      });

      // Stage 10: Relational Knowledge Graph Construction
      const knowledgeGraph = KnowledgeGraphEngine.buildGraph(
        nativeOutput.title,
        nativeOutput.blocks,
        questions,
        nativeOutput.tables,
        visualOutput.images,
        allCodeBlocks,
        allEquations
      );

      // Stage 11: Document Intelligence - OpenXML AST Tree & Semantic Question Association
      let documentTree;
      if ((formatInfo.sourceType === 'docx' || formatInfo.sourceType === 'pptx') && input.buffer) {
        documentTree = await OpenXmlNativeParser.parse(input.buffer, input.name || 'Doc', formatInfo.sourceType as any);
      }

      const semanticQuestionBlocks = documentTree ? SemanticQuestionBlockAssociator.associate(documentTree, questions) : [];
      const equivalenceReport = documentTree ? StructuralEquivalenceValidator.validateEquivalence(documentTree, semanticQuestionBlocks) : undefined;

      if (equivalenceReport) {
        console.log('[Pipeline Stage 11] Document Intelligence Equivalence Report:', {
          isStructurallyEquivalent: equivalenceReport.isStructurallyEquivalent,
          index: `${equivalenceReport.structuralEquivalenceIndex.toFixed(1)}%`,
        });
      }

      // Stage 12: AI Enrichment & Educational Metadata Generation
      const aiEnrichment = AiEnrichmentEngine.enrich(
        nativeOutput.title,
        nativeOutput.rawText,
        nativeOutput.blocks,
        questions,
        allCodeBlocks,
        allEquations
      );

      const processingTimeMs = Date.now() - startTime;

      console.log('=== MultimodalKnowledgeEngine.process EXIT ===', {
        success: true,
        processingTimeMs: `${processingTimeMs}ms`,
        questionsExtracted: questions.length,
      });

      return {
        success: true,
        sourceType: formatInfo.sourceType,
        fileName: input.name,
        document: {
          title: nativeOutput.title,
          pageCount: nativeOutput.pages.length,
          pages: nativeOutput.pages,
          sections: nativeOutput.sections,
        },
        blocks: nativeOutput.blocks,
        tables: nativeOutput.tables,
        images: visualOutput.images,
        codeBlocks: allCodeBlocks,
        equations: allEquations,
        diagrams: visualOutput.diagrams,
        charts: visualOutput.charts,
        questions,
        knowledgeGraph,
        aiEnrichment,
        ocrApplied,
        processingTimeMs,
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      console.error('=== MultimodalKnowledgeEngine.process ERROR ===', error);
      return {
        success: false,
        sourceType: (input.name?.split('.').pop() || 'txt') as DocumentSourceType,
        fileName: input.name,
        document: {
          title: input.name || 'Error',
          pageCount: 0,
          pages: [],
          sections: [],
        },
        blocks: [],
        tables: [],
        images: [],
        codeBlocks: [],
        equations: [],
        diagrams: [],
        charts: [],
        questions: [],
        knowledgeGraph: { nodes: [], edges: [] },
        aiEnrichment: {
          summary: '',
          keywords: [],
          flashcards: [],
          quizSuggestions: [],
          learningObjectives: [],
          prerequisites: [],
          difficulty: 'beginner',
          studyNotes: '',
          revisionNotes: '',
        },
        ocrApplied: false,
        processingTimeMs,
        error: error instanceof Error ? error.message : 'Unknown extraction error',
      };
    }
  }
}
