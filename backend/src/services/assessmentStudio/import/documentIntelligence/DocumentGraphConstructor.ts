/**
 * Document Graph Constructor
 * Builds Document Graph from Vision Understanding output
 */

import { DocumentGraph } from './DocumentGraph.js';
import { DocumentObject, ObjectType, RelationshipType } from './types.js';
import { VisionUnderstandingOutput, VisionRegion } from './types.js';

export class DocumentGraphConstructor {
  /**
   * Build Document Graph from Vision Understanding output
   */
  static build(visionOutput: VisionUnderstandingOutput): DocumentGraph {
    console.log('=== DocumentGraphConstructor.build ENTRY ===');
    console.log('INPUT:', {
      regionCount: visionOutput.regions.length,
      layoutColumns: visionOutput.layout.columns,
      layoutOrientation: visionOutput.layout.orientation,
      ocrTextLength: visionOutput.ocrText.length,
      confidence: visionOutput.confidence
    });

    try {
      const startTime = Date.now();

      const graph = new DocumentGraph();

      // Create root document node
      const rootNode = DocumentGraph.createObject(
        'Document',
        {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          page: 0,
        },
        undefined,
        {
          totalPages: visionOutput.layout.regions.reduce((max, r) => Math.max(max, r.bbox.page), 0),
          totalRegions: visionOutput.regions.length,
          columns: visionOutput.layout.columns,
          orientation: visionOutput.layout.orientation,
        }
      );

      graph.addNode(rootNode);
      console.log('[DocumentGraphConstructor] Root node created:', rootNode.id);

      // Create section nodes based on layout
      const sectionStartTime = Date.now();
      const sections = this.createSections(visionOutput, rootNode.id);
      for (const section of sections) {
        graph.addNode(section);
        graph.addRelationship(rootNode.id, section.id, 'contains', 0.9);
      }
      const sectionDuration = Date.now() - sectionStartTime;
      console.log('[DocumentGraphConstructor] Sections created', {
        count: sections.length,
        duration: `${sectionDuration}ms`
      });

      // Create nodes for each vision region
      const regionStartTime = Date.now();
      const regionNodes = this.createRegionNodes(visionOutput.regions, sections);
      for (const node of regionNodes) {
        graph.addNode(node);

        // Add relationship to parent section
        const parentSection = this.findParentSection(node, sections);
        if (parentSection) {
          graph.addRelationship(parentSection.id, node.id, 'contains', 0.85);
        } else {
          graph.addRelationship(rootNode.id, node.id, 'contains', 0.8);
        }
      }
      const regionDuration = Date.now() - regionStartTime;
      console.log('[DocumentGraphConstructor] Region nodes created', {
        count: regionNodes.length,
        duration: `${regionDuration}ms`
      });

      // Create relationships between nodes
      const relationshipStartTime = Date.now();
      this.createRelationships(graph, regionNodes, visionOutput.layout.readingOrder);
      const relationshipDuration = Date.now() - relationshipStartTime;
      console.log('[DocumentGraphConstructor] Relationships created', {
        duration: `${relationshipDuration}ms`
      });

      // Validate graph
      const validation = graph.validate();
      if (!validation.isValid) {
        console.error('[DocumentGraphConstructor] Graph validation failed:', validation.errors);
      } else {
        console.log('[DocumentGraphConstructor] Graph validation passed');
      }

      const stats = graph.getStatistics();
      console.log('[DocumentGraphConstructor] Graph statistics:', stats);

      const totalDuration = Date.now() - startTime;
      console.log('=== DocumentGraphConstructor.build EXIT ===');
      console.log('OUTPUT:', {
        totalNodes: stats.totalNodes,
        totalEdges: stats.totalEdges,
        duration: `${totalDuration}ms`
      });

      return graph;
    } catch (error) {
      console.error('=== DocumentGraphConstructor.build ERROR ===');
      console.error('ERROR DETAILS:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Create section nodes based on layout
   */
  private static createSections(
    visionOutput: VisionUnderstandingOutput,
    rootId: string
  ): DocumentObject[] {
    const sections: DocumentObject[] = [];
    const regionsByPage = new Map<number, VisionRegion[]>();

    // Group regions by page
    for (const region of visionOutput.regions) {
      const page = region.bbox.page;
      if (!regionsByPage.has(page)) {
        regionsByPage.set(page, []);
      }
      regionsByPage.get(page)!.push(region);
    }

    // Create a section for each page
    for (const [page, regions] of regionsByPage.entries()) {
      const section = DocumentGraph.createObject(
        'Section',
        {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          page,
        },
        `Page ${page}`,
        {
          pageNumber: page,
          regionCount: regions.length,
        }
      );

      sections.push(section);
    }

    console.log('[DocumentGraphConstructor] Created', sections.length, 'sections');
    return sections;
  }

  /**
   * Create document nodes from vision regions
   */
  private static createRegionNodes(
    regions: VisionRegion[],
    sections: DocumentObject[]
  ): DocumentObject[] {
    const nodes: DocumentObject[] = [];

    for (const region of regions) {
      const objectType = this.mapRegionTypeToObject(region.type);
      const metadata: Record<string, any> = {
        visionRegionId: region.id,
        regionType: region.type,
      };
      if (region.attributes && typeof region.attributes === 'object') {
        for (const [k, v] of Object.entries(region.attributes)) {
          metadata[k] = v;
        }
      }
      if (objectType === 'Image' || objectType === 'Diagram') {
        const regionContent = region.content || '';
        if (!metadata.dataUrl) {
          const srcMatch = regionContent.match(/src=["']([^"']+)["']/);
          if (srcMatch) metadata.dataUrl = srcMatch[1];
        }
        if (!metadata.url && metadata.dataUrl) metadata.url = metadata.dataUrl;
        const altMatch = regionContent.match(/alt=["']([^"']*)["']/);
        if (altMatch && !metadata.caption) metadata.caption = altMatch[1];
      }
      if (objectType === 'Table') {
        const regionContent = region.content || '';
        if (regionContent.startsWith('<table') && !metadata.html) metadata.html = regionContent;
        const headers = metadata.headers || metadata.allRows?.[0] || [];
        const rows = metadata.rows || metadata.bodyRows || (metadata.allRows ? metadata.allRows.slice(1) : []);
        const mergedCells = metadata.mergedCells || this.detectMergedCells(regionContent);
        metadata.headers = headers;
        metadata.rows = rows;
        metadata.mergedCells = mergedCells;
        metadata.table = { html: metadata.html || regionContent, headers, rows, mergedCells, caption: metadata.caption || '' };
      }
      if (objectType === 'CodeBlock') {
        if (!metadata.code) metadata.code = region.content || '';
        if (!metadata.language) metadata.language = this.detectCodeLanguage(region.content || '');
        if (!metadata.indentation) metadata.indentation = this.detectIndentation(region.content || '');
      }
      if (objectType === 'Equation') {
        if (!metadata.latex) metadata.latex = region.content || '';
        if (!metadata.formula) metadata.formula = region.content || '';
        if (!metadata.unicode) metadata.unicode = region.content || '';
      }
      const node = DocumentGraph.createObject(
        objectType,
        region.bbox,
        region.content,
        metadata
      );

      nodes.push(node);
    }

    const byType: Record<string, number> = {};
    for (const n of nodes) byType[n.type] = (byType[n.type] ?? 0) + 1;
    console.log('[DocumentGraphConstructor] Created', nodes.length, 'region nodes with attributes', byType);
    return nodes;
  }

  private static detectCodeLanguage(content: string): string {
    if (/^\s*#!/i.test(content)) {
      if (content.includes('python')) return 'python';
      if (content.includes('bash') || content.includes('sh')) return 'bash';
      if (content.includes('node') || content.includes('javascript')) return 'javascript';
    }
    if (/def\s+\w+\s*\(.*\)\s*:/.test(content) || /^from\s+\w+\s+import|^import\s+\w+/m.test(content)) return 'python';
    if (/\bpublic\s+(static\s+)?(void|int|String|boolean|double)\s+\w+\s*\(/.test(content)) return 'java';
    if (/\b#include\s*<|\bint\s+main\s*\(/.test(content)) return 'cpp';
    if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\s+/i.test(content)) return 'sql';
    if (/(<\?php|<\/?html>|<\/?div>|<\/?script>)/i.test(content)) {
      if (/<\?php/.test(content)) return 'php';
      if (/<html/i.test(content)) return 'html';
      if (/<script/.test(content)) return 'javascript';
    }
    if (/^\s*\{[\s\S]*"[\w]+"\s*:/.test(content)) return 'json';
    if (/function\s+\w+\s*\(|=>\s*\{|const\s+\w+\s*=\s*\(|let\s+\w+\s*=/.test(content)) return 'javascript';
    if (/@\w+|^\s*class\s+\w+.*<|^\s*package\s+/.test(content)) return 'typescript';
    return 'plaintext';
  }

  private static detectIndentation(content: string): number {
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    let spaces = 0;
    for (const l of lines) {
      const m = l.match(/^(\s+)/);
      if (m) spaces = Math.max(spaces, m[1].replace(/\t/g, '  ').length);
    }
    return spaces;
  }

  private static detectMergedCells(html: string): Array<{ row: number; col: number; rowSpan?: number; colSpan?: number }> {
    const merged: Array<{ row: number; col: number; rowSpan?: number; colSpan?: number }> = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let r = 0;
    let m;
    while ((m = rowRegex.exec(html)) !== null) {
      const cellRegex = /<(td|th)[^>]*>/gi;
      let c = 0;
      let cm;
      while ((cm = cellRegex.exec(m[1])) !== null) {
        const tag = cm[0];
        const rowspanMatch = tag.match(/rowspan=["']?(\d+)/i);
        const colspanMatch = tag.match(/colspan=["']?(\d+)/i);
        if (rowspanMatch || colspanMatch) {
          merged.push({
            row: r,
            col: c,
            rowSpan: rowspanMatch ? parseInt(rowspanMatch[1], 10) : undefined,
            colSpan: colspanMatch ? parseInt(colspanMatch[1], 10) : undefined,
          });
        }
        c++;
      }
      r++;
    }
    return merged;
  }

  /**
   * Map vision region type to document object type
   */
  private static mapRegionTypeToObject(
    regionType: VisionRegion['type']
  ): ObjectType {
    const mapping: Record<VisionRegion['type'], ObjectType> = {
      text: 'Paragraph',
      header: 'Heading',
      footer: 'Footer',
      table: 'Table',
      image: 'Image',
      diagram: 'Diagram',
      equation: 'Equation',
      code: 'CodeBlock',
    };

    return mapping[regionType] || 'Paragraph';
  }

  /**
   * Find parent section for a node
   */
  private static findParentSection(
    node: DocumentObject,
    sections: DocumentObject[]
  ): DocumentObject | undefined {
    return sections.find(section => section.metadata.pageNumber === node.page);
  }

  /**
   * Create relationships between nodes
   */
  private static createRelationships(
    graph: DocumentGraph,
    nodes: DocumentObject[],
    readingOrder: string[]
  ): void {
    // Create sequential relationships based on reading order
    for (let i = 0; i < nodes.length - 1; i++) {
      const current = nodes[i];
      const next = nodes[i + 1];

      // Add 'precedes' relationship
      graph.addRelationship(current.id, next.id, 'precedes', 0.8);

      // Add 'follows' relationship (reverse)
      graph.addRelationship(next.id, current.id, 'follows', 0.8);
    }

    // Create reference relationships for specific patterns
    this.createReferenceRelationships(graph, nodes);

    console.log('[DocumentGraphConstructor] Created relationships between nodes');
  }

  /**
   * Create reference relationships based on content patterns
   */
  private static createReferenceRelationships(
    graph: DocumentGraph,
    nodes: DocumentObject[]
  ): void {
    // Find potential references (e.g., "see Figure 1", "as shown in Table 2")
    const referencePattern = /(?:see|refer to|as shown in|mentioned in)\s+(?:figure|table|diagram|image)\s+(\d+)/i;

    for (const node of nodes) {
      if (!node.content) continue;

      const matches = node.content.match(referencePattern);
      if (matches) {
        const referencedType = matches[1].toLowerCase();
        const referencedNumber = parseInt(matches[2], 10);

        // Find the referenced node
        const referencedNode = nodes.find(n => {
          if (n.content) {
            const content = n.content.toLowerCase();
            return (
              content.includes(referencedType) &&
              content.includes(referencedNumber.toString())
            );
          }
          return false;
        });

        if (referencedNode) {
          graph.addRelationship(node.id, referencedNode.id, 'references', 0.75);
        }
      }
    }
  }

  /**
   * Enhance graph with semantic relationships
   */
  static enhanceWithSemantics(graph: DocumentGraph): DocumentGraph {
    console.log('[DocumentGraphConstructor] Enhancing graph with semantics');

    const nodes = graph.getAllNodes();

    // Phase 1: Detect and create Question nodes from text patterns
    console.log('[DocumentGraphConstructor] Phase 1: Detecting question patterns');
    const questionDetectionStartTime = Date.now();
    const questionNodes = this.detectQuestions(graph, nodes);
    const questionDetectionDuration = Date.now() - questionDetectionStartTime;
    console.log('[DocumentGraphConstructor] Question detection completed', {
      duration: `${questionDetectionDuration}ms`,
      questionsDetected: questionNodes.length
    });

    // Add question nodes to graph
    for (const questionNode of questionNodes) {
      graph.addNode(questionNode);
    }

    // Refresh nodes list after adding questions
    const allNodes = graph.getAllNodes();

    // Group nodes by type
    const headings = graph.getNodesByType('Heading');
    const questions = graph.getNodesByType('Question');
    const paragraphs = graph.getNodesByType('Paragraph');

    console.log('[DocumentGraphConstructor] Node counts after question detection', {
      totalNodes: allNodes.length,
      questions: questions.length,
      headings: headings.length,
      paragraphs: paragraphs.length
    });

    // Create semantic relationships between headings and content
    for (const heading of headings) {
      // Find content that follows this heading
      const headingIndex = allNodes.indexOf(heading);
      const followingContent = allNodes.slice(headingIndex + 1, headingIndex + 10);

      for (const content of followingContent) {
        if (content.type === 'Paragraph' || content.type === 'Question') {
          graph.addRelationship(heading.id, content.id, 'context_for', 0.7);
        }
      }
    }

    // Create relationships between questions and their options
    for (const question of questions) {
      const origId = question.metadata?.originalParagraphId;
      const origIndex = origId ? allNodes.findIndex(n => n.id === origId) : -1;
      const searchIndex = origIndex >= 0 ? origIndex : allNodes.indexOf(question);
      const followingNodes = allNodes.slice(searchIndex + 1, searchIndex + 12);

      for (const node of followingNodes) {
        if (node.type === 'Question') break;
        // Check if this could be an option (short, starts with letter/number)
        if (node.content && this.isLikelyOption(node.content)) {
          node.type = 'Option';
          graph.addRelationship(question.id, node.id, 'contains', 0.9);
        }
      }
    }

    console.log('[DocumentGraphConstructor] Semantic enhancement complete');
    return graph;
  }

  /**
   * Detect question patterns in text and create Question nodes
   */
  private static detectQuestions(graph: DocumentGraph, nodes: DocumentObject[]): DocumentObject[] {
    const questionNodes: DocumentObject[] = [];
    let lastQuestionNum = 0;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node.content) continue;

      const raw = node.content.trim();
      const plainText = raw.replace(/<[^>]+>/g, '').replace(/\u00a0/g, ' ').trim();
      if (!plainText) continue;

      // Skip document title, section headers, author instructions, or metadata
      if (
        /^(Word Import Test Suite|Document Title|Section\s+\d+|Chapter\s+\d+|Header:|Footer:)/i.test(plainText) ||
        /^(Insert\s+|Add\s+caption|Paste\s+|Word\s+Equation\s+Editor|Page\s+Break|Continue\s+with|Verify\s+these)/i.test(plainText) ||
        /^(Difficulty\s*:|Marks\s*:|Bloom\s*(Level)?\s*:)/i.test(plainText)
      ) {
        continue;
      }

      const qCheck = this.isQuestionStartNode(plainText, i, nodes, lastQuestionNum);
      if (qCheck.isQuestion) {
        if (qCheck.num) {
          lastQuestionNum = qCheck.num;
        } else {
          lastQuestionNum++;
        }

        let promptText = plainText;
        let targetNode = node;

        // If line is just "Question 1:" look ahead for prompt text in next node
        if (/^(Question|Q|Problem)\s*\d+[:\.\)]?$/i.test(plainText)) {
          for (let j = i + 1; j < Math.min(i + 4, nodes.length); j++) {
            const nextContent = (nodes[j].content || '').replace(/<[^>]+>/g, '').trim();
            if (
              nextContent &&
              !/^(A\.|B\.|C\.|D\.|Option|Insert|Section)/i.test(nextContent)
            ) {
              promptText = nextContent;
              targetNode = nodes[j];
              i = j;
              break;
            }
          }
        }

        const questionNode = DocumentGraph.createObject(
          'Question',
          targetNode.bbox,
          promptText || node.content,
          {
            originalParagraphId: targetNode.id,
            detectionPattern: 'semantic_question',
          }
        );
        questionNodes.push(questionNode);
        console.log('[DocumentGraphConstructor] Detected question node', {
          id: questionNode.id,
          number: lastQuestionNum,
          content: (promptText || node.content).substring(0, 100)
        });
      }
    }

    return questionNodes;
  }

  /**
   * Determine whether a node is a true question start vs a list item or metadata
   */
  private static isQuestionStartNode(
    plainText: string,
    i: number,
    nodes: DocumentObject[],
    lastQuestionNum: number
  ): { isQuestion: boolean; num?: number } {
    const firstLine = plainText.split('\n')[0].trim();
    if (!firstLine) return { isQuestion: false };

    // Bullets on the first line are NEVER root question start nodes
    if (/^[\u2022•\-\*◦▪]/.test(firstLine)) {
      return { isQuestion: false };
    }

    // 1. Explicit markers: "Question 1:", "Question 1", "Q1.", "Q1:", "Problem 1:"
    const qMarkerMatch = firstLine.match(/^(Question|Q|Problem)\s*(\d+)[:\.\)]?/i);
    if (qMarkerMatch) {
      return { isQuestion: true, num: parseInt(qMarkerMatch[2], 10) };
    }

    // 2. Numbered prompt: "1. Which...", "2. Which...", "7. Which...", "13. Identify..."
    const numberedMatch = firstLine.match(/^(\d+)[\.\)]\s*(.*)/);
    if (numberedMatch) {
      const num = parseInt(numberedMatch[1], 10);
      const rest = numberedMatch[2].trim();

      // Check if it's a short list item like "1. Fetch", "2. Decode" vs a true question
      const wordCount = rest.split(/\s+/).length;
      const isShortListItem = wordCount <= 2 && !/^(Which|What|Who|When|Where|Why|How|Identify|Explain)\b/i.test(rest);
      if (!isShortListItem) {
        return { isQuestion: true, num };
      }
    }

    // 3. Unnumbered line containing explicit "Question" label or prompt prefix
    if (/^(Question|Q|Problem)\b/i.test(firstLine)) {
      return { isQuestion: true };
    }

    return { isQuestion: false };
  }

  /**
   * Check if content is likely an option
   */
  private static isLikelyOption(content: string): boolean {
    const trimmed = content.trim();

    // Never classify headers, statements, answers, explanations, or metadata as options
    if (/^(Question|Q|Problem|Section|Difficulty|Marks|Correct\s+Answer|Correct\s+Option|Explanation|Hint|Solution|Reason)\s*[:\.\)]/i.test(trimmed)) {
      return false;
    }
    if (/^(Question|Q|Problem|Section)\s+\d+/i.test(trimmed)) {
      return false;
    }

    // Explicit option pattern: A., B), (C), ☐, ☑, ✓, ✔
    if (/^[a-eA-E][\.\)]\s*/.test(trimmed) || /^\([a-eA-E]\)\s*/.test(trimmed) || /^[☐☑✓✔]\s*/.test(trimmed)) {
      return true;
    }

    return false;
  }
}
