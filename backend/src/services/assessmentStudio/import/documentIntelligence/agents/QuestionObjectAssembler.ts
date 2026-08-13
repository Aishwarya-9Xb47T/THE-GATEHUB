/**
 * Question Object Assembler
 * High-level coordinator for question extraction
 * Orchestrates Question Builder, Question Reasoner, and Question Graph Constructor
 */

import { DocumentGraph } from '../DocumentGraph.js';
import { WorkingMemory, QuestionObject } from '../types.js';
import { QuestionBuilderAgent } from './QuestionBuilderAgent.js';
import { QuestionReasonerAgent } from './QuestionReasonerAgent.js';
import { QuestionGraphConstructor } from './QuestionGraphConstructor.js';
import { AgentOrchestrator } from './AgentOrchestrator.js';
import { AgentInput } from '../types.js';

export class QuestionObjectAssembler {
  private documentGraph: DocumentGraph;
  private workingMemory: WorkingMemory;
  private orchestrator: AgentOrchestrator;
  private graphConstructor: QuestionGraphConstructor;

  constructor(documentGraph: DocumentGraph, workingMemory: WorkingMemory) {
    this.documentGraph = documentGraph;
    this.workingMemory = workingMemory;
    this.orchestrator = new AgentOrchestrator();
    this.graphConstructor = new QuestionGraphConstructor(documentGraph);

    // Register agents
    this.orchestrator.registerAgent(new QuestionBuilderAgent());
    this.orchestrator.registerAgent(new QuestionReasonerAgent());
  }

  /**
   * Run complete question extraction and assembly
   */
  async assembleQuestions(): Promise<{
    success: boolean;
    questions?: QuestionObject[];
    statistics?: any;
    error?: string;
  }> {
    console.log('=== QuestionObjectAssembler.assembleQuestions ENTRY ===');
    console.log('INPUT:', {
      documentGraphNodes: this.documentGraph.getAllNodes().length,
      workingMemory: !!this.workingMemory
    });

    try {
      console.log('[QuestionObjectAssembler] Starting question assembly');
      const startTime = Date.now();

      // Prepare agent input
      const input: AgentInput = {
        documentGraph: this.documentGraph.toSerializable(),
        workingMemory: this.workingMemory,
        config: {},
      };

      console.log('[QuestionObjectAssembler] Agent input prepared', {
        serializableNodeCount: input.documentGraph.nodes.size
      });

      // Execute agents in sequence: Builder → Reasoner
      console.log('[QuestionObjectAssembler] Executing agents sequentially');
      const orchestrationStartTime = Date.now();
      const results = await this.orchestrator.executeSequential(
        ['QuestionBuilder', 'QuestionReasoner'],
        input
      );
      const orchestrationDuration = Date.now() - orchestrationStartTime;
      console.log('[QuestionObjectAssembler] Agent orchestration completed', {
        duration: `${orchestrationDuration}ms`,
        agentCount: results.size
      });

      // Get builder result
      const builderResult = results.get('QuestionBuilder');
      const reasonerResult = results.get('QuestionReasoner');

      console.log('[QuestionObjectAssembler] Builder result', {
        success: builderResult?.success,
        questionsCount: builderResult?.result?.questions?.length || 0
      });

      console.log('[QuestionObjectAssembler] Reasoner result', {
        success: reasonerResult?.success,
        questionsCount: reasonerResult?.result?.reasonedQuestions?.length || 0
      });

      if (!builderResult?.success) {
        console.error('[QuestionObjectAssembler] Question Builder failed', {
          errors: builderResult?.errors
        });
        throw new Error('Question Builder failed');
      }

      let questions = builderResult.result.questions;
      console.log('[QuestionObjectAssembler] Initial questions from builder', {
        count: questions.length
      });

      // Apply reasoning if successful
      if (reasonerResult?.success) {
        questions = reasonerResult.result.reasonedQuestions;
        console.log('[QuestionObjectAssembler] Questions after reasoning', {
          count: questions.length
        });
      }

      // Build question subgraphs for additional context
      console.log('[QuestionObjectAssembler] Building question subgraphs');
      const subgraphStartTime = Date.now();
      const subgraphs = this.graphConstructor.buildQuestionSubgraphs();
      const subgraphDuration = Date.now() - subgraphStartTime;
      console.log('[QuestionObjectAssembler] Question subgraphs built', {
        duration: `${subgraphDuration}ms`,
        subgraphCount: subgraphs.size
      });

      // Enhance questions with graph information
      console.log('[QuestionObjectAssembler] Enhancing questions with graph info');
      questions = this.enhanceQuestionsWithGraphInfo(questions, subgraphs);
      console.log('[QuestionObjectAssembler] Questions enhanced', {
        count: questions.length
      });

      // Handle page-spanning questions
      console.log('[QuestionObjectAssembler] Handling page-spanning questions');
      questions = this.handlePageSpanningQuestions(questions);
      console.log('[QuestionObjectAssembler] Page-spanning questions handled', {
        count: questions.length
      });

      // Calculate statistics
      const statistics = this.calculateStatistics(questions);
      console.log('[QuestionObjectAssembler] Statistics calculated', statistics);

      const totalDuration = Date.now() - startTime;
      console.log('=== QuestionObjectAssembler.assembleQuestions EXIT ===');
      console.log('OUTPUT:', {
        success: true,
        questionsCount: questions.length,
        statistics: statistics,
        duration: `${totalDuration}ms`
      });

      return {
        success: true,
        questions,
        statistics,
      };
    } catch (error) {
      console.error('=== QuestionObjectAssembler.assembleQuestions ERROR ===');
      console.error('ERROR DETAILS:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Enhance questions with information from question subgraphs
   */
  private enhanceQuestionsWithGraphInfo(
    questions: QuestionObject[],
    subgraphs: Map<string, any>
  ): QuestionObject[] {
    for (const question of questions) {
      const subgraph = subgraphs.get(question.id);
      if (subgraph) {
        // Add additional context from subgraph
        if (subgraph.components.context.length > 0) {
          question.context.paragraphs = [
            ...question.context.paragraphs,
            ...subgraph.components.context.map((n: any) => n.content || ''),
          ];
        }

        // Attach tables from subgraph
        if (subgraph.components.tables && subgraph.components.tables.length > 0) {
          const tableNode = subgraph.components.tables[0];
          const tn = tableNode as any;
          const meta = tn.metadata || {};
          const html = meta.html || tableNode.content;
          const parsedTable = this.parseHtmlTable(html);
          
          // Build table object, always using parsed data if existing arrays are empty
          const existingTable = meta.table || tn.table;
          const hasExistingHeaders = existingTable?.headers && Array.isArray(existingTable.headers) && existingTable.headers.length > 0;
          const hasExistingRows = existingTable?.rows && Array.isArray(existingTable.rows) && existingTable.rows.length > 0;
          
          question.table = {
            html,
            headers: hasExistingHeaders ? existingTable.headers : parsedTable.headers,
            rows: hasExistingRows ? existingTable.rows : parsedTable.rows,
            mergedCells: existingTable?.mergedCells || meta.mergedCells || tn.mergedCells || [],
            caption: existingTable?.caption || meta.caption || tn.caption || '',
          };
          
          question.tables = subgraph.components.tables.map((t: any) => {
            const m = t.metadata || {};
            const tableHtml = m.html || t.content;
            const parsed = this.parseHtmlTable(tableHtml);
            
            const existingT = m.table || t.table;
            const hasExistingTHeaders = existingT?.headers && Array.isArray(existingT.headers) && existingT.headers.length > 0;
            const hasExistingTRows = existingT?.rows && Array.isArray(existingT.rows) && existingT.rows.length > 0;
            
            return {
              html: tableHtml,
              headers: hasExistingTHeaders ? existingT.headers : parsed.headers,
              rows: hasExistingTRows ? existingT.rows : parsed.rows,
              mergedCells: existingT?.mergedCells || m.mergedCells || t.mergedCells || [],
              caption: existingT?.caption || m.caption || t.caption || '',
            };
          });
        }

        // Attach code blocks from subgraph
        if (subgraph.components.codeBlocks && subgraph.components.codeBlocks.length > 0) {
          const codeNode = subgraph.components.codeBlocks[0];
          const cn = codeNode as any;
          const meta = cn.metadata || {};
          const content = meta.code || codeNode.content;
          const language = meta.language || cn.language || 'python';
          const indentation = typeof meta.indentation === 'number' ? meta.indentation : (typeof cn.indentation === 'number' ? cn.indentation : 0);
          question.code = {
            id: codeNode.id,
            content,
            code: content,
            language,
            indentation,
            confidence: 1,
          };
          question.codeBlocks = subgraph.components.codeBlocks.map((c: any) => {
            const m = c.metadata || {};
            const cc = m.code || c.content;
            return {
              id: c.id,
              content: cc,
              code: cc,
              language: m.language || c.language || 'python',
              indentation: typeof m.indentation === 'number' ? m.indentation : (typeof c.indentation === 'number' ? c.indentation : 0),
              confidence: 1,
            };
          });
        }

        // Attach equations/formulas from subgraph
        if (subgraph.components.equations && subgraph.components.equations.length > 0) {
          // Check if equations are actually numbered list items
          const allNumbered = subgraph.components.equations.every((e: any) => {
            const latex = e.metadata?.latex || e.metadata?.formula || e.metadata?.unicode || e.content || '';
            return /^\s*\d+\.\s+/.test(latex);
          });
          
          if (allNumbered && subgraph.components.equations.length > 1) {
            // This is a numbered list, extract as list instead
            const listItems = subgraph.components.equations.map((e: any) => {
              const latex = e.metadata?.latex || e.metadata?.formula || e.metadata?.unicode || e.content || '';
              return latex.replace(/^\s*\d+\.\s*/, '').trim();
            });
            question.lists = [{
              id: subgraph.components.equations[0].id,
              type: 'ordered',
              items: listItems,
              confidence: 1,
            }];
            // Don't set formulas since we've reclassified as list
          } else {
            question.equations = subgraph.components.equations.map((e: any) => {
              const m = e.metadata || {};
              return {
                id: e.id,
                latex: m.latex || m.formula || m.unicode || e.content || '',
                format: m.format || 'latex',
                type: m.type || 'block',
                confidence: 1,
              };
            });
            question.formulas = question.equations.map(e => e.latex);
          }
        }

        // Attach diagrams/images from subgraph
        if (subgraph.components.diagrams && subgraph.components.diagrams.length > 0) {
          const firstImg = subgraph.components.diagrams[0];
          question.images = subgraph.components.diagrams.map((imgNode: any) => {
            const m = imgNode.metadata || {};
            const dataUrl =
              m.dataUrl ||
              (imgNode as any).dataUrl ||
              m.url ||
              (imgNode as any).url ||
              (imgNode.content?.includes('src=') ? imgNode.content.match(/src=["']([^"']+)["']/)?.[1] : undefined);
            const width = m.width || imgNode.bbox?.width || undefined;
            const height = m.height || imgNode.bbox?.height || undefined;
            const caption = m.caption || m.altText || imgNode.caption || '';
            const altText = m.altText || caption || '';
            return {
              id: imgNode.id,
              url: dataUrl,
              dataUrl,
              caption,
              altText,
              width,
              height,
              mimeType: m.mimeType || imgNode.mimeType,
            };
          });
          const first = question.images[0];
          if (first?.dataUrl) {
            question.mediaUrl = first.dataUrl;
            question.media = { url: first.dataUrl, kind: 'image' };
            question.diagram = {
              id: firstImg.id,
              type: 'image',
              url: first.dataUrl,
              dataUrl: first.dataUrl,
              caption: first.caption,
              width: first.width,
              height: first.height,
            };
          }
        }

        // Update confidence based on subgraph
        question.confidence.overall = Math.max(
          question.confidence.overall,
          subgraph.confidence
        );
      }
    }

    return questions;
  }

  /**
   * Handle page-spanning questions
   */
  private handlePageSpanningQuestions(questions: QuestionObject[]): QuestionObject[] {
    for (const question of questions) {
      // Check if question spans pages using working memory
      const pages = this.getPagesForQuestion(question.id);
      
      if (pages.length > 1) {
        // Question spans multiple pages
        console.log(`[QuestionObjectAssembler] Question ${question.id} spans pages: ${pages.join(', ')}`);
        
        // Add metadata about page spanning
        question.metadata.subtopic = `Spans pages ${pages.join(', ')}`;
        
        // Could add additional logic to reconstruct content from multiple pages
      }
    }

    return questions;
  }

  /**
   * Get pages for a question using working memory
   */
  private getPagesForQuestion(questionId: string): number[] {
    const pages: number[] = [];

    for (const [page, context] of this.workingMemory.pageContext.entries()) {
      if (context.questionsStarted.includes(questionId) || context.questionsEnded.includes(questionId)) {
        pages.push(page);
      }
    }

    return pages;
  }

  /**
   * Parse HTML table string into headers and rows arrays
   */
  private parseHtmlTable(html: string): { headers: string[]; rows: string[][] } {
    const headers: string[] = [];
    const rows: string[][] = [];

    if (!html || typeof html !== 'string') {
      return { headers, rows };
    }

    // Parse HTML table rows & cells
    const trMatches = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    
    trMatches.forEach((tr, trIndex) => {
      const tdMatches = tr.match(/<(td|th)[\s\S]*?<\/\1>/gi) || [];
      const cells = tdMatches.map(td =>
        td
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .trim()
      );

      if (cells.length > 0) {
        if (trIndex === 0) {
          headers.push(...cells);
        } else {
          rows.push(cells);
        }
      }
    });

    return { headers, rows };
  }

  /**
   * Calculate statistics for extracted questions
   */
  private calculateStatistics(questions: QuestionObject[]): any {
    const typeDistribution: Record<string, number> = {};
    const difficultyDistribution: Record<string, number> = {};
    const bloomDistribution: Record<string, number> = {};

    for (const question of questions) {
      typeDistribution[question.type] = (typeDistribution[question.type] || 0) + 1;
      difficultyDistribution[question.metadata.difficulty] = (difficultyDistribution[question.metadata.difficulty] || 0) + 1;
      bloomDistribution[question.metadata.bloomLevel] = (bloomDistribution[question.metadata.bloomLevel] || 0) + 1;
    }

    const avgConfidence = questions.length > 0
      ? questions.reduce((sum, q) => sum + q.confidence.overall, 0) / questions.length
      : 0;

    return {
      totalQuestions: questions.length,
      typeDistribution,
      difficultyDistribution,
      bloomDistribution,
      averageConfidence: avgConfidence,
      questionsWithDiagrams: questions.filter(q => q.diagram).length,
      questionsWithTables: questions.filter(q => q.table).length,
      questionsWithEquations: questions.filter(q => q.equations && q.equations.length > 0).length,
      questionsWithCode: questions.filter(q => q.code).length,
    };
  }

  /**
   * Get document graph
   */
  getDocumentGraph(): DocumentGraph {
    return this.documentGraph;
  }

  /**
   * Get working memory
   */
  getWorkingMemory(): WorkingMemory {
    return this.workingMemory;
  }

  /**
   * Get orchestrator
   */
  getOrchestrator(): AgentOrchestrator {
    return this.orchestrator;
  }

  /**
   * Get graph constructor
   */
  getGraphConstructor(): QuestionGraphConstructor {
    return this.graphConstructor;
  }

  /**
   * Reset assembler
   */
  reset(): void {
    this.orchestrator.clearHistory();
    console.log('[QuestionObjectAssembler] Reset');
  }
}
