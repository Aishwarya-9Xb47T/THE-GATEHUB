/**
 * Document Intelligence Adapter
 * Adapts DocumentIntelligenceEngine output to ExtractedQuestionDraft format
 * Bridges the new vision-based engine with the existing pipeline
 */

import { AntiGravityV2Engine } from '../../../antigravityV2/AntiGravityV2Engine.js';
import type { AntiGravityV2Result, V2QuestionBlock, V2QuestionOption } from '../../../antigravityV2/types.js';
import { QuestionObject } from '../documentIntelligence/types.js';
import { ExtractedQuestionDraft } from '../unifiedTypes.js';
import { randomUUID } from 'crypto';

export class DocumentIntelligenceAdapter {
  /**
   * Extract questions using AntiGravityV2Engine and convert to ExtractedQuestionDraft format
   */
  static async extract(file: { buffer: Buffer; name: string; mimeType: string }): Promise<ExtractedQuestionDraft[]> {
    console.log('=== DocumentIntelligenceAdapter.extract ENTRY (AntiGravity V2) ===');
    console.log('INPUT:', {
      fileName: file.name,
      mimeType: file.mimeType,
      fileSize: file.buffer.length,
      bufferLength: file.buffer.length
    });

    try {
      const startTime = Date.now();
      const v2Result = await AntiGravityV2Engine.processDocument(file);
      const duration = Date.now() - startTime;

      console.log('[DocumentIntelligenceAdapter] AntiGravityV2Engine completed', {
        duration: `${duration}ms`,
        success: v2Result.success,
        questionCount: v2Result.questions?.length || 0,
        pageCount: v2Result.document?.pageCount || 0,
        blocks: v2Result.blocks?.length || 0,
        tables: v2Result.tables?.length || 0,
        images: v2Result.images?.length || 0,
      });

      if (!v2Result.success) {
        console.error('[DocumentIntelligenceAdapter] AntiGravityV2Engine returned success=false', v2Result.error);
        return [];
      }

      if (!v2Result.questions?.length) {
        console.warn('[DocumentIntelligenceAdapter] No questions detected in document');
        return [];
      }

      const converted = this.convertV2Questions(v2Result, file.name);

      console.log('=== DocumentIntelligenceAdapter.extract EXIT ===');
      console.log('OUTPUT:', {
        convertedCount: converted.length,
        firstConverted: converted[0] ? {
          id: converted[0].id,
          text: converted[0].text.substring(0, 100),
          type: converted[0].type,
          confidence: converted[0].confidence,
          optionCount: converted[0].options?.length || 0,
        } : null
      });

      return converted;
    } catch (error) {
      console.error('=== DocumentIntelligenceAdapter.extract ERROR ===', error);
      throw error;
    }
  }

  /**
   * Map AntiGravity V2 question blocks into pipeline drafts with full structural fidelity.
   */
  private static convertV2Questions(v2Result: AntiGravityV2Result, fileName: string): ExtractedQuestionDraft[] {
    const drafts = v2Result.questions.map((q, index) => this.convertV2QuestionBlock(q, index, v2Result, fileName));
    return this.flagDuplicateQuestions(drafts);
  }

  /** Soft duplicate detection — never auto-remove; Teacher decides. */
  private static flagDuplicateQuestions(drafts: ExtractedQuestionDraft[]): ExtractedQuestionDraft[] {
    const seen = new Map<string, number>();
    return drafts.map((q, index) => {
      const key = (q.text || q.statement || '')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!key || key.length < 12) return q;
      const prev = seen.get(key);
      if (prev !== undefined) {
        return {
          ...q,
          warnings: [
            ...(q.warnings || []),
            `Possible duplicate question detected (similar to question ${prev + 1}).`,
          ],
        };
      }
      seen.set(key, index);
      return q;
    });
  }

  private static convertV2QuestionBlock(
    q: V2QuestionBlock,
    index: number,
    v2Result: AntiGravityV2Result,
    fileName: string,
  ): ExtractedQuestionDraft {
    const sourcePage = this.inferSourcePage(q, v2Result);
    const sourceSlide = this.inferSourceSlide(q, v2Result);
    let options = this.convertV2Options(q.options || []);
    options = this.applyCorrectAnswerFromSource(q, options);

    const listChildren = (q.children || []).filter((c) => c.type === 'list');
    const listsMeta = listChildren.map((l, li) => ({
      id: `lst_${q.id}_${li}`,
      style: l.type === 'list' && l.ordered ? 'ordered' : 'unordered',
      items: l.type === 'list' ? l.items : [],
    }));

    const hyperlinkChildren = (q.children || []).filter((c) => c.type === 'hyperlink');
    const hyperlinksMeta = [
      ...hyperlinkChildren.map((h) => ({
        url: h.type === 'hyperlink' ? h.url : '',
        text: h.type === 'hyperlink' ? (h.displayText || h.url) : '',
      })),
      ...(q.hyperlinks || []).filter((url) => !hyperlinkChildren.some((hc) => hc.type === 'hyperlink' && hc.url === url))
        .map((url) => ({ url, text: url })),
    ];

    const allImages = q.associatedImages.map((img) => ({
      id: img.id,
      dataUrl: img.base64 || img.url,
      url: img.url || img.base64,
      caption: img.caption || img.altText || '',
      width: undefined as number | undefined,
      height: undefined as number | undefined,
    })).filter((img) => {
      const url = img.url || img.dataUrl || '';
      if (!url || url === 'https://') return false;
      if (url.startsWith('data:image/')) {
        const commaIdx = url.indexOf(',');
        return commaIdx >= 0 && url.length - commaIdx - 1 >= 32;
      }
      return url.length > 5;
    });

    for (const child of q.children || []) {
      if (child.type === 'image' && child.imageUrl && !allImages.some((img) => img.url === child.imageUrl)) {
        allImages.push({
          id: child.id,
          dataUrl: child.imageUrl,
          url: child.imageUrl,
          caption: child.caption || '',
          width: undefined,
          height: undefined,
        });
      }
    }

    const firstImage = allImages[0];
    const confidence = this.computeV2QuestionConfidence(q, options);

    // Prefer associated code; fall back to children code blocks
    const codeFromChildren = (q.children || [])
      .filter((c) => c.type === 'code')
      .map((c) => ({
        id: c.id,
        type: 'code' as const,
        language: (c as any).language || 'text',
        code: (c as any).code || '',
        indentationPreserved: true,
      }));
    const associatedCode = (q.associatedCode?.length ? q.associatedCode : codeFromChildren)
      .filter((c) => String(c.code || '').trim().length > 0);
    const primaryCode = associatedCode[0];

    return {
      id: q.id || `v2_q_${index + 1}`,
      text: q.stem?.trim() || '',
      statement: q.stem?.trim() || '',
      type: this.normalizeQuestionType(q.type),
      children: q.children as any,
      options,
      correctAnswer: this.extractV2CorrectAnswer(q, options),
      explanation: q.explanation || '',
      hints: q.hints || [],
      difficulty: this.normalizeDifficulty(q.difficulty),
      bloomLevel: this.normalizeBloomLevel(q.bloomsLevel),
      tags: [],
      confidence,
      warnings: this.generateV2Warnings(q, options),
      sourcePage,
      sectionTitle: v2Result.document?.title || fileName,
      metadata: {
        sourceDocument: fileName,
        sourcePage,
        sourceSlide,
        sourceBlockId: q.id,
        sourceQuestionNumber: q.sourceQuestionNumber,
        section: q.currentSection,
        marks: typeof q.points === 'number' && Number.isFinite(q.points) ? q.points : undefined,
        points: typeof q.points === 'number' && Number.isFinite(q.points) ? q.points : undefined,
        ...(q.difficulty ? { difficulty: this.normalizeDifficulty(q.difficulty) } : {}),
        answerKeySource: q.answerKeySource,
        children: q.children,
        optionLabels: (q.options || []).map((o) => o.label),
        table: q.associatedTables[0] ? {
          headers: q.associatedTables[0].headers,
          rows: q.associatedTables[0].grid.map((row) =>
            row.map((cell) => cell.paragraphs.map((p) => p.plainText).join(' '))
          ),
          caption: q.associatedTables[0].caption || '',
          html: q.associatedTables[0].html,
        } as any : undefined,
        tables: q.associatedTables.map((t) => ({
          headers: t.headers,
          rows: t.grid.map((row) => row.map((cell) => cell.paragraphs.map((p) => p.plainText).join(' '))),
          caption: t.caption || '',
          html: t.html,
        })),
        formulas: q.associatedMath.map((m) => m.latex),
        equations: q.associatedMath,
        mediaUrl: firstImage?.url || firstImage?.dataUrl || '',
        images: allImages.length > 0 ? allImages : undefined,
        media: firstImage ? {
          url: firstImage.url || firstImage.dataUrl,
          kind: 'image',
          caption: firstImage.caption || '',
        } : undefined,
        lists: listsMeta.length > 0 ? listsMeta : undefined,
        list: listsMeta[0] || undefined,
        hyperlinks: hyperlinksMeta.length > 0 ? hyperlinksMeta : undefined,
        diagrams: q.associatedDiagrams,
        charts: q.associatedCharts,
        comments: q.associatedComments,
        speakerNote: q.associatedSpeakerNote,
        extractionConfidence: confidence,
        pageCount: v2Result.document?.pageCount,
        code: primaryCode
          ? {
              code: primaryCode.code,
              language: primaryCode.language || 'text',
              indentation: 0,
            }
          : undefined,
        starterCode: primaryCode?.code || '',
        language: primaryCode?.language || undefined,
        codeBlocks: associatedCode.length > 0 ? associatedCode : undefined,
      },
    };
  }

  private static convertV2Options(options: V2QuestionOption[]): ExtractedQuestionDraft['options'] {
    if (!options.length) return [];
    return options.map((opt, index) => ({
      id: opt.id || randomUUID(),
      text: opt.text.trim(),
      isCorrect: Boolean(opt.isCorrect),
      order: index,
    }));
  }

  private static applyCorrectAnswerFromSource(
    q: V2QuestionBlock,
    options: ExtractedQuestionDraft['options'],
  ): ExtractedQuestionDraft['options'] {
    if (!options.length || options.some((o) => o.isCorrect)) return options;
    if (!q.correctAnswer) return options;

    const answers = Array.isArray(q.correctAnswer)
      ? q.correctAnswer.map(String)
      : [String(q.correctAnswer)];

    return options.map((opt, index) => {
      const label = q.options[index]?.label;
      const isCorrect = answers.some((ans) => {
        const normalized = ans.trim();
        if (label && normalized.toUpperCase() === label.toUpperCase()) return true;
        if (normalized === opt.text.trim()) return true;
        if (label && normalized.toUpperCase() === `${label.toUpperCase()}. ${opt.text.trim()}`.toUpperCase()) return true;
        return false;
      });
      return { ...opt, isCorrect };
    });
  }

  private static extractV2CorrectAnswer(
    q: V2QuestionBlock,
    options: ExtractedQuestionDraft['options'],
  ): string {
    const correctOpts = options.filter((o) => o.isCorrect);
    if (correctOpts.length === 1) {
      const idx = options.indexOf(correctOpts[0]!);
      const label = q.options[idx]?.label;
      return label || correctOpts[0]!.text;
    }
    if (correctOpts.length > 1) {
      return correctOpts.map((o, i) => q.options[options.indexOf(o)]?.label || o.text).join(', ');
    }
    if (q.correctAnswer) {
      return Array.isArray(q.correctAnswer) ? q.correctAnswer.join(', ') : String(q.correctAnswer);
    }
    return '';
  }

  private static inferSourcePage(q: V2QuestionBlock, v2Result: AntiGravityV2Result): number {
    const fromParagraph = q.associatedParagraphs?.find((p: any) => typeof p.page === 'number') as any;
    if (fromParagraph?.page) return fromParagraph.page;
    for (const page of v2Result.document?.pages || []) {
      if ((page as any).blocks?.some((b: any) => b.id === q.id)) {
        return (page as any).pageNumber || (page as any).index || 1;
      }
    }
    return 1;
  }

  private static inferSourceSlide(q: V2QuestionBlock, v2Result: AntiGravityV2Result): number | undefined {
    if (!/ppt/i.test(v2Result.format || '')) return undefined;
    for (const page of v2Result.document?.pages || []) {
      if ((page as any).slideIndex != null && (page as any).blocks?.some((b: any) => b.id === q.id)) {
        return (page as any).slideIndex;
      }
    }
    return undefined;
  }

  private static computeV2QuestionConfidence(
    q: V2QuestionBlock,
    options: ExtractedQuestionDraft['options'],
  ): number {
    const normalizedType = this.normalizeQuestionType(q.type);
    const nonOptionTypes = ['short_answer', 'long_answer', 'essay', 'fill_blank'];
    const isNonOptionType = nonOptionTypes.includes(String(normalizedType));

    let score = 0.55;
    const stemLen = q.stem?.trim().length || 0;
    if (stemLen > 8) score += 0.12;
    if (stemLen > 25) score += 0.08;

    if (options.length >= 2) score += 0.15;
    else if (isNonOptionType && stemLen > 8) score += 0.18;

    if (options.some((o) => o.isCorrect)) score += 0.15;
    else if (q.correctAnswer) score += 0.1;

    if (q.explanation?.trim()) score += 0.05;
    if (q.associatedTables.length > 0 || q.associatedImages.length > 0 || q.associatedCode.length > 0 || q.associatedMath.length > 0) {
      score += 0.05;
    }
    if (q.sourceQuestionNumber != null) score += 0.03;

    return Math.min(0.98, Math.round(score * 100) / 100);
  }

  private static generateV2Warnings(q: V2QuestionBlock, options: ExtractedQuestionDraft['options']): string[] {
    const warnings: string[] = [];
    const normalizedType = this.normalizeQuestionType(q.type);
    if (!q.stem?.trim()) warnings.push('Missing question text');
    if (['multiple_choice', 'multiple_select', 'true_false'].includes(String(normalizedType)) && options.length < 2) {
      warnings.push('Fewer than 2 options detected');
    }
    if (options.length >= 2 && !options.some((o) => o.isCorrect) && !q.correctAnswer) {
      warnings.push('No answer key evidence found — set the correct answer in review');
    }
    if (typeof q.points === 'number' && (!Number.isFinite(q.points) || q.points < 0)) {
      warnings.push('Invalid marks value');
    }
    // Duplicate option text
    const texts = options.map((o) => o.text.trim().toLowerCase()).filter(Boolean);
    if (texts.length !== new Set(texts).size) {
      warnings.push('Duplicate option text detected');
    }
    return warnings;
  }

  /**
   * Convert QuestionObject to ExtractedQuestionDraft
   * Ensures exact metadata format for frontend native components
   */
  private static convertToExtractedQuestionDraft(questions: QuestionObject[]): ExtractedQuestionDraft[] {
    return questions.map((q, index) => {
      const qMeta = (q.metadata || {}) as any;
      const qAttr = ((q as any).attributes || {}) as any;
      
      // Extract media URL for image component
      const mediaUrl =
        (q as any).mediaUrl ||
        qMeta.mediaUrl ||
        qAttr.mediaUrl ||
        (q as any).diagram?.url ||
        (q as any).diagram?.dataUrl ||
        qAttr.diagram?.url ||
        qAttr.diagram?.dataUrl ||
        (q as any).images?.[0]?.url ||
        (q as any).images?.[0]?.dataUrl ||
        qAttr.images?.[0]?.dataUrl ||
        qAttr.images?.[0]?.url ||
        (Array.isArray(qMeta.images) ? qMeta.images[0]?.dataUrl || qMeta.images[0]?.url : undefined);

      // Format media object for image component
      const media = (q as any).media || qMeta.media || qAttr.media || (mediaUrl ? { url: mediaUrl, kind: 'image' } : undefined);

      // Extract and format tables for EditableTableComponent
      const tableData = this.extractTableData(q, qMeta, qAttr);
      
      // Extract and format formulas for EditableFormulaComponent
      const formulaData = this.extractFormulaData(q, qMeta, qAttr);
      
      // Extract and format images for EditableImageComponent
      const imageData = this.extractImageData(q, qMeta, qAttr, mediaUrl);
      
      // Extract and format code for code component
      const codeData = this.extractCodeData(q, qMeta, qAttr);

      // Determine language for CodingEditor (top-level in meta, line 582)
      const language =
        (typeof qMeta.language === 'string' ? qMeta.language : undefined) ||
        (typeof qAttr.language === 'string' ? qAttr.language : undefined) ||
        (typeof (q as any).language === 'string' ? (q as any).language : undefined) ||
        codeData.single?.language ||
        (Array.isArray(codeData.array) && codeData.array[0]?.language) ||
        (q.type && /code|sql|programming/i.test(q.type) ? (String(q.type).toLowerCase().includes('sql') ? 'sql' : 'python') : undefined);

      // Starter code (top-level in meta, line 585)
      const starterCode =
        (typeof qMeta.starterCode === 'string' ? qMeta.starterCode : undefined) ||
        (typeof qAttr.starterCode === 'string' ? qAttr.starterCode : undefined) ||
        (typeof (q as any).starterCode === 'string' ? (q as any).starterCode : undefined) ||
        codeData.starter ||
        codeData.single?.code ||
        (Array.isArray(codeData.array) && codeData.array[0]?.code ? codeData.array[0].code : '');

      const expectedOutput =
        (typeof qMeta.expectedOutput === 'string' ? qMeta.expectedOutput : undefined) ||
        (typeof qMeta.solutionCode === 'string' ? qMeta.solutionCode : undefined) ||
        (typeof qAttr.expectedOutput === 'string' ? qAttr.expectedOutput : undefined) ||
        (typeof (q as any).expectedOutput === 'string' ? (q as any).expectedOutput : undefined);

      // Image width (top-level in meta, EditableImageComponent line 36)
      const imageWidth =
        (typeof qMeta.imageWidth === 'number' ? qMeta.imageWidth : undefined) ||
        (typeof qAttr.imageWidth === 'number' ? qAttr.imageWidth : undefined) ||
        imageData.width ||
        100;

      const caption =
        (typeof qMeta.caption === 'string' ? qMeta.caption : undefined) ||
        (typeof qAttr.caption === 'string' ? qAttr.caption : undefined) ||
        imageData.caption ||
        (media && (media as any).caption) ||
        (Array.isArray(imageData.array) && imageData.array[0]?.caption ? imageData.array[0].caption : '');

      const altText =
        (typeof qMeta.altText === 'string' ? qMeta.altText : undefined) ||
        (typeof qAttr.altText === 'string' ? qAttr.altText : undefined) ||
        imageData.altText ||
        caption ||
        'Question Image';

      // First table (single) for caption/alignments also carried top-level
      const firstTable = tableData.single;

      return {
        id: q.id || randomUUID(),
        text: q.statement,
        type: this.normalizeQuestionType(q.type),
        options: this.convertOptions(q.options, q.statement),
        correctAnswer: this.extractCorrectAnswer(q),
        explanation: q.explanation || qMeta.explanation || undefined,
        difficulty: this.normalizeDifficulty(q.metadata.difficulty),
        bloomLevel: this.normalizeBloomLevel(q.metadata.bloomLevel),
        tags: q.metadata.skills || [],
        confidence: q.confidence.overall,
        warnings: this.generateWarnings(q),
        metadata: {
          originalBlockId: q.id,
          sourcePage: q.sourcePage,
          hint: q.hint,
          section: q.section,
          context: q.context,
          
          // Only include specific original metadata fields that exist and have values
          ...(q.metadata.difficulty ? { difficulty: q.metadata.difficulty } : {}),
          ...(q.metadata.topic ? { topic: q.metadata.topic } : {}),
          ...(q.metadata.subtopic ? { subtopic: q.metadata.subtopic } : {}),
          ...(q.metadata.marks ? { marks: q.metadata.marks } : {}),
          ...(q.metadata.bloomLevel ? { bloomLevel: q.metadata.bloomLevel } : {}),
          ...(q.metadata.skills && q.metadata.skills.length > 0 ? { skills: q.metadata.skills } : {}),
          ...(q.metadata.bbox ? { bbox: q.metadata.bbox } : {}),
          
          // EditableTableComponent format - preserve exact original order based on key existence in original metadata
          ...(q.metadata.table !== undefined ? { table: firstTable || null } : {}),
          ...(q.metadata.tables !== undefined ? { tables: tableData.array.length > 0 ? tableData.array : [] } : {}),
          ...(q.metadata.caption !== undefined ? { caption: firstTable?.caption || caption || '' } : {}),
          ...(q.metadata.alignments !== undefined ? { alignments: firstTable?.alignments?.length > 0 ? firstTable.alignments : [] } : {}),
          ...(q.metadata.mergedCells !== undefined ? { mergedCells: firstTable?.mergedCells?.length > 0 ? firstTable.mergedCells : [] } : {}),
          
          // EditableFormulaComponent format - preserve exact original order based on key existence in original metadata
          ...(q.metadata.formulas !== undefined ? { formulas: formulaData.array.length > 0 ? formulaData.array : [] } : {}),
          ...(q.metadata.equations !== undefined ? { equations: formulaData.equationsArray.length > 0 ? formulaData.equationsArray : [] } : {}),
          
          // EditableImageComponent format - preserve exact original order based on key existence in original metadata
          ...(q.metadata.mediaUrl !== undefined ? { mediaUrl: imageData.url || mediaUrl || '' } : {}),
          ...(q.metadata.imageWidth !== undefined ? { imageWidth: imageData.width || 100 } : {}),
          ...(q.metadata.altText !== undefined ? { altText: imageData.altText || 'Question Image' } : {}),
          ...(q.metadata.media !== undefined ? { media: imageData.media || media || null } : {}),
          ...(q.metadata.images !== undefined ? { images: imageData.array.length > 0 ? imageData.array : [] } : {}),
          ...(q.metadata.diagram !== undefined ? { diagram: qAttr.diagram || qMeta.diagram || (q as any).diagram || null } : {}),
          
          // Code component format - preserve exact original order based on key existence in original metadata
          ...(q.metadata.code !== undefined ? { code: codeData.single || null } : {}),
          ...(q.metadata.codeBlocks !== undefined ? { codeBlocks: codeData.array.length > 0 ? codeData.array : [] } : {}),
          ...(q.metadata.starterCode !== undefined ? { starterCode: codeData.starter || '' } : {}),
          ...(q.metadata.language !== undefined ? { language: language || '' } : {}),
          ...(q.metadata.expectedOutput !== undefined ? { expectedOutput: expectedOutput || '' } : {}),
          ...(q.metadata.solutionCode !== undefined ? { solutionCode: expectedOutput || '' } : {}),
          
          // List component format - preserve exact original order based on key existence in original metadata
          ...(q.metadata.lists !== undefined ? { lists: (q as any).lists || qMeta.lists || qAttr.lists || [] } : {}),
          ...(q.metadata.list !== undefined ? { list: (q as any).list || qMeta.list || qAttr.list || null } : {}),
          
          // Link component format - preserve exact original order based on key existence in original metadata
          ...(q.metadata.hyperlinks !== undefined ? { hyperlinks: (q as any).hyperlinks || qMeta.hyperlinks || qAttr.hyperlinks || [] } : {}),
          ...(q.metadata.hyperlink !== undefined ? { hyperlink: (q as any).hyperlink || qMeta.hyperlink || qAttr.hyperlink || null } : {}),
          
          // Passage/context - preserve exact original order based on key existence in original metadata
          ...(q.metadata.passage !== undefined ? { passage: (q as any).passage || qMeta.passage || qAttr.passage || '' } : {}),
          
          // Additional metadata - preserve exact original order based on key existence in original metadata
          ...(q.metadata.solution !== undefined ? { solution: (q as any).solution || null } : {}),
          ...(q.metadata.rubric !== undefined ? { rubric: (q as any).rubric || null } : {}),
          ...(q.metadata.correctAnswers !== undefined ? { correctAnswers: (q as any).correctAnswers || null } : {}),
          ...(q.metadata.answerPattern !== undefined ? { answerPattern: (q as any).answerPattern || '' } : {}),
        },
      };
    });
  }
  
  /**
   * Extract table data in exact format for EditableTableComponent
   */
  private static extractTableData(q: any, qMeta: any, qAttr: any) {
    const rawTable = (q as any).table || qMeta.table || qAttr.table;
    const rawTables = (q as any).tables || qMeta.tables || qAttr.tables;
    
    let single: any = null;
    let array: any[] = [];
    
    if (rawTable && typeof rawTable === 'object') {
      single = {
        headers: Array.isArray(rawTable.headers) ? rawTable.headers : [],
        rows: Array.isArray(rawTable.rows) ? rawTable.rows : Array.isArray(rawTable.cells) ? rawTable.cells : [],
        alignments: Array.isArray(rawTable.alignments) ? rawTable.alignments : [],
        caption: rawTable.caption || '',
      };
      array = [single];
    } else if (Array.isArray(rawTables) && rawTables.length > 0) {
      array = rawTables.map((t: any) => ({
        headers: Array.isArray(t.headers) ? t.headers : [],
        rows: Array.isArray(t.rows) ? t.rows : Array.isArray(t.cells) ? t.cells : [],
        alignments: Array.isArray(t.alignments) ? t.alignments : [],
        caption: t.caption || '',
      }));
      single = array[0];
    }
    
    return { single, array };
  }
  
  /**
   * Extract formula data in exact format for EditableFormulaComponent
   */
  private static extractFormulaData(q: any, qMeta: any, qAttr: any) {
    const rawFormulas = (q as any).formulas || qMeta.formulas || qAttr.formulas;
    const rawEquations = (q as any).equations || qMeta.equations || qAttr.equations;
    
    let array: string[] = [];
    let equationsArray: any[] = [];
    
    if (Array.isArray(rawFormulas) && rawFormulas.length > 0) {
      array = rawFormulas.map((f: any) => typeof f === 'string' ? f : f.latex || f.content || String(f));
    } else if (typeof rawFormulas === 'string' && rawFormulas.trim()) {
      array = [rawFormulas.trim()];
    }
    
    if (Array.isArray(rawEquations) && rawEquations.length > 0) {
      equationsArray = rawEquations.map((e: any) => ({
        id: e.id || `eq-${Date.now()}`,
        latex: e.latex || e.content || e.formula || String(e),
        format: e.format || 'latex',
      }));
    } else if (array.length > 0) {
      equationsArray = array.map((latex, idx) => ({
        id: `eq-${Date.now()}-${idx}`,
        latex,
        format: 'latex',
      }));
    }
    
    return { array, equationsArray };
  }
  
  /**
   * Extract image data in exact format for EditableImageComponent
   */
  private static extractImageData(q: any, qMeta: any, qAttr: any, mediaUrl: string) {
    const rawImages = (q as any).images || qMeta.images || qAttr.images;
    const rawDiagram = (q as any).diagram || qMeta.diagram || qAttr.diagram;
    
    let url = mediaUrl;
    let caption = qMeta.caption || (rawDiagram as any)?.caption || '';
    let width = qMeta.imageWidth || 100;
    let altText = qMeta.altText || 'Question Image';
    let array: any[] = [];
    let media: any = null;
    
    if (Array.isArray(rawImages) && rawImages.length > 0) {
      array = rawImages.map((img: any) => ({
        id: img.id || `img-${Date.now()}`,
        dataUrl: img.dataUrl || img.url,
        url: img.url || img.dataUrl,
        caption: img.caption || '',
        width: img.width || 100,
      }));
      url = url || array[0].dataUrl || array[0].url;
      caption = caption || array[0].caption;
    }
    
    if (url) {
      media = { url, kind: 'image', caption, width };
      if (array.length === 0) {
        array = [{ id: `img-${Date.now()}`, dataUrl: url, url, caption, width }];
      }
    }
    
    return { url, caption, width, altText, array, media };
  }
  
  /**
   * Extract code data for code component
   */
  private static extractCodeData(q: any, qMeta: any, qAttr: any) {
    const rawCode = (q as any).code || qMeta.code || qAttr.code;
    const rawCodeBlocks = (q as any).codeBlocks || qMeta.codeBlocks || qAttr.codeBlocks;
    
    let single: any = null;
    let array: any[] = [];
    let starter: string = '';
    
    if (rawCode && typeof rawCode === 'object') {
      single = {
        code: rawCode.code || rawCode.content,
        language: rawCode.language || 'python',
        indentation: rawCode.indentation || 0,
      };
      array = [single];
      starter = rawCode.starterCode || rawCode.solution || '';
    } else if (typeof rawCode === 'string') {
      single = {
        code: rawCode,
        language: 'python',
        indentation: 0,
      };
      array = [single];
    }
    
    if (Array.isArray(rawCodeBlocks) && rawCodeBlocks.length > 0) {
      array = rawCodeBlocks.map((c: any) => ({
        id: c.id,
        content: c.content || c.code,
        code: c.code || c.content,
        language: c.language || 'python',
        indentation: c.indentation || 0,
        confidence: c.confidence || 1,
      }));
      single = array[0];
      starter = rawCodeBlocks[0]?.starterCode || rawCodeBlocks[0]?.solution || starter;
    }
    
    return { single, array, starter };
  }

  /**
   * Normalize question type to ExtractedQuestionDraft format
   */
  private static normalizeQuestionType(type: string): ExtractedQuestionDraft['type'] {
    const lower = (type || '').toLowerCase();
    if (lower.includes('select') || lower === 'multiple_select') return 'multiple_select';
    if (lower.includes('true') || lower === 'true_false') return 'true_false';
    if (lower.includes('blank') || lower === 'fill_blank') return 'fill_blank' as any;
    if (lower.includes('long') || lower.includes('essay')) return 'long_answer' as any;
    if (lower.includes('table')) return 'table_question' as any;
    if (lower.includes('math') || lower.includes('equation')) return 'equation_question' as any;
    if (lower.includes('image')) return 'image_question' as any;
    if (lower.includes('code') || lower.includes('coding') || lower.includes('programming')) return 'coding' as any;
    if (lower.includes('match')) return 'match_following' as any;
    if (lower.includes('choice') || lower === 'multiple_choice') return 'multiple_choice';
    if (lower.includes('short')) return 'short_answer';
    return (type as any) || 'multiple_choice';
  }

  /**
   * Convert options to ExtractedQuestionDraft format
   */
  private static convertOptions(options?: Array<{ marker: string; text: string; isCorrect?: boolean }>, statementText?: string): ExtractedQuestionDraft['options'] {
    if (options && options.length >= 2) {
      return options.map((opt: { marker: string; text: string; isCorrect?: boolean }, index: number) => ({
        id: randomUUID(),
        text: opt.text,
        isCorrect: Boolean(opt.isCorrect),
        order: index,
      }));
    }

    // Try parsing options from statement text if options array is empty
    if (statementText) {
      const lines = statementText.split('\n').map(l => l.trim()).filter(Boolean);
      const parsedOptions: ExtractedQuestionDraft['options'] = [];
      const optionPattern = /^[a-eA-E][\.\)]\s*/;
      lines.forEach((line) => {
        if (optionPattern.test(line)) {
          parsedOptions.push({
            id: randomUUID(),
            text: line.replace(optionPattern, '').trim(),
            isCorrect: false,
            order: parsedOptions.length,
          });
        }
      });
      if (parsedOptions.length >= 2) {
        return parsedOptions;
      }
    }

    // Return empty array for non-option question types (fill in blank, short answer, essay, etc.)
    return [];
  }

  /**
   * Extract correct answer from QuestionObject
   */
  private static extractCorrectAnswer(q: QuestionObject): string {
    // If options are marked with isCorrect, find the correct one
    if (q.options && q.options.some(opt => opt.isCorrect)) {
      const correctOption = q.options.find(opt => opt.isCorrect);
      return correctOption?.text || '';
    }

    // Otherwise use correctAnswer field
    if (q.correctAnswer) {
      if (Array.isArray(q.correctAnswer)) {
        return q.correctAnswer.join(', ');
      }
      return String(q.correctAnswer);
    }

    return '';
  }

  /**
   * Normalize difficulty to ExtractedQuestionDraft format.
   * Schema default is medium only when source omitted difficulty —
   * metadata.difficulty is set only for explicit source values.
   */
  private static normalizeDifficulty(difficulty?: string): ExtractedQuestionDraft['difficulty'] {
    if (!difficulty) return 'medium';

    const diffMap: Record<string, ExtractedQuestionDraft['difficulty']> = {
      'easy': 'easy',
      'medium': 'medium',
      'hard': 'hard',
      'beginner': 'easy',
      'intermediate': 'medium',
      'advanced': 'hard',
      'difficult': 'hard',
    };

    return diffMap[difficulty.toLowerCase()] || 'medium';
  }

  /**
   * Normalize Bloom's level to ExtractedQuestionDraft format
   */
  private static normalizeBloomLevel(bloomLevel?: string): ExtractedQuestionDraft['bloomLevel'] {
    if (!bloomLevel) return 'L2';
    
    const bloomMap: Record<string, ExtractedQuestionDraft['bloomLevel']> = {
      'l1': 'L1',
      'l2': 'L2',
      'l3': 'L3',
      'l4': 'L4',
      'l5': 'L5',
      'l6': 'L6',
      'remember': 'L1',
      'understand': 'L2',
      'apply': 'L3',
      'analyze': 'L4',
      'evaluate': 'L5',
      'create': 'L6',
    };

    return bloomMap[bloomLevel.toLowerCase()] || 'L2';
  }

  /**
   * Generate warnings based on question quality
   */
  private static generateWarnings(q: QuestionObject): string[] {
    const warnings: string[] = [];

    if (!q.statement || q.statement.trim().length < 5) {
      warnings.push('Question text is very short or missing');
    }

    if (!q.options || q.options.length === 0) {
      warnings.push('No options extracted');
    }

    if (q.options && q.options.length < 2 && ['multiple_choice', 'multiple_select'].includes(q.type)) {
      warnings.push('Fewer than 2 options for multiple choice/select question');
    }

    if (!q.correctAnswer) {
      warnings.push('No correct answer identified');
    }

    if (q.confidence.overall < 0.7) {
      warnings.push('Low extraction confidence');
    }

    if (q.validation && !q.validation.isValid) {
      warnings.push('Validation failed');
      if (q.validation.issues.length > 0) {
        warnings.push(...q.validation.issues);
      }
    }

    return warnings;
  }

  /**
   * Check if DocumentIntelligenceEngine should be used instead of AI extraction
   */
  static shouldUseDocumentIntelligence(): boolean {
    // Check environment variable - default to true unless explicitly disabled
    const useNewEngine = process.env.USE_DOCUMENT_INTELLIGENCE_ENGINE;
    const result = useNewEngine !== 'false';
    console.log('[DocumentIntelligenceAdapter.shouldUseDocumentIntelligence] USE_DOCUMENT_INTELLIGENCE_ENGINE:', useNewEngine, '-> using Document Intelligence:', result);
    return result;
  }
}
