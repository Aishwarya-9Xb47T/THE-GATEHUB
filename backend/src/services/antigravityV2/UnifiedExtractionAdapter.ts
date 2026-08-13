import { AntiGravityV2Engine, AntiGravityV2Options } from './AntiGravityV2Engine.js';
import { AntiGravityV2Result, V2QuestionBlock, V2TableNode, V2CodeNode, V2MathNode, V2ImageNode, V2ASTNode } from './types.js';

export interface UnifiedFileInput {
  name: string;
  buffer: Buffer;
  mimeType?: string;
}

export class UnifiedExtractionAdapter {
  /**
   * Main entry point for ALL applications across THE GATEHUB
   */
  public static async extract(input: UnifiedFileInput, options?: AntiGravityV2Options): Promise<AntiGravityV2Result> {
    return await AntiGravityV2Engine.processDocument(input, options);
  }

  /**
   * Adapter for Quiz Builder & Flashcards
   */
  public static async extractQuizQuestions(input: UnifiedFileInput): Promise<V2QuestionBlock[]> {
    const res = await this.extract(input);
    return res.questions;
  }

  /**
   * Adapter for Search & Multimodal Knowledge Base
   */
  public static async extractKnowledgeItems(input: UnifiedFileInput): Promise<{
    title: string;
    rawText: string;
    blocks: V2ASTNode[];
    tables: V2TableNode[];
    codeBlocks: V2CodeNode[];
    equations: V2MathNode[];
    images: V2ImageNode[];
    graph: any;
  }> {
    const res = await this.extract(input);
    return {
      title: res.document.title,
      rawText: res.blocks.map(b => (b as any).plainText || '').join('\n'),
      blocks: res.blocks,
      tables: res.tables,
      codeBlocks: res.codeBlocks,
      equations: res.equations,
      images: res.images,
      graph: res.knowledgeGraph,
    };
  }

  /**
   * Adapter for Presentations & Classroom Studio
   */
  public static async extractPresentationSlides(input: UnifiedFileInput) {
    const res = await this.extract(input);
    return res.document.pages;
  }
}
