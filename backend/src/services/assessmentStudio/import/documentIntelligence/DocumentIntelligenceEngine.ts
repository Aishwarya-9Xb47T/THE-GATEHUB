import { VisionUnderstanding } from './VisionUnderstanding.js';
import { DocumentGraphConstructor } from './DocumentGraphConstructor.js';
import { DocumentGraph } from './DocumentGraph.js';
import { EducationalGraphBuilder } from './EducationalGraphBuilder.js';
import { SemanticReconstructor } from './SemanticReconstructor.js';
import { MetadataPreserver } from './MetadataPreserver.js';
import { WorkingMemorySystem } from './WorkingMemory.js';
import { EducationalObjectOwnership } from './EducationalObjectOwnership.js';
import { QuizBuilderReconstructor } from './QuizBuilderReconstructor.js';
import {
  DocumentGraph as DocumentGraphType,
  QuestionObject,
  ExportOutput,
  AgentInput,
  AgentOutput,
  WorkingMemory,
} from './types.js';
import { QuestionObjectAssembler } from './agents/QuestionObjectAssembler.js';
import { VisualDiffValidator } from './VisualDiffValidator.js';

export class DocumentIntelligenceEngine {
  private documentGraph: DocumentGraph | null;
  private workingMemory: WorkingMemory;
  private processingHistory: Array<{
    phase: string;
    timestamp: Date;
    success: boolean;
    duration: number;
    metadata?: Record<string, any>;
  }>;

  constructor() {
    this.documentGraph = null;
    this.workingMemory = this.initializeWorkingMemory();
    this.processingHistory = [];
  }

  /**
   * Main entry point - process document end-to-end through the 12-stage pipeline
   */
  async processDocument(
    file: { buffer: Buffer; name: string; mimeType: string }
  ): Promise<{
    success: boolean;
    documentGraph?: DocumentGraphType;
    educationalObjectGraph?: any;
    visionOutput?: any;
    questions?: QuestionObject[];
    export?: ExportOutput;
    error?: string;
    processingTime: number;
  }> {
    const startTime = Date.now();
    console.log('=== DocumentIntelligenceEngine.processDocument ENTRY ===');
    console.log('EXECUTING PIPELINE: Parser -> Layout Analysis -> Vision Analysis -> Reading Order -> Document Graph -> Educational Object Graph -> Semantic Reconstruction -> Relationship Resolution -> Question Type Inference -> Metadata Preservation -> Quiz Converter -> Quiz Builder');

    try {
      // Stage 1-4: Parser, Layout Analysis, Vision Analysis, Reading Order
      console.log('[Pipeline Stage 1-4] Parser, Layout, Vision Analysis, Reading Order');
      const visionStartTime = Date.now();
      const visionOutput = await this.runVisionUnderstanding(file);
      const visionDuration = Date.now() - visionStartTime;
      this.recordPhase('VisionUnderstanding', true, visionDuration);

      const visionImageRegions = (visionOutput.regions || []).filter((r: any) => r.type === 'image');
      console.log('[STAGE TRACE] 1. VisionOutput / Layout:', {
        totalRegions: visionOutput.regions?.length || 0,
        imageRegionsCount: visionImageRegions.length,
        imageRegionIDs: visionImageRegions.map((r: any) => r.id),
      });

      // Stage 5: Document Graph
      console.log('[Pipeline Stage 5] Constructing Document Graph');
      const graphStartTime = Date.now();
      this.documentGraph = DocumentGraphConstructor.build(visionOutput);
      DocumentGraphConstructor.enhanceWithSemantics(this.documentGraph);
      const graphDuration = Date.now() - graphStartTime;
      this.recordPhase('DocumentGraphConstruction', true, graphDuration);

      const docGraphNodes = Array.from(((this.documentGraph as any).nodes || (this.documentGraph as any).getNodes?.() || []).values?.() || []);
      const docGraphImageNodes = docGraphNodes.filter((n: any) => n.type === 'Image');
      console.log('[STAGE TRACE] 2. DocumentGraph:', {
        totalNodes: docGraphNodes.length,
        imageNodesCount: docGraphImageNodes.length,
        imageNodeIDs: docGraphImageNodes.map((n: any) => n.id),
      });

      // Stage 6: Educational Object Graph
      console.log('[Pipeline Stage 6] Building Educational Object Graph');
      const eogStartTime = Date.now();
      let eog = EducationalGraphBuilder.build(this.documentGraph);
      const eogDuration = Date.now() - eogStartTime;
      this.recordPhase('EducationalObjectGraphBuilding', true, eogDuration);

      const eogObjects = Array.from(((eog as any).objects || (eog as any).nodes || []).values?.() || []);
      const eogImageObjects = eogObjects.filter((o: any) => o.type === 'Image');
      console.log('[STAGE TRACE] 3. EducationalObjectGraph:', {
        totalObjects: eogObjects.length,
        imageObjectsCount: eogImageObjects.length,
        imageObjectIDs: eogImageObjects.map((o: any) => o.id),
      });

      // Stage 7 & 8: Semantic Reconstruction & Relationship Resolution
      console.log('[Pipeline Stage 7 & 8] Semantic Reconstruction & Relationship Resolution');
      const reconStartTime = Date.now();
      eog = SemanticReconstructor.reconstruct(eog);
      const reconDuration = Date.now() - reconStartTime;
      this.recordPhase('SemanticReconstruction', true, reconDuration);

      // Stage 9: Question Extraction & Type Inference via Agent Pipeline
      console.log('[Pipeline Stage 9] Question Assembly & Question Type Inference');
      const agentStartTime = Date.now();
      let questions = await this.runAgentPipeline();
      const agentDuration = Date.now() - agentStartTime;
      this.recordPhase('AgentPipeline', true, agentDuration);

      console.log('[STAGE TRACE] 4. QuestionBuilder / QuestionObjectAssembler:', {
        totalQuestions: questions.length,
        questionsWithImagesCount: questions.filter(q => q.diagram || (q as any).mediaUrl || q.metadata?.mediaUrl).length,
      });

      // Stage 10: Metadata Preservation
      console.log('[Pipeline Stage 10] Metadata Preservation (Bloom, Difficulty, Marks, Rubrics)');
      const metaStartTime = Date.now();
      eog = MetadataPreserver.preserve(eog);
      const metaDuration = Date.now() - metaStartTime;
      this.recordPhase('MetadataPreservation', true, metaDuration);

      // Stage 11: Educational Object Ownership Analysis
      console.log('[Pipeline Stage 11] Educational Object Ownership Analysis');
      const ownershipStartTime = Date.now();
      const ownership = this.buildOwnershipGraph(questions);
      const ownershipDuration = Date.now() - ownershipStartTime;
      this.recordPhase('OwnershipAnalysis', true, ownershipDuration);

      // Stage 12: Quiz Builder Model Reconstruction
      console.log('[Pipeline Stage 12] Quiz Builder Model Reconstruction');
      const reconstructorStartTime = Date.now();
      const reconstructor = new QuizBuilderReconstructor(ownership, questions);
      const quizBuilderModel = reconstructor.reconstruct();
      const reconstructorDuration = Date.now() - reconstructorStartTime;
      this.recordPhase('QuizBuilderReconstruction', true, reconstructorDuration);

      console.log('[STAGE TRACE] 5. QuizBuilder Reconstruction:', {
        questionsCount: quizBuilderModel.questions.length,
        sectionsCount: quizBuilderModel.sections.length,
        statistics: quizBuilderModel.statistics,
      });

      // Stage 12.5: 4-Graph Visual & Structural Diff Validation
      console.log('[Pipeline Stage 12.5] 4-Graph Visual & Structural Diff Validation');
      const diffStartTime = Date.now();
      const diffReport = VisualDiffValidator.validate(
        this.documentGraph!,
        eog,
        questions,
        quizBuilderModel
      );
      const diffDuration = Date.now() - diffStartTime;
      this.recordPhase('VisualDiffValidation', diffReport.isZeroDiff, diffDuration, { diffReport });

      console.log('[STAGE TRACE] 6. Visual Diff Verification Result:', {
        isZeroDiff: diffReport.isZeroDiff,
        visualDiffScore: diffReport.visualDiffScore,
        autoRepaired: diffReport.autoRepaired,
      });

      // Export Output Creation
      console.log('[Pipeline Stage 13] Export Output Creation');
      const exportStartTime = Date.now();
      const exportOutput = this.createExport(questions, quizBuilderModel);
      const exportDuration = Date.now() - exportStartTime;
      this.recordPhase('Export', true, exportDuration);

      const processingTime = Date.now() - startTime;
      console.log('=== DocumentIntelligenceEngine.processDocument EXIT ===', {
        processingTime: `${processingTime}ms`,
        questionsCount: questions.length,
      });

      return {
        success: true,
        documentGraph: this.documentGraph.toSerializable(),
        educationalObjectGraph: eog.toSerializable(),
        visionOutput,
        questions,
        export: exportOutput,
        processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error('=== DocumentIntelligenceEngine.processDocument ERROR ===', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime,
      };
    }
  }

  /**
   * Phase 1: Vision Understanding
   */
  private async runVisionUnderstanding(
    file: { buffer: Buffer; name: string; mimeType: string }
  ) {
    console.log('[DocumentIntelligenceEngine] Running Vision Understanding');
    return await VisionUnderstanding.process(file);
  }

  /**
   * Phase 4-7: Agent Pipeline
   * Uses the implemented agents to extract questions from the document graph
   */
  private async runAgentPipeline(): Promise<QuestionObject[]> {
    console.log('[DocumentIntelligenceEngine] Running Agent Pipeline');
    console.log('[DocumentIntelligenceEngine] Using QuestionObjectAssembler to extract questions');

    try {
      if (!this.documentGraph) {
        console.error('[DocumentIntelligenceEngine] Document graph is null, cannot run agent pipeline');
        return [];
      }

      // Use QuestionObjectAssembler to extract questions
      const assembler = new QuestionObjectAssembler(this.documentGraph, this.workingMemory);
      const result = await assembler.assembleQuestions();

      console.log('[DocumentIntelligenceEngine] QuestionObjectAssembler completed', {
        success: result.success,
        questionsExtracted: result.questions?.length || 0,
        statistics: result.statistics
      });

      if (!result.success || !result.questions) {
        console.error('[DocumentIntelligenceEngine] QuestionObjectAssembler failed', {
          error: result.error
        });
        return [];
      }

      return result.questions;
    } catch (error) {
      console.error('[DocumentIntelligenceEngine] Agent Pipeline failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return [];
    }
  }

  /**
   * Get node type counts for logging
   */
  private getNodeTypeCounts(nodes: any[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const node of nodes) {
      const type = node.type || 'unknown';
      counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
  }

  /**
   * Build Educational Object Ownership Graph
   */
  private buildOwnershipGraph(questions: QuestionObject[]): EducationalObjectOwnership {
    console.log('[DocumentIntelligenceEngine] Building Educational Object Ownership Graph');
    
    const ownership = new EducationalObjectOwnership();
    
    for (const question of questions) {
      // Create ownership boundary for each question
      ownership.createBoundary({
        id: question.id,
        type: 'question',
        ownerId: question.id,
        bbox: question.bbox,
        page: question.sourcePage,
        confidence: question.confidence.overall,
      });
      
      // Assign tables to question
      if (question.table) {
        ownership.assignObject({
          id: `${question.id}_table`,
          type: 'Table',
          ownerId: question.id,
          ownershipType: 'primary',
          bbox: question.bbox,
          page: question.sourcePage,
          content: (question.table as any).html,
          relationships: [],
          metadata: question.table,
        });
      }
      
      // Assign images to question
      if (question.diagram) {
        ownership.assignObject({
          id: `${question.id}_diagram`,
          type: question.diagram.type,
          ownerId: question.id,
          ownershipType: 'primary',
          bbox: question.bbox,
          page: question.sourcePage,
          content: question.diagram.url,
          relationships: [],
          metadata: question.diagram,
        });
      }
      
      // Assign equations to question
      if (question.equations && question.equations.length > 0) {
        question.equations.forEach((eq, index) => {
          ownership.assignObject({
            id: `${question.id}_equation_${index}`,
            type: 'Equation',
            ownerId: question.id,
            ownershipType: 'primary',
            bbox: question.bbox,
            page: question.sourcePage,
            content: eq.latex,
            relationships: [],
            metadata: eq,
          });
        });
      }
      
      // Assign code blocks to question
      if (question.code) {
        ownership.assignObject({
          id: `${question.id}_code`,
          type: 'CodeBlock',
          ownerId: question.id,
          ownershipType: 'primary',
          bbox: question.bbox,
          page: question.sourcePage,
          content: question.code.content,
          relationships: [],
          metadata: question.code,
        });
      }
      
      // Assign context paragraphs to question
      if (question.context.paragraphs && question.context.paragraphs.length > 0) {
        question.context.paragraphs.forEach((para, index) => {
          ownership.assignObject({
            id: `${question.id}_paragraph_${index}`,
            type: 'Paragraph',
            ownerId: question.id,
            ownershipType: 'context',
            bbox: question.bbox,
            page: question.sourcePage,
            content: para,
            relationships: [],
            metadata: {},
          });
        });
      }
    }
    
    // Build relationships between objects
    ownership.buildRelationships();
    
    const stats = ownership.getStatistics();
    console.log('[DocumentIntelligenceEngine] Ownership Graph Built', stats);
    
    return ownership;
  }

  /**
   * Create export output
   */
  private createExport(questions: QuestionObject[], quizBuilderModel?: any): ExportOutput {
    const overallConfidence =
      questions.length > 0
        ? questions.reduce((sum, q) => sum + q.confidence.overall, 0) / questions.length
        : 0;

    const lowConfidenceCount = questions.filter(
      q => q.confidence.overall < 0.7
    ).length;

    return {
      questions,
      quizBuilderModel: quizBuilderModel || null,
      metadata: {
        sourceType: 'document_intelligence',
        extractionDate: new Date().toISOString(),
        overallConfidence,
        statistics: {
          totalQuestions: questions.length,
          coverage: 1.0, // Would be calculated from gold standard
          averageConfidence: overallConfidence,
          lowConfidenceCount,
        },
      },
    };
  }

  /**
   * Initialize working memory
   */
  private initializeWorkingMemory(): WorkingMemory {
    const workingMemorySystem = new WorkingMemorySystem();
    return workingMemorySystem.getMemory();
  }

  /**
   * Record phase completion
   */
  private recordPhase(
    phase: string,
    success: boolean,
    duration: number,
    metadata?: Record<string, any>
  ): void {
    this.processingHistory.push({
      phase,
      timestamp: new Date(),
      success,
      duration,
      metadata,
    });
  }

  /**
   * Get processing history
   */
  getProcessingHistory(): Array<{
    phase: string;
    timestamp: Date;
    success: boolean;
    duration: number;
    metadata?: Record<string, any>;
  }> {
    return this.processingHistory;
  }

  /**
   * Get current document graph
   */
  getDocumentGraph(): DocumentGraph | null {
    return this.documentGraph;
  }

  /**
   * Get working memory
   */
  getWorkingMemory(): WorkingMemory {
    return this.workingMemory;
  }

  /**
   * Reset engine state
   */
  reset(): void {
    this.documentGraph = null;
    this.workingMemory = this.initializeWorkingMemory();
    this.processingHistory = [];
    console.log('[DocumentIntelligenceEngine] Engine reset');
  }

  /**
   * Run a specific agent (placeholder for agent framework)
   */
  async runAgent(
    agentName: string,
    input: AgentInput
  ): Promise<AgentOutput> {
    console.log(`[DocumentIntelligenceEngine] Running agent: ${agentName}`);

    // Placeholder - will be implemented with actual agents in Phase 2-4
    return {
      success: false,
      confidence: 0,
      errors: ['Agent not implemented yet'],
    };
  }
}
