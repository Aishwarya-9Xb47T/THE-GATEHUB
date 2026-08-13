import { UploadRouter, V2FileInput } from './01_UploadRouter.js';
import { NativeParserEngine } from './02_NativeParserEngine.js';
import { LayoutEngine } from './03_LayoutEngine.js';
import { VisionEngine } from './04_VisionEngine.js';
import { OcrEngine } from './05_OcrEngine.js';
import { MathematicalEngine } from './06_MathematicalEngine.js';
import { CodeEngine } from './07_CodeEngine.js';
import { TableEngine } from './08_TableEngine.js';
import { DiagramEngine } from './09_DiagramEngine.js';
import { QuestionUnderstandingEngine } from './10_QuestionUnderstandingEngine.js';
import { KnowledgeGraphEngine } from './11_KnowledgeGraphEngine.js';
import { ValidationEngine, V2ExpectedMetrics } from './12_ValidationEngine.js';
import { UiMapper } from './13_UiMapper.js';
import { JsonOutputEngine } from './14_JsonOutputEngine.js';
import { AntiGravityV2Result, V2ImageNode } from './types.js';
import { UnifiedExtractionEngine } from '../extraction/UnifiedExtractionEngine.js';

export interface AntiGravityV2Options {
  enableOcrFallback?: boolean;
  language?: string;
  expectedMetrics?: V2ExpectedMetrics;
}

export class AntiGravityV2Engine {
  /**
   * Main Entry Point - Process ANY document through unified extraction pipeline
   */
  public static async processDocument(
    input: V2FileInput,
    options?: AntiGravityV2Options
  ): Promise<AntiGravityV2Result> {
    const startTime = Date.now();
    console.log('=== AntiGravityV2Engine.processDocument ENTRY ===', { name: input.name });

    try {
      // Delegate parsing & extraction to UnifiedExtractionEngine
      const unifiedRes = await UnifiedExtractionEngine.process({
        buffer: input.buffer,
        fileName: input.name || 'document',
        mimeType: input.mimeType,
      });

      // Stage 1: Upload Router & Format Sniffing
      const formatInfo = await UploadRouter.routeInput(input);

      // Stage 2: Native Parser Engine
      const nativeOutput = await NativeParserEngine.parse(
        input.buffer || Buffer.from(''),
        input.name || 'Document',
        formatInfo.format
      );
      console.log('[Stage 2] Native Parser Completed:', { pages: nativeOutput.pages.length, blocks: nativeOutput.blocks.length });

      // Stage 3: Layout Engine
      const layoutOutput = LayoutEngine.analyzeLayout(nativeOutput.blocks, nativeOutput.rawText);

      // Stage 4: Vision Engine — include native embedded images from parser blocks
      const nativeImages = nativeOutput.blocks.filter((b) => b.type === 'image') as V2ImageNode[];
      const visualOutput = VisionEngine.processVisuals(nativeOutput.rawText, nativeImages);

      // Stage 5: OCR Engine (Strict LAST Fallback)
      let ocrApplied = false;
      if (nativeOutput.isRasterized && options?.enableOcrFallback !== false && input.buffer) {
        console.log('[Stage 5] Content is rasterized. Activating Fallback OCR Engine strictly LAST...');
        const ocrRes = await OcrEngine.runOcr(input.buffer, options?.language);
        if (ocrRes.ocrApplied && ocrRes.extractedText) {
          ocrApplied = true;
          nativeOutput.rawText += `\n${ocrRes.extractedText}`;
          nativeOutput.blocks.push(...ocrRes.blocks);
        }
      }

      // Stage 6: Mathematical Engine
      const nativeMath = nativeOutput.blocks.filter(b => b.type === 'math') as V2MathNode[];
      const regexMath = MathematicalEngine.processMath(nativeOutput.rawText);
      const equations = [...nativeMath, ...regexMath];

      // Stage 7: Code Engine
      const codeBlocks = CodeEngine.processCode(nativeOutput.rawText, nativeOutput.blocks);

      // Stage 8: Table Engine
      const tables = TableEngine.processTables(nativeOutput.tables, nativeOutput.rawText);

      // Stage 9: Diagram Engine
      const diagrams = DiagramEngine.processDiagrams(visualOutput.diagrams);

      // Stage 10: Non-Regex Question Understanding Engine
      const questions = QuestionUnderstandingEngine.extractQuestions(
        nativeOutput.blocks,
        nativeOutput.rawText,
        tables,
        visualOutput.images,
        codeBlocks,
        equations,
        diagrams,
        visualOutput.charts,
        nativeOutput.comments,
        nativeOutput.speakerNotes
      );
      console.log('[Stage 10] Question Reasoning Completed:', { questionsCount: questions.length });

      // Stage 11: Knowledge Graph Engine
      const knowledgeGraph = KnowledgeGraphEngine.buildGraph(
        nativeOutput.title,
        questions,
        tables,
        visualOutput.images,
        codeBlocks,
        equations,
        diagrams
      );

      // Stage 12: Validation Engine (Zero-Placeholder Auditor)
      const preliminaryResult: Partial<AntiGravityV2Result> = {
        format: formatInfo.format,
        fileName: input.name,
        document: {
          title: nativeOutput.title,
          pageCount: nativeOutput.pages.length,
          pages: nativeOutput.pages,
          sections: [{ id: 'sec_v2_main', title: 'Document Body', level: 1, children: nativeOutput.blocks }],
        },
        blocks: nativeOutput.blocks,
        tables,
        images: visualOutput.images,
        codeBlocks,
        equations,
        diagrams,
        charts: visualOutput.charts,
        questions,
        knowledgeGraph,
      };

      const validation = ValidationEngine.validate(preliminaryResult, options?.expectedMetrics);
      console.log('[Stage 12] Validation Engine:', { passed: validation.passed, accuracyScore: `${validation.accuracyScore}%` });

      const processingTimeMs = Date.now() - startTime;

      const finalResult: AntiGravityV2Result = {
        ...preliminaryResult as AntiGravityV2Result,
        success: true,
        validation,
        processingTimeMs,
      };

      console.log('=== AntiGravityV2Engine.processDocument EXIT ===', {
        processingTimeMs: `${processingTimeMs}ms`,
        questionsExtracted: questions.length,
      });

      return finalResult;
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      console.error('=== AntiGravityV2Engine.processDocument ERROR ===', error);
      return {
        success: false,
        format: 'txt',
        fileName: input.name,
        document: { title: input.name || 'Error', pageCount: 0, pages: [], sections: [] },
        blocks: [],
        tables: [],
        images: [],
        codeBlocks: [],
        equations: [],
        diagrams: [],
        charts: [],
        questions: [],
        knowledgeGraph: { nodes: [], edges: [] },
        validation: {
          passed: false,
          accuracyScore: 0,
          isStructurallyEquivalent: false,
          placeholderFound: false,
          placeholderMatches: [],
          discrepancies: [error instanceof Error ? error.message : 'Unknown error'],
          metrics: { expected: {}, actual: {} },
        },
        processingTimeMs,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
