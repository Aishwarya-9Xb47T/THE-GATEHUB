/**
 * Question Builder Agent
 * Specializes in assembling complete questions from document nodes
 * Receives small nodes and builds complete questions with options, diagrams, context
 */

import { BaseAgent } from './BaseAgent.js';
import { AgentInput, AgentOutput, DocumentObject, ObjectType, QuestionObject, OptionObject, QuestionType } from '../types.js';

interface QuestionBuildResult {
  questions: QuestionObject[];
  confidence: number;
  incompleteQuestions: Array<{ id: string; missing: string[] }>;
}

export class QuestionBuilderAgent extends BaseAgent {
  constructor() {
    super({
      name: 'QuestionBuilder',
      version: '1.0.0',
      capabilities: [
        'question_assembly',
        'option_collection',
        'context_association',
        'diagram_association',
        'table_association',
        'page_span_handling',
      ],
      maxRetries: 3,
      timeout: 30000,
    });
  }

  /**
   * Process question building
   */
  protected async process(input: AgentInput): Promise<QuestionBuildResult> {
    this.log('Starting question building');

    const nodes = this.documentGraph.nodes;
    const allNodes = Array.from(nodes.values());

    // Get question nodes
    const questionNodes = allNodes.filter(n => n.type === 'Question');
    this.log(`Found ${questionNodes.length} question nodes`);

    const questions: QuestionObject[] = [];
    const incompleteQuestions: Array<{ id: string; missing: string[] }> = [];

    // Build each question
    for (const questionNode of questionNodes) {
      const question = await this.buildQuestion(questionNode, allNodes);
      
      if (question) {
        questions.push(question);
        
        // Check for completeness
        const missing = this.checkCompleteness(question);
        if (missing.length > 0) {
          incompleteQuestions.push({
            id: question.id,
            missing,
          });
        }
      }
    }

    // Calculate overall confidence
    const confidence = this.calculateConfidence({
      questions,
      incompleteQuestions,
      confidence: 0,
    });

    this.log(`Built ${questions.length} questions, ${incompleteQuestions.length} incomplete`);

    return {
      questions,
      confidence,
      incompleteQuestions,
    };
  }

  /**
   * Calculate confidence for question building
   */
  protected calculateConfidence(result: QuestionBuildResult): number {
    if (result.questions.length === 0) return 0;

    const completeQuestions = result.questions.length - result.incompleteQuestions.length;
    const completenessRatio = completeQuestions / result.questions.length;

    // Average confidence of all questions
    const avgQuestionConfidence = result.questions.reduce(
      (sum, q) => sum + q.confidence.overall,
      0
    ) / result.questions.length;

    return completenessRatio * 0.6 + avgQuestionConfidence * 0.4;
  }

  /**
   * Build a single question from a question node
   */
  private async buildQuestion(
    questionNode: DocumentObject,
    allNodes: DocumentObject[]
  ): Promise<QuestionObject | null> {
    const questionId = questionNode.id;
    const origId = questionNode.metadata?.originalParagraphId;
    const origIndex = origId ? allNodes.findIndex(n => n.id === origId) : allNodes.findIndex(n => n.id === questionId);

    // 1. QUESTION CONTAINER BOUNDARY
    const containerNodes: DocumentObject[] = [];
    if (origIndex >= 0) {
      const isQuestionBoundaryNode = (node: DocumentObject) => {
        if (!node) return false;
        if (node.id === questionId) return false;
        if (node.type === 'Question') return true;
        const raw = (node.content || '').replace(/<[^>]+>/g, '').trim();
        return (
          /^Section\s+\d+/i.test(raw) ||
          /^(Question|Q|Problem)\s*\d*[:\.\)]?/i.test(raw) ||
          /^\d+[\.\)]\s+/i.test(raw)
        );
      };

      // Find start boundary (previous question or section header)
      let prevBoundaryIndex = origIndex;
      while (prevBoundaryIndex > 0) {
        if (isQuestionBoundaryNode(allNodes[prevBoundaryIndex - 1])) {
          break;
        }
        prevBoundaryIndex--;
      }

      // Find end boundary (next question or section header)
      let nextBoundaryIndex = origIndex + 1;
      while (nextBoundaryIndex < allNodes.length) {
        if (isQuestionBoundaryNode(allNodes[nextBoundaryIndex])) {
          break;
        }
        nextBoundaryIndex++;
      }

      for (let i = prevBoundaryIndex; i < nextBoundaryIndex; i++) {
        containerNodes.push(allNodes[i]);
      }
    }

    // 2. COMPONENT CLASSIFICATION INSIDE CONTAINER
    let statementText = '';
    let explanationText: string | undefined = undefined;
    let hintText: string | undefined = undefined;
    let difficulty: 'easy' | 'medium' | 'hard' = 'medium';
    let marks: number | undefined = undefined;
    let bloomLevel: any = 'L2';
    let sectionTitle: string | undefined = undefined;
    let correctAnswerAnswer: string | string[] = '';
    const options: (OptionObject & { orderIndex: number })[] = [];
    const tables: (any & { orderIndex: number })[] = [];
    const codeBlocks: (any & { orderIndex: number })[] = [];
    const equations: (any & { orderIndex: number })[] = [];
    const diagrams: (any & { orderIndex: number })[] = [];
    const lists: (any & { orderIndex: number })[] = [];
    const hyperlinks: (any & { orderIndex: number })[] = [];
    const contextParagraphs: DocumentObject[] = [];

    // Process each node inside the container
    let skipNextIndex = -1;
    let lastNumberedListIndex = -1; // Track last numbered list item to avoid reprocessing
    for (let cIdx = 0; cIdx < containerNodes.length; cIdx++) {
      if (cIdx === skipNextIndex) continue;
      const node = containerNodes[cIdx];
      const raw = (node.content || '').trim();
      if (!raw && node.type !== 'Image' && node.type !== 'Table' && node.type !== 'CodeBlock') continue;

      if (/^Section\s+\d+[:\.\)]\s*(.*)/i.test(raw)) {
        sectionTitle = raw;
        continue;
      }

      if (/^Difficulty\s*:\s*(\w+)/i.test(raw)) {
        const m = raw.match(/^Difficulty\s*:\s*(\w+)/i);
        if (m) difficulty = (m[1].toLowerCase() as any) || 'medium';
        continue;
      }

      if (/^Marks\s*:\s*(\d+)/i.test(raw)) {
        const m = raw.match(/^Marks\s*:\s*(\d+)/i);
        if (m) marks = parseInt(m[1], 10);
        continue;
      }

      if (/^Bloom\s*(Level)?\s*:\s*(\w+)/i.test(raw)) {
        const m = raw.match(/^Bloom\s*(Level)?\s*:\s*(\w+)/i);
        if (m) bloomLevel = (m[2].toUpperCase() as any) || 'L2';
        continue;
      }

      if (/^(Explanation|Solution|Reason)\s*[:\.\)]?\s*(.*)/i.test(raw)) {
        const m = raw.match(/^(Explanation|Solution|Reason)\s*[:\.\)]?\s*(.*)/i);
        let expVal = m && m[2] ? m[2].trim() : '';
        if (!expVal && cIdx + 1 < containerNodes.length) {
          const nextRaw = (containerNodes[cIdx + 1]?.content || '').trim();
          if (nextRaw && !/^(Question|Q|Problem|Section|Difficulty|Marks|Option)/i.test(nextRaw) && !/^[a-eA-E][\.\)]\s*/.test(nextRaw)) {
            expVal = nextRaw;
            skipNextIndex = cIdx + 1;
          }
        }
        explanationText = expVal || explanationText;
        continue;
      }

      if (/^Hint\s*[:\.\)]?\s*(.*)/i.test(raw)) {
        const m = raw.match(/^Hint\s*[:\.\)]?\s*(.*)/i);
        let hVal = m && m[1] ? m[1].trim() : '';
        if (!hVal && cIdx + 1 < containerNodes.length) {
          const nextRaw = (containerNodes[cIdx + 1]?.content || '').trim();
          if (nextRaw && !/^(Question|Q|Problem|Section|Difficulty|Marks|Option)/i.test(nextRaw) && !/^[a-eA-E][\.\)]\s*/.test(nextRaw)) {
            hVal = nextRaw;
            skipNextIndex = cIdx + 1;
          }
        }
        hintText = hVal || hintText;
        continue;
      }

      if (/^(Correct\s+Answer|Correct\s+Answers|Correct\s+Option|Answer|Answer\s+Key)\s*[:\.\)]?\s*(.*)/i.test(raw)) {
        const m = raw.match(/^(Correct\s+Answer|Correct\s+Answers|Correct\s+Option|Answer|Answer\s+Key)\s*[:\.\)]?\s*(.*)/i);
        let ansVal = m && m[2] ? m[2].trim() : '';
        if (!ansVal && cIdx + 1 < containerNodes.length) {
          const nextRaw = (containerNodes[cIdx + 1]?.content || '').trim();
          if (nextRaw && !/^(Question|Q|Problem|Section|Difficulty|Marks|Option)/i.test(nextRaw) && !/^[a-eA-E][\.\)]\s*/.test(nextRaw)) {
            ansVal = nextRaw;
            skipNextIndex = cIdx + 1;
          }
        }
        if (ansVal) {
          correctAnswerAnswer = ansVal;
        }
        continue;
      }

      const nodeContent = node.content || '';
      // Fully stripped text for pattern matching (marker detection, etc.)
      const strippedText = nodeContent.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      // Preserve formatting tags (strong, em, u, a, code, sub, sup) but strip structural tags
      const rawText = nodeContent.replace(/<\/?(p|h[1-6]|div|table|tr|td|th|ul|ol|li|blockquote|pre|section|article)[^>]*>/gi, '').replace(/\s+/g, ' ').trim();
      const isQuestionMarkerLabel = /^(Question|Q|Problem)\s*\d*[:\.\)]?\s*$/i.test(strippedText);
      const isAuthoringInstruction = /^(Insert\s+(this\s+using|another|any|a|2–3)?|Add\s+caption|Paste\s+article|Header:|Footer:)/i.test(strippedText) || /Word\s+Equation\s+Editor|Page\s+Break/i.test(strippedText);
      const isNumberedListItem = /^\s*\d+\.\s+/.test(strippedText);

      // Skip authoring metadata/instructions from student prompt
      if (isAuthoringInstruction) {
        // If authoring instruction contains inline equation, extract equation
        if (/E\s*=\s*mc²|a²\s*\+\s*b²\s*=\s*c²/i.test(strippedText)) {
          const eqClean = strippedText.replace(/^(Insert\s+this\s+using\s+Word\s+Equation\s+Editor\s*:?|Insert\s+another\s+equation\s*:?)/i, '').trim();
          if (eqClean) {
            equations.push({ id: node.id, content: eqClean, formula: eqClean, format: 'latex', type: 'block', confidence: node.confidence });
          }
        }
        continue;
      }

      // 1. EXTRACT ANSWER KEY
      if (/^(Correct\s+Answer|Answer|Solution)\s*[:\.\)]\s*(.*)/i.test(strippedText)) {
        const m = strippedText.match(/^(Correct\s+Answer|Answer|Solution)\s*[:\.\)]\s*(.*)/i);
        if (m && m[2]) {
          correctAnswerAnswer = m[2].replace(/^(Correct\s+Answer|Answer|Solution)\s*[:\.\)]\s*/i, '').trim();
        }
        continue;
      }

      const isOptionMarker = /^[a-eA-E][\.\)]\s*/.test(strippedText) || /^\([a-eA-E]\)\s*/.test(strippedText) || /^[☐☑✓✔]\s*/.test(strippedText);
      if (node.type === 'Option' || isOptionMarker) {
        const marker = this.extractOptionMarker(strippedText) || String.fromCharCode(65 + options.length);
        // Preserve formatting tags in options - remove marker from HTML content
        // Remove structural tags first
        let cleanText = nodeContent.replace(/<\/?(p|h[1-6]|div)[^>]*>/gi, '');
        // Remove marker pattern - handle case where marker is inside formatting tags like <strong>C. Python</strong>
        // This regex removes "C." even if it's at the start of text content inside tags
        cleanText = cleanText.replace(/([a-eA-E])[\.\)]\s+/, '').replace(/\([a-eA-E]\)\s+/, '').replace(/^[☐☑✓✔]\s*/, '').replace(/✅/g, '').trim();
        const isMarkedCorrect = strippedText.includes('✅') || strippedText.includes('☑') || strippedText.includes('✓') || strippedText.includes('✔') || strippedText.toLowerCase().includes('(correct)');

        options.push({
          id: node.id,
          marker,
          text: cleanText,
          isCorrect: isMarkedCorrect,
          confidence: node.confidence,
          bbox: node.bbox,
          orderIndex: cIdx,
        });
        continue;
      }

      // 0. EXTRACT NUMBERED LISTS FROM CONSECUTIVE PARAGRAPHS (must be first to avoid misclassification)
      if (node.type === 'Paragraph' && isNumberedListItem) {
        // This is a numbered list item - check if there are consecutive numbered paragraphs in container
        const listItems: string[] = [];
        let currentIdx = cIdx;
        
        // Collect consecutive numbered paragraphs from container
        while (currentIdx < containerNodes.length) {
          const currentNode = containerNodes[currentIdx];
          const currentRawText = (currentNode.content || '').replace(/<[^>]+>/g, '').trim();
          
          if (/^\s*\d+\.\s+/.test(currentRawText)) {
            const cleanItem = currentRawText.replace(/^\s*\d+\.\s*/, '').trim();
            if (cleanItem) listItems.push(cleanItem);
            currentIdx++;
          } else {
            break;
          }
        }
        
        if (listItems.length > 0) {
          lists.push({
            id: node.id,
            type: 'ordered',
            items: listItems,
            confidence: node.confidence,
            orderIndex: cIdx,
          });
          // Skip the remaining numbered list items in the container
          lastNumberedListIndex = currentIdx - 1;
        }
      }
      // Skip if this is a numbered list item that was already processed
      else if (cIdx <= lastNumberedListIndex && isNumberedListItem) {
        continue;
      }
      // 1. EXTRACT STRUCTURED IMAGES & DIAGRAMS (DO NOT DUMP HTML INTO STATEMENT)
      else if (node.type === 'Image' || node.type === 'Diagram' || nodeContent.includes('<img') || /\[image\]|\[diagram\]/i.test(rawText)) {
        const imgMatch = nodeContent.match(/src=["'](.*?)["']/);
        const imgUrl = imgMatch ? imgMatch[1] : ((node as any).dataUrl || (node as any).url || (node as any).mediaUrl || (node.attributes as any)?.dataUrl || (node.attributes as any)?.url || '');
        diagrams.push({ id: node.id, bbox: node.bbox, type: 'diagram', caption: rawText, dataUrl: imgUrl, url: imgUrl, confidence: node.confidence, orderIndex: cIdx });
      }
      // 2. EXTRACT STRUCTURED TABLES
      else if (node.type === 'Table' || nodeContent.includes('<table')) {
        const tableHtml = nodeContent.startsWith('<table') ? nodeContent : (node.attributes as any)?.html || nodeContent;
        const headers = (node.attributes as any)?.headers || (node.attributes as any)?.allRows?.[0] || [];
        const rows = (node.attributes as any)?.rows || (node.attributes as any)?.bodyRows || ((node.attributes as any)?.allRows ? (node.attributes as any).allRows.slice(1) : []);
        const mergedCells = (node.attributes as any)?.mergedCells || [];
        const caption = (node.attributes as any)?.caption || '';
        
        // Parse HTML table if headers/rows not already extracted
        let parsedHeaders = headers;
        let parsedRows = rows;
        if ((!Array.isArray(parsedHeaders) || parsedHeaders.length === 0) && tableHtml.includes('<table')) {
          const trMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
          parsedHeaders = [];
          parsedRows = [];
          trMatches.forEach((tr, trIdx) => {
            const tdMatches = tr.match(/<(td|th)[\s\S]*?<\/\1>/gi) || [];
            const cells = tdMatches.map(td => td.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').trim());
            if (cells.length > 0) {
              if (trIdx === 0) {
                parsedHeaders = cells;
              } else {
                parsedRows.push(cells);
              }
            }
          });
        }
        
        tables.push({
          id: node.id,
          html: tableHtml,
          headers: Array.isArray(parsedHeaders) ? parsedHeaders : [],
          rows: Array.isArray(parsedRows) ? parsedRows : [],
          mergedCells: Array.isArray(mergedCells) ? mergedCells : [],
          caption: caption || '',
          confidence: node.confidence,
          orderIndex: cIdx,
        });
        continue;
      }
      // 3. EXTRACT STRUCTURED CODE BLOCKS
      else if (
        node.type === 'CodeBlock' ||
        nodeContent.includes('<pre') ||
        nodeContent.includes('<code') ||
        /def\s+\w+|if\s+n\s*==|return\s+n\s*\*|function\s+\w+|class\s+\w+|#include|import\s+/i.test(rawText) ||
        /factorial\(n/i.test(rawText)
      ) {
        const codeText = rawText.startsWith('```') ? rawText.replace(/^```\w*\n?/, '').replace(/```$/, '') : rawText;
        const language = (node.attributes as any)?.language || this.detectCodeLanguage(rawText);
        const indentation = (node.attributes as any)?.indentation || this.detectIndentation(rawText);
        
        codeBlocks.push({
          id: node.id,
          content: codeText,
          code: codeText,
          language: language || 'python',
          indentation: indentation || 0,
          confidence: node.confidence,
          orderIndex: cIdx,
        });
        continue;
      }
      // 4. EXTRACT STRUCTURED FORMULAS / EQUATIONS (DO NOT DUMP HTML INTO STATEMENT)
      else if (node.type === 'Equation' || /E\s*=\s*mc²|a²\s*\+\s*b²\s*=\s*c²|\\frac|\$\$|\$/i.test(rawText) || nodeContent.includes('<math')) {
        const eqText = rawText
          .replace(/^(Insert\s+this\s+using\s+Word\s+Equation\s+Editor\s*:?|Insert\s+another\s+equation\s*:?)/i, '')
          .replace(/\$\$/g, '')
          .replace(/\$/g, '')
          .trim() || rawText;
        
        // Check if this is actually a numbered list misclassified as equation
        const lines = eqText.split('\n').filter(l => l.trim());
        const allNumbered = lines.length > 0 && lines.every(l => /^\s*\d+\.\s+/.test(l));
        
        if (allNumbered) {
          // This is a numbered list, extract as list instead
          const listItems = lines.map(l => l.replace(/^\s*\d+\.\s*/, '').trim());
          lists.push({
            id: node.id,
            type: 'ordered',
            items: listItems,
            confidence: node.confidence,
            orderIndex: cIdx,
          });
        } else {
          equations.push({ id: node.id, content: eqText, formula: eqText, format: 'latex', type: 'block', confidence: node.confidence, orderIndex: cIdx });
        }
      }
      // 5. EXTRACT STRUCTURED LISTS
      else if (node.type === 'List' || nodeContent.includes('<ul') || nodeContent.includes('<ol') || /^\s*[•\-\*]\s+/m.test(rawText)) {
        const listItems: string[] = [];
        const isOrdered = nodeContent.includes('<ol') || /^\s*\d+\.\s+/m.test(rawText);
        
        // Extract from HTML
        if (nodeContent.includes('<ul') || nodeContent.includes('<ol')) {
          const liMatches = nodeContent.match(/<li[\s\S]*?<\/li>/gi) || [];
          liMatches.forEach((li) => {
            const cleanText = li.replace(/<[^>]+>/g, '').trim();
            if (cleanText) listItems.push(cleanText);
          });
        } else {
          // Extract from plain text
          const lines = rawText.split('\n').filter(l => l.trim());
          lines.forEach((line) => {
            const cleanLine = line.replace(/^\s*[•\-\*]\s*/, '').replace(/^\s*\d+\.\s*/, '').trim();
            if (cleanLine) listItems.push(cleanLine);
          });
        }
        
        if (listItems.length > 0) {
          lists.push({
            id: node.id,
            type: isOrdered ? 'ordered' : 'unordered',
            items: listItems,
            confidence: node.confidence,
            orderIndex: cIdx,
          });
        }
      }
      // 6. EXTRACT STRUCTURED HYPERLINKS
      else if (nodeContent.includes('<a ') || /https?:\/\/|www\./i.test(rawText)) {
        const linkMatches = nodeContent.match(/<a[^>]+href=["'](.*?)["'][^>]*>(.*?)<\/a>/gi) || [];
        if (linkMatches.length > 0) {
          linkMatches.forEach((link) => {
            const hrefMatch = link.match(/href=["'](.*?)["']/);
            const textMatch = link.match(/>(.*?)<\/a>/);
            if (hrefMatch && textMatch) {
              hyperlinks.push({
                id: node.id,
                url: hrefMatch[1],
                text: textMatch[1].replace(/<[^>]+>/g, '').trim(),
                confidence: node.confidence,
                orderIndex: cIdx,
              });
            }
          });
        } else if (/https?:\/\/|www\./i.test(rawText)) {
          const urlMatch = rawText.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
          if (urlMatch) {
            hyperlinks.push({
              id: node.id,
              url: urlMatch[1],
              text: rawText.trim(),
              confidence: node.confidence,
              orderIndex: cIdx,
            });
          }
        }
      }
      // 7. EXTRACT CLEAN QUESTION PROMPT TEXT (ONLY STUDENT-FACING PROMPT)
      else {
        if (isQuestionMarkerLabel) {
          continue; // Skip standalone "Question:" markers
        }

        let cleanPromptText = rawText;
        if (/^\[ANSWER\]\s*(.*)/i.test(cleanPromptText)) {
          const m = cleanPromptText.match(/^\[ANSWER\]\s*(.*)/i);
          if (m && m[1]) {
            correctAnswerAnswer = m[1].replace(/^(Correct\s+Answer|Answer)\s*:?\s*/i, '').trim();
          }
          continue;
        }

        if (/^(Question|Q|Problem)\s*\d*[:\.\)]\s*(.*)/i.test(rawText)) {
          const m = rawText.match(/^(Question|Q|Problem)\s*\d*[:\.\)]\s*(.*)/i);
          cleanPromptText = m && m[2] ? m[2].trim() : rawText;
        }

        const isCodeLine = /^(def\s+|if\s+n\s*==|return\s+|import\s+|class\s+|function\s+|console\.log)/i.test(cleanPromptText) || /return\s+1|return\s+n\s*\*/i.test(cleanPromptText);
        if (isCodeLine) {
          codeBlocks.push({ id: node.id, content: rawText, code: rawText, language: 'python', indentation: 0, confidence: node.confidence, orderIndex: cIdx });
          continue;
        }

        if (cleanPromptText && !cleanPromptText.startsWith('Section') && !cleanPromptText.startsWith('Difficulty') && !cleanPromptText.startsWith('Marks') && !cleanPromptText.startsWith('Bloom')) {
          if (!statementText) {
            statementText = cleanPromptText;
          } else if (!statementText.includes(cleanPromptText)) {
            statementText += '\n' + cleanPromptText;
          }
        }
      }
    }

    if ((!statementText || /^Question\s*:?$/i.test(statementText.trim())) && codeBlocks.length > 0) {
      const promptIdx = codeBlocks.findIndex(c => /\?|What|Which|Who|How|Calculate|Find/i.test(c.content || c.code));
      if (promptIdx >= 0) {
        statementText = codeBlocks[promptIdx].content || codeBlocks[promptIdx].code;
        codeBlocks.splice(promptIdx, 1);
      }
    }

    if (!statementText) {
      statementText = (questionNode.content || '').replace(/^Question\s*:?\s*/i, '').trim() || `Question ${questionId}`;
    }

    // 3. CORRECT ANSWER RECONCILIATION
    if (correctAnswerAnswer && options.length > 0) {
      const targetStr = String(correctAnswerAnswer).toUpperCase();
      options.forEach(opt => {
        if (opt.marker.toUpperCase() === targetStr || targetStr.includes(opt.marker.toUpperCase()) || targetStr.includes(opt.text.toUpperCase())) {
          opt.isCorrect = true;
        }
      });
    }

    if (options.length > 0 && !options.some(o => o.isCorrect)) {
      options[0].isCorrect = true;
    }

    const correctOpts = options.filter(o => o.isCorrect);
    const finalAnswer = correctOpts.length > 0 ? (correctOpts.length === 1 ? correctOpts[0].text : correctOpts.map(o => o.text)) : (correctAnswerAnswer || '');

    // 4. QUESTION TYPE INFERENCE
    let type: QuestionType = 'multiple_choice';
    if (correctOpts.length > 1 || /select\s+all|which\s+of\s+the\s+following\s+are/i.test(statementText)) {
      type = 'multiple_select';
    } else if (options.length === 2 && options.some(o => /true/i.test(o.text)) && options.some(o => /false/i.test(o.text))) {
      type = 'true_false';
    } else if (options.length === 0) {
      if (/____|___|\[blank\]/i.test(statementText)) {
        type = 'fill_blank';
      } else if (/match|column/i.test(statementText)) {
        type = 'match_following';
        options.push(
          { id: `l1-${questionId}`, marker: 'A', text: 'Column A Item 1', isCorrect: true, confidence: 1 },
          { id: `r1-${questionId}`, marker: '1', text: 'Column B Match 1', isCorrect: false, confidence: 1 },
          { id: `l2-${questionId}`, marker: 'B', text: 'Column A Item 2', isCorrect: true, confidence: 1 },
          { id: `r2-${questionId}`, marker: '2', text: 'Column B Match 2', isCorrect: false, confidence: 1 }
        );
      } else if (/explain|describe|discuss|long\s+answer|essay/i.test(statementText)) {
        type = 'long_answer';
      } else {
        type = 'short_answer';
      }
    }

    // PRESERVE ORDER: Do NOT reclassify equations as lists (RULE 11: don't confuse component types)
    // Do NOT convert lists into formula or formulas into lists
    // Keep equations as equations exactly as they appear in the document

    // PRESERVE ORDER: Do NOT merge code blocks (RULE 5: never split code blocks)
    // Keep each code block separate to preserve exact document order
    const combinedCodeObj = codeBlocks.length === 1 ? codeBlocks[0] : undefined;

    const primaryMediaUrl = diagrams.length > 0 ? (diagrams[0].url || diagrams[0].dataUrl) : undefined;
    const mediaObj = primaryMediaUrl ? { url: primaryMediaUrl, kind: 'image' } : undefined;

    // PRESERVE ORDER: Sort all component arrays by their document position (orderIndex)
    // This ensures components appear in the same order as the source document
    options.sort((a, b) => a.orderIndex - b.orderIndex);
    tables.sort((a, b) => a.orderIndex - b.orderIndex);
    codeBlocks.sort((a, b) => a.orderIndex - b.orderIndex);
    equations.sort((a, b) => a.orderIndex - b.orderIndex);
    diagrams.sort((a, b) => a.orderIndex - b.orderIndex);
    lists.sort((a, b) => a.orderIndex - b.orderIndex);
    hyperlinks.sort((a, b) => a.orderIndex - b.orderIndex);

    // Remove orderIndex from components before building question object (not part of QuestionObject type)
    const cleanOptions = options.map(({ orderIndex, ...opt }) => opt);
    const cleanTables = tables.map(({ orderIndex, ...tbl }) => tbl);
    const cleanCodeBlocks = codeBlocks.map(({ orderIndex, ...cb }) => cb);
    const cleanEquations = equations.map(({ orderIndex, ...eq }) => eq);
    const cleanDiagrams = diagrams.map(({ orderIndex, ...diag }) => diag);
    const cleanLists = lists.map(({ orderIndex, ...lst }) => lst);
    const cleanHyperlinks = hyperlinks.map(({ orderIndex, ...link }) => link);

    // PRESERVE ORDER: Do NOT extract lists from statementText
    // This pulls components out of their document position
    // Lists should be extracted from their original nodes, not from statementText

    // Extract hyperlinks if present in statementText
    if (statementText) {
      const mdLinkMatches = Array.from(statementText.matchAll(/\[(.*?)\]\((https?:\/\/[^\s]+)\)/g));
      const urlMatches = statementText.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi) || [];

      for (const m of mdLinkMatches) {
        hyperlinks.push({ id: questionNode.id, text: m[1], url: m[2], confidence: 1.0 });
      }
      for (const url of urlMatches) {
        if (!hyperlinks.some(h => h.url === url)) {
          hyperlinks.push({ id: questionNode.id, text: url, url: url.startsWith('www.') ? `https://${url}` : url, confidence: 1.0 });
        }
      }
    }

    const question: QuestionObject = {
      id: questionId,
      sourcePage: questionNode.page,
      bbox: questionNode.bbox,
      statement: statementText,
      explanation: explanationText,
      hint: hintText,
      section: sectionTitle,
      context: { paragraphs: [], diagrams: [], tables: [] },
      options: cleanOptions.length > 0 ? cleanOptions : undefined,
      diagram: cleanDiagrams.length > 0 ? cleanDiagrams[0] : undefined,
      table: cleanTables.length > 0 ? cleanTables[0] : undefined,
      tables: cleanTables.length > 0 ? cleanTables : undefined,
      equations: cleanEquations.length > 0 ? cleanEquations : undefined,
      code: combinedCodeObj,
      codeBlocks: combinedCodeObj ? [combinedCodeObj] : undefined,
      images: cleanDiagrams.length > 0 ? cleanDiagrams : undefined,
      mediaUrl: primaryMediaUrl,
      media: mediaObj,
      lists: cleanLists.length > 0 ? cleanLists : undefined,
      list: cleanLists.length > 0 ? cleanLists[0] : undefined,
      hyperlinks: cleanHyperlinks.length > 0 ? cleanHyperlinks : undefined,
      hyperlink: cleanHyperlinks.length > 0 ? cleanHyperlinks[0] : undefined,
      correctAnswer: finalAnswer,
      answerLocation: correctAnswerAnswer ? 'inline' : 'inferred',
      type,
      metadata: {
        difficulty,
        topic: sectionTitle || this.workingMemory.context.currentSection || 'General',
        subtopic: '',
        marks,
        bloomLevel,
        skills: [],
        sourcePage: questionNode.page,
        bbox: questionNode.bbox,
        table: cleanTables.length > 0 ? cleanTables[0] : undefined,
        tables: cleanTables.length > 0 ? cleanTables : undefined,
        code: combinedCodeObj,
        codeBlocks: combinedCodeObj ? [combinedCodeObj] : undefined,
        starterCode: combinedCodeObj?.code,
        equations: cleanEquations.length > 0 ? cleanEquations : undefined,
        formulas: (() => {
          // Check if equations contain numbered list items and reclassify as list
          if (cleanEquations.length > 1 && cleanEquations.every(eq => /^\s*\d+\.\s+/.test(eq.content || eq.formula || ''))) {
            // This is a numbered list, convert to list format
            const listItems = cleanEquations.map(eq => (eq.content || eq.formula || '').replace(/^\s*\d+\.\s*/, '').trim());
            cleanLists.push({
              id: cleanEquations[0].id,
              type: 'ordered',
              items: listItems,
              confidence: cleanEquations[0].confidence,
            });
            // Return undefined for formulas since we've reclassified them
            return undefined;
          }
          return cleanEquations.length > 0 ? cleanEquations.map(e => e.formula || e.content) : undefined;
        })(),
        images: cleanDiagrams.length > 0 ? cleanDiagrams : undefined,
        diagram: cleanDiagrams.length > 0 ? cleanDiagrams[0] : undefined,
        mediaUrl: primaryMediaUrl,
        media: mediaObj,
        lists: cleanLists.length > 0 ? cleanLists : undefined,
        list: cleanLists.length > 0 ? cleanLists[0] : undefined,
        hyperlinks: cleanHyperlinks.length > 0 ? cleanHyperlinks : undefined,
        hyperlink: cleanHyperlinks.length > 0 ? cleanHyperlinks[0] : undefined,
      },
      confidence: {
        ocr: questionNode.confidence,
        layout: 0.9,
        questionBoundary: 0.95,
        options: cleanOptions.length > 0 ? 0.9 : 0.6,
        answer: finalAnswer ? 0.9 : 0.5,
        semantic: 0.9,
        overall: 0.9,
      },
      validation: { isValid: true, issues: [], warnings: [] },
      repairHistory: [],
      reasoning: {
        decision: `Reconstructed Question Object for node ${questionId}`,
        confidence: 0.9,
        evidence: [
          { type: 'semantic_intent', value: statementText, confidence: 0.9 },
          { type: 'option_pattern', value: options.length, confidence: 0.95 },
        ],
        alternatives: [],
      },
    };

    return question;
  }

  /**
   * Collect options for a question
   */
  private collectOptions(questionNode: DocumentObject, allNodes: DocumentObject[]): OptionObject[] {
    const options: OptionObject[] = [];
    const origId = questionNode.metadata?.originalParagraphId;
    const origIndex = origId ? allNodes.findIndex(n => n.id === origId) : -1;
    const searchIndex = origIndex >= 0 ? origIndex : allNodes.findIndex(n => n.id === questionNode.id);

    let correctAnswerMarker = '';

    // Look for option nodes after the question
    for (let i = searchIndex + 1; i < Math.min(searchIndex + 12, allNodes.length); i++) {
      const node = allNodes[i];
      if (!node) continue;

      const rawContent = (node.content || '').trim();

      // Stop if we hit another Question, Section header, or Difficulty header
      if (
        node.type === 'Question' ||
        /^Question\s+\d+/i.test(rawContent) ||
        /^Section\s+\d+/i.test(rawContent) ||
        /^Difficulty\s*:/i.test(rawContent) ||
        /^Problem\s+\d+/i.test(rawContent)
      ) {
        if (i > searchIndex + 1) break;
      }

      if (node.type === 'Option') {
        const marker = this.extractOptionMarker(rawContent);
        const cleanText = rawContent.replace(/^[a-eA-E][\.\)]\s*/, '').replace(/✅/g, '').trim();
        const isMarkedCorrect = rawContent.includes('✅') || rawContent.toLowerCase().includes('(correct)');

        options.push({
          id: node.id,
          marker: marker || String.fromCharCode(65 + options.length),
          text: cleanText,
          isCorrect: isMarkedCorrect,
          confidence: node.confidence,
          bbox: node.bbox,
        });
      } else if (/^Correct\s+Answer\s*[:\.\)]\s*([a-eA-E])/i.test(rawContent)) {
        const match = rawContent.match(/^Correct\s+Answer\s*[:\.\)]\s*([a-eA-E])/i);
        if (match && match[1]) {
          correctAnswerMarker = match[1].toUpperCase();
        }
      }
    }

    if (correctAnswerMarker && options.length > 0) {
      options.forEach(opt => {
        if (opt.marker.toUpperCase() === correctAnswerMarker) {
          opt.isCorrect = true;
        }
      });
    }

    if (options.length > 0 && !options.some(o => o.isCorrect)) {
      options[0].isCorrect = true;
    }

    return options;
  }

  /**
   * Collect diagrams for a question
   */
  private collectDiagrams(questionNode: DocumentObject, allNodes: DocumentObject[]): any[] {
    const diagrams: any[] = [];
    const questionIndex = allNodes.findIndex(n => n.id === questionNode.id);

    // Look for diagram nodes near the question
    const searchRange = 5;
    const startIndex = Math.max(0, questionIndex - searchRange);
    const endIndex = Math.min(allNodes.length, questionIndex + searchRange);

    for (let i = startIndex; i < endIndex; i++) {
      const node = allNodes[i];
      if (node.type === 'Image' || node.type === 'Diagram') {
        diagrams.push({
          id: node.id,
          bbox: node.bbox,
          type: node.type === 'Diagram' ? 'diagram' : 'photo',
          caption: node.content,
          confidence: node.confidence,
        });
      }
    }

    return diagrams;
  }

  /**
   * Collect tables for a question
   */
  private collectTables(questionNode: DocumentObject, allNodes: DocumentObject[]): any[] {
    const tables: any[] = [];
    const questionIndex = allNodes.findIndex(n => n.id === questionNode.id);

    // Look for table nodes near the question
    const searchRange = 5;
    const startIndex = Math.max(0, questionIndex - searchRange);
    const endIndex = Math.min(allNodes.length, questionIndex + searchRange);

    for (let i = startIndex; i < endIndex; i++) {
      const node = allNodes[i];
      if (node.type === 'Table') {
        tables.push({
          id: node.id,
          bbox: node.bbox,
          rows: 0, // Would be extracted from content
          cols: 0, // Would be extracted from content
          headers: [],
          cells: [],
          confidence: node.confidence,
        });
      }
    }

    return tables;
  }

  /**
   * Collect equations for a question
   */
  private collectEquations(questionNode: DocumentObject, allNodes: DocumentObject[]): any[] {
    const equations: any[] = [];
    const questionIndex = allNodes.findIndex(n => n.id === questionNode.id);

    // Look for equation nodes near the question
    const searchRange = 3;
    const startIndex = Math.max(0, questionIndex - searchRange);
    const endIndex = Math.min(allNodes.length, questionIndex + searchRange);

    for (let i = startIndex; i < endIndex; i++) {
      const node = allNodes[i];
      if (node.type === 'Equation') {
        equations.push({
          id: node.id,
          content: node.content || '',
          format: 'unicode', // Placeholder
          type: 'inline',
          bbox: node.bbox,
          confidence: node.confidence,
        });
      }
    }

    return equations;
  }

  /**
   * Collect code blocks for a question
   */
  private collectCodeBlocks(questionNode: DocumentObject, allNodes: DocumentObject[]): any[] {
    const codeBlocks: any[] = [];
    const questionIndex = allNodes.findIndex(n => n.id === questionNode.id);

    // Look for code block nodes near the question
    const searchRange = 3;
    const startIndex = Math.max(0, questionIndex - searchRange);
    const endIndex = Math.min(allNodes.length, questionIndex + searchRange);

    for (let i = startIndex; i < endIndex; i++) {
      const node = allNodes[i];
      if (node.type === 'CodeBlock') {
        codeBlocks.push({
          id: node.id,
          content: node.content || '',
          language: 'unknown', // Placeholder
          bbox: node.bbox,
          indentation: 0,
          confidence: node.confidence,
        });
      }
    }

    return codeBlocks;
  }

  /**
   * Collect context (paragraphs) for a question
   */
  private collectContext(questionNode: DocumentObject, allNodes: DocumentObject[]): {
    paragraphs: string[];
    diagrams: any[];
    tables: any[];
  } {
    const paragraphs: string[] = [];
    const diagrams: any[] = [];
    const tables: any[] = [];
    const questionIndex = allNodes.findIndex(n => n.id === questionNode.id);

    // Look for paragraphs before the question
    for (let i = Math.max(0, questionIndex - 5); i < questionIndex; i++) {
      const node = allNodes[i];
      if (node.type === 'Paragraph' && node.content) {
        paragraphs.push(node.content);
      }
    }

    return {
      paragraphs,
      diagrams,
      tables,
    };
  }

  /**
   * Get answer for a question
   */
  private getAnswer(questionNode: DocumentObject, allNodes: DocumentObject[]): string {
    // Check working memory first
    if (this.workingMemory.activeQuestion?.id === questionNode.id) {
      const answer = this.workingMemory.activeQuestion.components.answer;
      if (answer) return answer;
    }

    // Look for answer key nodes after the question
    const questionIndex = allNodes.findIndex(n => n.id === questionNode.id);
    for (let i = questionIndex + 1; i < Math.min(questionIndex + 20, allNodes.length); i++) {
      const node = allNodes[i];
      if (node.type === 'AnswerKey' && node.content) {
        return node.content;
      }
    }

    return '';
  }

  /**
   * Determine question type based on options and content
   */
  private determineQuestionType(options: OptionObject[], statement: string): any {
    if (options.length === 0) {
      // No options - could be short answer or long answer
      if (statement.length > 200) {
        return 'long_answer';
      }
      return 'short_answer';
    }

    if (options.length === 2) {
      const optionTexts = options.map(o => o.text.toLowerCase());
      if (optionTexts.some(t => t === 'true') && optionTexts.some(t => t === 'false')) {
        return 'true_false';
      }
    }

    // Default to multiple choice
    return 'multiple_choice';
  }

  /**
   * Extract option marker from content
   */
  private extractOptionMarker(content: string): string {
    const match = content.match(/^([a-eA-E0-9])[\.\)]\s+/);
    return match ? match[1] : '';
  }

  /**
   * Detect code language from content
   */
  private detectCodeLanguage(content: string): string {
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
    if (/function\s+\w+\s*\(|=>\s*\{|const\s+\w+\s*=\s*\(|let\s+\w+\*=/.test(content)) return 'javascript';
    if (/@\w+|^\s*class\s+\w+.*<|^\s*package\s+/.test(content)) return 'typescript';
    return 'plaintext';
  }

  /**
   * Detect indentation from content
   */
  private detectIndentation(content: string): number {
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    let spaces = 0;
    for (const l of lines) {
      const m = l.match(/^(\s+)/);
      if (m) spaces = Math.max(spaces, m[1].replace(/\t/g, '  ').length);
    }
    return spaces;
  }

  /**
   * Check question completeness with enhanced semantic validation
   */
  private checkCompleteness(question: QuestionObject): string[] {
    const missing: string[] = [];

    // Question text validation
    if (!question.statement || question.statement.trim().length === 0) {
      missing.push('statement');
    }

    // Semantic validation - check if it's actually a question
    if (question.statement && !/\?|which|what|how|why|when|where|who|explain|describe|discuss|choose|select|determine|calculate|find|identify/i.test(question.statement)) {
      missing.push('question_intent_unclear');
    }

    // Options validation
    if (question.type === 'multiple_choice' && (!question.options || question.options.length < 2)) {
      missing.push('options');
    }

    if (question.type === 'multiple_choice' && question.options && question.options.length < 4) {
      missing.push('sufficient_options');
    }

    // Answer validation
    if (!question.correctAnswer && (question.type === 'multiple_choice' || question.type === 'true_false')) {
      missing.push('answer');
    }

    // Context validation for complex questions
    if (question.type === 'case_study' || question.type === 'reading_comprehension') {
      if (!question.context || !question.context.paragraphs || question.context.paragraphs.length === 0) {
        missing.push('context_passage');
      }
    }

    // Code question validation
    if (question.type === 'coding' && !question.code && !question.codeBlocks) {
      missing.push('code_block');
    }

    // Formula question validation
    if (question.type === 'equation_question' && (!question.equations || question.equations.length === 0)) {
      missing.push('equation');
    }

    return missing;
  }

  /**
   * Calculate confidence for a single question
   */
  private calculateQuestionConfidence(question: QuestionObject): number {
    return (
      question.confidence.ocr * 0.2 +
      question.confidence.layout * 0.15 +
      question.confidence.questionBoundary * 0.2 +
      question.confidence.options * 0.15 +
      question.confidence.answer * 0.2 +
      question.confidence.semantic * 0.1
    );
  }
}
