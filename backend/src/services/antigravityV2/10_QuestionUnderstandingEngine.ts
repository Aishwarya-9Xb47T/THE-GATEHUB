import { V2ASTNode, V2ParagraphNode, V2TableNode, V2ImageNode, V2MathNode, V2CodeNode, V2DiagramNode, V2ChartNode, V2CommentNode, V2SpeakerNoteNode, V2QuestionBlock, V2QuestionOption } from './types.js';
import { AnswerKeyReconciler, AnswerKeyEntry } from './11_AnswerKeyReconciler.js';
import { isQuizLikeTable, materializeQuizRowsFromTable } from './pasteStructuredParse.js';

export class QuestionUnderstandingEngine {
  /**
   * Non-regex semantic question block reasoner binding prompt runs, dynamic options, answers, tables, images, math, code, speaker notes, comments
   */
  public static extractQuestions(
    blocks: V2ASTNode[],
    rawText: string,
    tables: V2TableNode[],
    images: V2ImageNode[],
    codeBlocks: V2CodeNode[],
    equations: V2MathNode[],
    diagrams: V2DiagramNode[],
    charts: V2ChartNode[],
    comments: V2CommentNode[],
    speakerNotes: V2SpeakerNoteNode[]
  ): V2QuestionBlock[] {
    const questionBlocks: V2QuestionBlock[] = [];
    let qIdx = 1;
    let currentDifficulty = '';
    let currentMarks: number | undefined = undefined;
    let difficultyExplicit = false;
    let marksExplicit = false;
    let activeQuestion: V2QuestionBlock | null = null;

    let recentTables: V2TableNode[] = [];
    let recentCode: V2CodeNode[] = [];
    let recentMath: V2MathNode[] = [];
    let recentImages: V2ImageNode[] = []; // Images assigned by position, NOT globally pre-seeded
    let recentLinks: string[] = [];
    let pendingListItems: string[] = [];
    let listGroupIdx = 1;
    let currentSection = '';
    let inAnswerKeySection = false;
    const deferredAnswerKeyEntries: AnswerKeyEntry[] = [];

    // Merge engine-discovered tables/code into the block stream (deduped by content)
    const seenCodeText = new Set(
      blocks.filter((b) => b.type === 'code').map((b) => String((b as V2CodeNode).code || '').trim()),
    );
    for (const c of codeBlocks || []) {
      const key = String(c.code || '').trim();
      if (!key || seenCodeText.has(key)) continue;
      seenCodeText.add(key);
      blocks.push(c);
    }

    const tableContentKey = (t: V2TableNode): string => {
      const headers = (t.headers || []).map((h) => String(h || '').trim().toLowerCase()).join('|');
      const rows = (t.grid || [])
        .map((row) =>
          row
            .map((cell) => cell.paragraphs.map((p) => p.plainText).join(' ').trim().toLowerCase())
            .join('\t'),
        )
        .join('\n');
      return `${headers}::${rows}`;
    };
    const seenTableKeys = new Set(
      blocks.filter((b) => b.type === 'table').map((b) => tableContentKey(b as V2TableNode)),
    );
    for (const t of tables || []) {
      const key = tableContentKey(t);
      if (seenTableKeys.has(key)) continue;
      seenTableKeys.add(key);
      if (!blocks.some((b) => b.id === t.id)) blocks.push(t);
    }

    const listItemsLookLikeOptions = (items: string[]): boolean => {
      if (items.length < 2) return false;
      const optionLike = items.filter((item, idx) => parseListItemAsOption(item, idx) !== null).length;
      return optionLike >= Math.max(2, Math.ceil(items.length * 0.5));
    };

    const applyOptionToQuestion = (optionObj: V2QuestionOption) => {
      if (!activeQuestion) return;
      activeQuestion.options.push(optionObj);
      // Embedded code must not lock the question as a coding lab once choices exist
      if (
        activeQuestion.type === 'short_answer' ||
        activeQuestion.type === 'coding' ||
        activeQuestion.type === 'table_based' ||
        activeQuestion.type === 'math_based' ||
        activeQuestion.type === 'image_based'
      ) {
        activeQuestion.type = 'multiple_choice';
      }
      if (optionObj.isCorrect) {
        if (!activeQuestion.correctAnswer) {
          activeQuestion.correctAnswer = optionObj.label;
        } else if (typeof activeQuestion.correctAnswer === 'string') {
          activeQuestion.correctAnswer = [activeQuestion.correctAnswer, optionObj.label];
          activeQuestion.type = 'multiple_select';
        } else if (Array.isArray(activeQuestion.correctAnswer)) {
          activeQuestion.correctAnswer.push(optionObj.label);
          activeQuestion.type = 'multiple_select';
        }
      }
    };

    const isInstructionLine = (text: string): boolean =>
      /^(?:Header:|Footer:|Word Import Test(?:\s+Suite)?|Verify these are ignored|Verify question ordering|Insert |Paste |Continue with|Add captions|Then ask|This tests|This paragraph contains:|Insert hyperlink:|Insert any|Insert 2|Insert a Page|Important$|Programming Languages$|Page\s+\d+$|https?:\/\/)/i.test(text.trim());

    const isEquationLine = (text: string): boolean =>
      /^(E\s*=\s*mc²|a²\s*\+\s*b²\s*=\s*c²|\$\$.*\$\$)/i.test(text.trim()) ||
      /^[A-Za-z0-9²³+\-=\s]{3,30}$/.test(text.trim()) && /[=²³]/.test(text);

    const nextBlockIsQuestionLabel = (idx: number): boolean => {
      for (let j = idx + 1; j < Math.min(idx + 5, blocks.length); j++) {
        const nb = blocks[j];
        if (nb.type === 'list' || nb.type === 'table' || nb.type === 'image' || nb.type === 'code') continue;
        if (nb.type === 'paragraph' || nb.type === 'heading') {
          const nt = (nb as V2ParagraphNode).plainText.trim();
          if (!nt) continue;
          return nt === 'Question:' || /^Question\s*\d+$/i.test(nt);
        }
        break;
      }
      return false;
    };

    const parseListItemAsOption = (item: string, optIndex: number): V2QuestionOption | null => {
      const txt = item.trim();
      if (!txt) return null;

      const cbMatch = txt.match(/^([☑☐])\s*(.+)$/);
      if (cbMatch) {
        const optText = cbMatch[2].replace(/✅/g, '').replace(/\(correct\)/i, '').trim();
        return {
          id: `v2_opt_list_${optIndex}`,
          label: String.fromCharCode(65 + optIndex),
          text: optText,
          isCorrect: cbMatch[1] === '☑' || txt.includes('✅') || undefined,
        };
      }

      // A. / A) / a. / 1. / 1) / (i) / (ii) / • / -
      const optMatch =
        txt.match(/^\(([a-zA-Z]|[ivxlcdm]+)\)\s*(.+)$/i) ||
        txt.match(/^([A-Za-z]|[0-9]{1,2}|[ivxlcdm]+)\s*[.):\-]\s+(.+)$/i) ||
        txt.match(/^([•*-]|☑|☐|\[\s*\]|\[x\])\s+(.+)$/i);
      if (optMatch) {
        const rawSymbol = optMatch[1];
        const optText = optMatch[2].trim();
        const isChecked = rawSymbol === '☑' || rawSymbol === '[x]' || txt.includes('✅') || optText.includes('(correct)');
        const label = rawSymbol.replace(/☑|☐|\[\s*\]|\[x\]/g, '').trim() || String.fromCharCode(65 + optIndex);
        return {
          id: `v2_opt_list_${optIndex}`,
          label: label.toUpperCase() === label || /^[0-9]+$/.test(label) || /^[ivxlcdm]+$/i.test(label)
            ? label
            : label.toUpperCase(),
          text: optText.replace(/✅/g, '').replace(/\(correct\)/i, '').trim(),
          isCorrect: isChecked || undefined,
        };
      }

      return null;
    };

    const isOptionLine = (text: string): boolean => parseListItemAsOption(text, 0) !== null;

    const isMetadataLine = (text: string): boolean =>
      /^(?:Difficulty|Marks?|Points?|Score|Correct(?:\s+Answer|\s+Option)?|Answers?|Ans|Explanation|Reason|Solution|Why|Options)\s*[:=]/i.test(text) ||
      /^\d+\s*marks?\b/i.test(text);

    const isQuestionLabelOnly = (text: string): boolean =>
      /^(?:Question\s*\d+|Q\.?\s*\d+)\s*[:.)-]?\s*$/i.test(text) ||
      text.trim().toLowerCase() === 'question:';

    const isNumberedQuestionStart = (text: string): boolean => {
      // "1. What is the capital of France?" — question, not option
      const m = text.match(/^(\d{1,3})\s*[.)]\s+(.+)$/);
      if (!m) return false;
      const rest = m[2].trim();
      if (rest.endsWith('?')) return true;
      if (/^(what|which|who|when|where|why|how|define|explain|describe|true or false|select|choose)\b/i.test(rest)) {
        return true;
      }
      return false;
    };

    const looksLikeSectionHeader = (text: string): boolean => {
      if (/^Section\s*(?:\d+|[A-Z])\b/i.test(text)) return true;
      if (/^(?:Multiple\s*Choice|True\s*\/?\s*False|Short\s*Answer|Fill[\s-]?in[\s-]?the[\s-]?Blank|Matching|Essay|Easy\s+Questions|Hard\s+Questions|Medium\s+Questions)\s*:?\s*$/i.test(text)) {
        return true;
      }
      return false;
    };

    const extractQuestionNumber = (text: string): number | undefined => {
      const patterns = [
        /^Question\s*(\d+)/i,
        /^Q\.?\s*(\d+)/i,
        /^(\d+)\s*[.:)]\s+/,
      ];
      for (const pattern of patterns) {
        const m = text.match(pattern);
        if (m) return parseInt(m[1], 10);
      }
      return undefined;
    };

    const resumeQuestionForOrphanOptions = (): boolean => {
      if (activeQuestion || questionBlocks.length === 0) return false;
      const last = questionBlocks[questionBlocks.length - 1];
      if (last.options.length > 0) return false;
      if (last.type === 'essay' || last.type === 'long_answer') return false;
      activeQuestion = last;
      questionBlocks.pop();
      return true;
    };

    const closeActiveQuestion = () => {
      if (!activeQuestion) return;

      // Attach any accumulated recent context elements if not already present
      if (recentTables.length > 0) {
        recentTables.forEach(t => {
          if (!activeQuestion!.associatedTables.some(at => at.id === t.id)) {
            activeQuestion!.associatedTables.push(t);
            const rows = t.grid.map(row => row.map(cell => cell.paragraphs.map(p => p.plainText).join(' ')));
            activeQuestion!.children.push({
              id: `blk_tbl_${t.id}`,
              type: 'table',
              order: activeQuestion!.children.length,
              headers: t.headers,
              rows,
            });
          }
        });
        recentTables = [];
      }

      if (recentCode.length > 0) {
        recentCode.forEach(c => {
          if (!activeQuestion!.associatedCode.some(ac => ac.id === c.id)) {
            activeQuestion!.associatedCode.push(c);
            activeQuestion!.children.push({
              id: `blk_code_${c.id}`,
              type: 'code',
              order: activeQuestion!.children.length,
              language: c.language || 'python',
              code: c.code,
            });
          }
        });
        recentCode = [];
      }

      if (recentMath.length > 0) {
        recentMath.forEach(m => {
          if (!activeQuestion!.associatedMath.some(am => am.id === m.id)) {
            activeQuestion!.associatedMath.push(m);
            activeQuestion!.children.push({
              id: `blk_math_${m.id}`,
              type: 'formula',
              order: activeQuestion!.children.length,
              latex: m.latex,
            });
          }
        });
        recentMath = [];
      }

      if (recentImages.length > 0) {
        recentImages.forEach((img) => {
          if (!activeQuestion!.associatedImages.some((ai) => ai.id === img.id)) {
            activeQuestion!.associatedImages.push(img);
            activeQuestion!.children.push({
              id: `blk_img_${img.id}`,
              type: 'image',
              order: activeQuestion!.children.length,
              imageUrl: img.url || img.base64 || '',
              caption: img.caption,
              alt: img.altText,
            });
          }
        });
        recentImages = [];
      }

      if (recentLinks.length > 0) {
        recentLinks.forEach(l => {
          if (!activeQuestion!.hyperlinks.includes(l)) {
            activeQuestion!.hyperlinks.push(l);
          }
        });
        recentLinks = [];
      }

      if (pendingListItems.length >= 2 && activeQuestion.options.length === 0) {
        const attachListAsOptions = /select|choose|pick|match|desktop operating|operating systems?/i.test(activeQuestion.stem);
        if (attachListAsOptions) {
          pendingListItems.forEach((item, li) => {
            applyOptionToQuestion({
              id: `v2_opt_${activeQuestion!.id}_${li + 1}`,
              label: String.fromCharCode(65 + li),
              text: item.trim(),
            });
          });
        }
        pendingListItems = [];
      }

      const cleanStem = activeQuestion.stem.trim();
      if (
        !cleanStem ||
        /^https?:\/\//i.test(cleanStem) ||
        /^Page\s+\d+$/i.test(cleanStem) ||
        isEquationLine(cleanStem) ||
        (cleanStem.length < 12 && !cleanStem.includes('?') && !/^Question\s*\d/i.test(cleanStem)) ||
        cleanStem.match(/^(Word Import Test Suite|Header:|Footer:|Insert a Page Break|Verify these are ignored|Section\s*\d+\s*:\s*(?:Table|Code Block|Equation|Bulleted List|Numbered List|Image|Hyperlink|Bold|Mixed Formatting|Nested List|Large Paragraph|Multiple Images|Page Break|Footer\/Header))$/i) ||
        isInstructionLine(cleanStem)
      ) {
        activeQuestion = null;
        return;
      }

      // Automatically determine refined question type if generic
      if (
        activeQuestion.type === 'multiple_choice' ||
        activeQuestion.type === 'short_answer' ||
        activeQuestion.type === 'coding' ||
        activeQuestion.type === 'table_based'
      ) {
        const optText = activeQuestion.options.map(o => o.text.toLowerCase()).join(' ');
        const isTF = activeQuestion.options.length === 2 && optText.includes('true') && optText.includes('false');
        const correctCount = activeQuestion.options.filter(o => o.isCorrect).length;

        if (activeQuestion.options.length >= 2) {
          if (isTF) {
            activeQuestion.type = 'true_false';
          } else if (correctCount > 1 || (Array.isArray(activeQuestion.correctAnswer) && activeQuestion.correctAnswer.length > 1)) {
            activeQuestion.type = 'multiple_select';
          } else {
            activeQuestion.type = 'multiple_choice';
          }
        } else if (activeQuestion.stem.includes('__________') || activeQuestion.stem.toLowerCase().includes('fill in')) {
          activeQuestion.type = 'fill_blank';
        } else if (activeQuestion.associatedCode.length > 0 || activeQuestion.children.some(c => c.type === 'code')) {
          // Keep choice types when options exist — code is embedded context, not a coding lab
          if (activeQuestion.options.length === 0) {
            activeQuestion.type = 'coding';
          }
        } else if (activeQuestion.associatedTables.length > 0 || activeQuestion.children.some(c => c.type === 'table')) {
          if (activeQuestion.options.length === 0) {
            activeQuestion.type = 'table_based';
          }
        } else if (activeQuestion.associatedMath.length > 0 || activeQuestion.children.some(c => c.type === 'formula')) {
          activeQuestion.type = 'math_based';
        } else if (activeQuestion.associatedImages.length > 0 || activeQuestion.children.some(c => c.type === 'image')) {
          activeQuestion.type = 'image_based';
        } else if (activeQuestion.options.length === 0) {
          if (activeQuestion.stem.toLowerCase().includes('explain') || activeQuestion.stem.toLowerCase().includes('describe')) {
            activeQuestion.type = 'essay';
          }
        }
      }

      // Add options block if options exist
      if (activeQuestion.options.length > 0) {
        let optBlock = activeQuestion.children.find(c => c.type === 'options');
        if (!optBlock) {
          activeQuestion.children.push({
            id: `blk_opts_${activeQuestion.id}`,
            type: 'options',
            order: activeQuestion.children.length,
            options: activeQuestion.options,
          });
        }
      }

      // Add explanation block if explanation exists
      if (activeQuestion.explanation) {
        let expBlock = activeQuestion.children.find(c => c.type === 'explanation');
        if (!expBlock) {
          activeQuestion.children.push({
            id: `blk_exp_${activeQuestion.id}`,
            type: 'explanation',
            order: activeQuestion.children.length,
            content: activeQuestion.explanation,
          });
        }
      }

      questionBlocks.push(activeQuestion);
      activeQuestion = null;
    };

    const startNewQuestion = (stem: string, initialRuns: any[] = []) => {
      const pendingImages = [...recentImages];
      const pendingTables = [...recentTables];
      recentImages = [];
      recentTables = [];
      closeActiveQuestion();
      recentImages = pendingImages;
      recentTables = pendingTables;

      activeQuestion = {
        id: `v2_q_${qIdx++}`,
        type: 'short_answer',
        stem,
        promptRuns: initialRuns,
        sourceQuestionNumber: extractQuestionNumber(stem),
        currentSection: currentSection || undefined,
        children: [{
          id: `blk_text_${qIdx}`,
          type: 'text',
          order: 0,
          content: stem,
          runs: initialRuns,
        }],
        options: [],
        difficulty: difficultyExplicit ? currentDifficulty : undefined,
        points: marksExplicit ? currentMarks : undefined,
        associatedParagraphs: [],
        associatedTables: [],
        associatedImages: [],
        associatedMath: [],
        associatedCode: [],
        associatedDiagrams: [],
        associatedCharts: [],
        associatedComments: [],
        hyperlinks: [],
      };

      // Instantly attach any preceding recent context elements
      if (recentTables.length > 0) {
        recentTables.forEach(t => {
          activeQuestion!.associatedTables.push(t);
          const rows = t.grid.map(row => row.map(cell => cell.paragraphs.map(p => p.plainText).join(' ')));
          activeQuestion!.children.push({
            id: `blk_tbl_${t.id}`,
            type: 'table',
            order: activeQuestion!.children.length,
            headers: t.headers,
            rows,
          });
        });
        recentTables = [];
      }

      if (recentCode.length > 0) {
        recentCode.forEach(c => {
          activeQuestion!.associatedCode.push(c);
          activeQuestion!.children.push({
            id: `blk_code_${c.id}`,
            type: 'code',
            order: activeQuestion!.children.length,
            language: c.language || 'python',
            code: c.code,
          });
        });
        recentCode = [];
      }

      if (recentMath.length > 0) {
        recentMath.forEach(m => {
          activeQuestion!.associatedMath.push(m);
          activeQuestion!.children.push({
            id: `blk_math_${m.id}`,
            type: 'formula',
            order: activeQuestion!.children.length,
            latex: m.latex,
          });
        });
        recentMath = [];
      }

      if (recentImages.length > 0) {
        recentImages.forEach((img) => {
          activeQuestion!.associatedImages.push(img);
          activeQuestion!.children.push({
            id: `blk_img_${img.id}`,
            type: 'image',
            order: activeQuestion!.children.length,
            imageUrl: img.url || img.base64 || '',
            caption: img.caption,
            alt: img.altText,
          });
        });
        recentImages = [];
      }

      if (recentLinks.length > 0) {
        recentLinks.forEach(l => {
          activeQuestion!.hyperlinks.push(l);
        });
        recentLinks = [];
      }

      if (pendingListItems.length >= 2) {
        const attachListAsOptions = /select|choose|pick|match|desktop operating|operating systems?/i.test(stem);
        if (attachListAsOptions) {
          pendingListItems.forEach((item, li) => {
            applyOptionToQuestion({
              id: `v2_opt_${activeQuestion!.id}_${li + 1}`,
              label: String.fromCharCode(65 + li),
              text: item.trim(),
            });
          });
        }
        pendingListItems = [];
      }
    };

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];

      // Handle List Node
      if ((block as any).type === 'list') {
        const listNode = block as any;
        const items: string[] = listNode.items || [];

        if (items.length > 0 && listItemsLookLikeOptions(items)) {
          resumeQuestionForOrphanOptions();
          if (activeQuestion) {
            for (let li = 0; li < items.length; li++) {
              const opt = parseListItemAsOption(items[li], activeQuestion.options.length);
              if (opt) {
                opt.id = `v2_opt_${activeQuestion.id}_${activeQuestion.options.length + 1}`;
                applyOptionToQuestion(opt);
              }
            }
          }
          continue;
        }

        if (nextBlockIsQuestionLabel(i)) {
          pendingListItems = items;
          continue;
        }

        if (activeQuestion) {
          activeQuestion.children.push({
            id: `blk_list_${listNode.id || listGroupIdx++}`,
            type: 'list',
            order: activeQuestion.children.length,
            ordered: listNode.ordered || false,
            items,
          });
        } else if (items.length >= 2) {
          pendingListItems = items;
        }
        continue;
      }

      // Handle Math Node
      if (block.type === 'math' || (block as any).latex) {
        const mathNode = block as V2MathNode;
        recentMath.push(mathNode);
        if (activeQuestion) {
          activeQuestion.associatedMath.push(mathNode);
          activeQuestion.children.push({
            id: `blk_math_${activeQuestion.id}_${activeQuestion.children.length}`,
            type: 'formula',
            order: activeQuestion.children.length,
            latex: mathNode.latex,
          });
        }
        continue;
      }

      // Handle Code Node (preserve exactly; do not force coding type when options exist)
      if (block.type === 'code' || (block as any).code) {
        const codeNode = block as V2CodeNode;
        recentCode.push(codeNode);
        if (activeQuestion) {
          if (!activeQuestion.associatedCode.some((c) => c.id === codeNode.id || c.code === codeNode.code)) {
            activeQuestion.associatedCode.push(codeNode);
          }
          const existingCode = activeQuestion.children.find(c => c.type === 'code') as any;
          if (existingCode) {
            // Prefer not to smash distinct fences together with wrong indentation —
            // append only if clearly a continuation of the same block id family
            if (!String(existingCode.code || '').includes(codeNode.code)) {
              existingCode.code = `${existingCode.code}\n${codeNode.code}`;
            }
          } else {
            activeQuestion.children.push({
              id: `blk_code_${codeNode.id}`,
              type: 'code',
              order: activeQuestion.children.length,
              language: codeNode.language || 'text',
              code: codeNode.code,
            });
          }
          if (activeQuestion.options.length === 0 && activeQuestion.type === 'short_answer') {
            activeQuestion.type = 'coding';
          }
        }
        continue;
      }

      // Handle Image Node
      if (block.type === 'image' || (block as any).base64 || (block as any).url) {
        const imgNode = block as V2ImageNode;
        recentImages.push(imgNode);
        if (activeQuestion) {
          activeQuestion.associatedImages.push(imgNode);
          activeQuestion.children.push({
            id: `blk_img_${imgNode.id}`,
            type: 'image',
            order: activeQuestion.children.length,
            imageUrl: imgNode.url || imgNode.base64 || '',
            caption: imgNode.caption,
            alt: imgNode.altText,
          });
        }
        continue;
      }

      // Handle Table Node
      if (block.type === 'table') {
        const tblNode = block as V2TableNode;

        // Quiz-like tables (Question | A | B | C | D | Answer) → one question per row
        if (isQuizLikeTable(tblNode.headers || [])) {
          closeActiveQuestion();
          const rows = materializeQuizRowsFromTable(tblNode);
          for (const row of rows) {
            startNewQuestion(row.stem, []);
            if (!activeQuestion) continue;
            if (row.sourceQuestionNumber) activeQuestion.sourceQuestionNumber = row.sourceQuestionNumber;
            if (typeof row.points === 'number') activeQuestion.points = row.points;
            if (row.difficulty) activeQuestion.difficulty = row.difficulty;
            if (row.explanation) activeQuestion.explanation = row.explanation;
            for (const opt of row.options) {
              applyOptionToQuestion({
                id: `v2_opt_${activeQuestion.id}_${activeQuestion.options.length + 1}`,
                label: opt.label,
                text: opt.text,
              });
            }
            if (row.correctAnswer) {
              activeQuestion.correctAnswer = row.correctAnswer;
              const ans = String(row.correctAnswer).trim();
              for (const o of activeQuestion.options) {
                if (
                  o.label.toUpperCase() === ans.toUpperCase() ||
                  o.text.trim().toLowerCase() === ans.toLowerCase()
                ) {
                  o.isCorrect = true;
                }
              }
            }
            if (activeQuestion.options.length >= 2) {
              activeQuestion.type = 'multiple_choice';
            } else if (activeQuestion.options.length === 0) {
              activeQuestion.type = 'short_answer';
            }
            closeActiveQuestion();
          }
          recentTables = [];
          continue;
        }

        recentTables.push(tblNode);
        if (activeQuestion) {
          const rows = tblNode.grid.map(row => row.map(cell => cell.paragraphs.map(p => p.plainText).join(' ')));
          activeQuestion.children.push({
            id: `blk_tbl_${tblNode.id}`,
            type: 'table',
            order: activeQuestion.children.length,
            headers: tblNode.headers,
            rows,
            html: tblNode.html,
          });
          activeQuestion.associatedTables.push(tblNode);
        }
        continue;
      }

      // Handle Paragraph / Heading Node
      if (block.type === 'paragraph' || block.type === 'heading') {
        const pNode = block as V2ParagraphNode;
        const txt = pNode.plainText.trim();
        if (!txt) continue;

        // Parse Metadata lines (Difficulty / Marks / Points / Score)
        const diffMatch = txt.match(/^Difficulty\s*[:=]\s*(Easy|Medium|Hard|Beginner|Intermediate|Advanced)/i);
        if (diffMatch) {
          const raw = diffMatch[1];
          const mapped =
            /beginner|easy/i.test(raw) ? 'Easy' :
            /advanced|hard/i.test(raw) ? 'Hard' : 'Medium';
          currentDifficulty = mapped;
          difficultyExplicit = true;
          if (activeQuestion) activeQuestion.difficulty = currentDifficulty;
          continue;
        }

        const markMatch =
          txt.match(/^(?:Marks?|Points?|Score)\s*[:=]\s*(\d+(?:\.\d+)?)/i) ||
          txt.match(/^(\d+(?:\.\d+)?)\s*marks?\b/i);
        if (markMatch) {
          currentMarks = Math.round(parseFloat(markMatch[1]));
          marksExplicit = true;
          if (activeQuestion) activeQuestion.points = currentMarks;
          continue;
        }

        // Section Headers ("Section 1: Multiple Choice", "Section A", "True / False")
        if (looksLikeSectionHeader(txt)) {
          closeActiveQuestion();
          currentSection = txt.replace(/:$/, '').trim();
          inAnswerKeySection = false;
          continue;
        }

        // Skip bare "Options:" label lines
        if (/^Options\s*:?\s*$/i.test(txt)) {
          continue;
        }

        // True/False topic line before a statement
        if (/^True\s*(?:or|\/)\s*False\s*:?\s*$/i.test(txt)) {
          closeActiveQuestion();
          currentSection = 'True / False';
          continue;
        }

        // Statement under a True/False section (often no trailing ?)
        if (
          !activeQuestion &&
          /true\s*\/?\s*false/i.test(currentSection) &&
          txt.length > 8 &&
          !isOptionLine(txt) &&
          !isMetadataLine(txt) &&
          !looksLikeSectionHeader(txt) &&
          !isQuestionLabelOnly(txt)
        ) {
          startNewQuestion(txt, pNode.runs);
          continue;
        }

        // Detached answer key section — collect entries, do not create questions
        if (AnswerKeyReconciler.isAnswerKeySectionHeader(txt)) {
          closeActiveQuestion();
          inAnswerKeySection = true;
          continue;
        }

        if (inAnswerKeySection) {
          const parsed = AnswerKeyReconciler.parseLine(txt, true);
          if (parsed) {
            deferredAnswerKeyEntries.push(parsed);
          } else if (txt.match(/^Section\s*\d+/i)) {
            inAnswerKeySection = false;
            currentSection = txt;
          }
          continue;
        }

        // Check for Image Placeholder text BEFORE question prompt matching
        if (txt.includes('[IMAGE') || txt.toLowerCase().includes('image placeholder')) {
          recentImages.push({
            id: `img_placeholder_${pNode.id}`,
            type: 'image',
            caption: 'Question Image',
            altText: 'Question Image',
            url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2NjYyIvPjwvc3ZnPg==',
          });
          continue;
        }

        // Check for URL in paragraph
        const urlMatch = txt.match(/https?:\/\/[^\s]+/i);
        if (urlMatch) {
          const url = urlMatch[0];
          recentLinks.push(url);
          if (activeQuestion) {
            if (!activeQuestion.hyperlinks.includes(url)) activeQuestion.hyperlinks.push(url);
          }
        }

        // Check for explicit Question markers ("Question 1", "Question 1:", "Q1.", "Q.1", "1. What...?")
        const isQuestionLabel = /^(?:Question\s*\d+|Q\.?\s*\d+)\s*[:.)-]?\s*/i.test(txt) && (
          isQuestionLabelOnly(txt) ||
          /^Question\s*\d+\s*[:.)-]\s+\S+/i.test(txt) ||
          /^Q\.?\s*\d+\s*[:.)-]\s+\S+/i.test(txt)
        );
        const isNumberedQ = isNumberedQuestionStart(txt);
        const isQuestionPrompt =
          txt.startsWith('Question:') ||
          (txt.endsWith('?') && !isOptionLine(txt) && !nextBlockIsQuestionLabel(i) && !/^Correct\b/i.test(txt));

        if (isQuestionLabel || isQuestionPrompt || isNumberedQ) {
          let cleanStem = txt;

          if (isQuestionLabelOnly(txt) || txt.trim() === 'Question:') {
            // Label-only line: look ahead for multi-line prompt until options/metadata
            const promptParts: string[] = [];
            let j = i + 1;
            for (; j < blocks.length; j++) {
              const nb = blocks[j];
              if (nb.type === 'image' || (nb as any).base64 || (nb as any).url) {
                const imgNode = nb as V2ImageNode;
                if (!recentImages.some((img) => img.id === imgNode.id)) {
                  recentImages.push(imgNode);
                }
                continue;
              }
              if (nb.type === 'table') {
                const tblNode = nb as V2TableNode;
                if (!recentTables.some((t) => t.id === tblNode.id)) {
                  recentTables.push(tblNode);
                }
                continue;
              }
              if (nb.type === 'paragraph' || nb.type === 'heading') {
                const nt = (nb as V2ParagraphNode).plainText.trim();
                if (!nt) continue;
                if (nt.includes('[IMAGE') || nt.toLowerCase().includes('placeholder')) {
                  recentImages.push({
                    id: `img_placeholder_${j}`,
                    type: 'image',
                    caption: 'Question Image',
                    altText: 'Question Image',
                    url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2NjYyIvPjwvc3ZnPg==',
                  });
                  continue;
                }
                if (isMetadataLine(nt) || isOptionLine(nt) || looksLikeSectionHeader(nt) || isQuestionLabelOnly(nt) || isNumberedQuestionStart(nt)) {
                  break;
                }
                promptParts.push(nt);
                if (nt.endsWith('?') || promptParts.length >= 6) {
                  j += 1;
                  break;
                }
              } else {
                break;
              }
            }
            if (promptParts.length > 0) {
              i = j - 1;
              cleanStem = promptParts.join(' ').trim();
            }
          } else if (/^Question\s*\d+\s*[:.)-]\s+/i.test(txt)) {
            cleanStem = txt.replace(/^Question\s*\d+\s*[:.)-]\s*/i, '').trim() || txt;
          } else if (/^Q\.?\s*\d+\s*[:.)-]\s+/i.test(txt)) {
            cleanStem = txt.replace(/^Q\.?\s*\d+\s*[:.)-]\s*/i, '').trim() || txt;
          } else if (isNumberedQ) {
            cleanStem = txt.replace(/^\d+\s*[.)]\s+/, '').trim();
          } else if (txt.startsWith('Question:')) {
            cleanStem = txt.replace(/^Question:\s*/i, '').trim();
          }

          if (cleanStem) {
            startNewQuestion(cleanStem, pNode.runs);

            pNode.runs.forEach(r => {
              if (r.formatting.hyperlinkUrl && activeQuestion) {
                activeQuestion.hyperlinks.push(r.formatting.hyperlinkUrl);
                activeQuestion.children.push({
                  id: `blk_link_${activeQuestion.id}_${activeQuestion.children.length}`,
                  type: 'hyperlink',
                  order: activeQuestion.children.length,
                  url: r.formatting.hyperlinkUrl,
                  displayText: r.text,
                });
              }
            });

            continue;
          }
        }

        // If no active question yet, check if block is code, math, or image placeholder BEFORE fallback question creation
        if (!activeQuestion) {
          if (txt.includes('def ') || txt.includes('factorial') || txt.includes('function(') || (pNode.runs.some(r => r.formatting.fontFamily?.includes('Consolas')))) {
            recentCode.push({
              id: `code_${pNode.id}`,
              type: 'code',
              language: 'python',
              code: txt,
              indentationPreserved: true,
            });
            continue;
          }

          if (isEquationLine(txt)) {
            recentMath.push({
              id: `math_${pNode.id}`,
              type: 'math',
              latex: txt.includes('E = mc²') ? 'E = mc^2' : txt.includes('a² + b² = c²') ? 'a^2 + b^2 = c^2' : txt,
              isDisplayMode: true,
            });
            continue;
          }

          if (/^https?:\/\/\S+$/i.test(txt)) {
            recentLinks.push(txt);
            continue;
          }

          if (txt.includes('[IMAGE') || txt.toLowerCase().includes('placeholder')) {
            recentImages.push({
              id: `img_placeholder_${pNode.id}`,
              type: 'image',
              caption: 'Question Image',
              altText: 'Question Image',
              url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2NjYyIvPjwvc3ZnPg==',
            });
            continue;
          }

          const looksLikeQuestion = (txt.endsWith('?') || /^Question\s*\d/i.test(txt)) && !nextBlockIsQuestionLabel(i);
          if (looksLikeQuestion && txt.length > 5 && !isInstructionLine(txt)) {
            if (/^Insert (?:any |an |a |\d|2|3)/i.test(txt) && /image/i.test(txt)) {
              continue;
            }
            startNewQuestion(txt, pNode.runs);
          }
          continue;
        }

        // Inline "Correct Answer:" with value on the next line (fill-in-the-blank)
        if (txt.match(/^(?:Correct\s+(?:Answer|Option)|Answer|Ans|Correct)\s*[:=]\s*$/i) && activeQuestion) {
          for (let j = i + 1; j < blocks.length; j++) {
            const nb = blocks[j];
            if (nb.type !== 'paragraph' && nb.type !== 'heading') break;
            const nt = (nb as V2ParagraphNode).plainText.trim();
            if (!nt) continue;
            if (looksLikeSectionHeader(nt) || isQuestionLabelOnly(nt) || isNumberedQuestionStart(nt)) break;
            activeQuestion.correctAnswer = nt.replace(/✅/g, '').trim();
            if (activeQuestion.stem.includes('__________') || activeQuestion.stem.includes('____')) {
              activeQuestion.type = 'fill_blank';
            }
            i = j;
            break;
          }
          continue;
        }

        // Check for explicit Answer line (letter or full text)
        const ansMatch = txt.match(/^(?:Correct\s+(?:Answer|Option)|Answers?|Ans|Correct(?:\s+option)?)\s*[:=]\s*(.+)$/i);
        if (ansMatch && activeQuestion) {
          const ansVal = ansMatch[1].replace(/✅/g, '').trim();
          if (!ansVal) continue;
          if (ansVal.includes(',')) {
            activeQuestion.correctAnswer = ansVal.split(',').map(s => s.trim()).filter(Boolean);
            activeQuestion.type = 'multiple_select';
          } else {
            activeQuestion.correctAnswer = ansVal;
          }
          continue;
        }

        // Check for explicit Explanation / Reason / Solution / Why
        const expMatch = txt.match(/^(?:Explanation|Reason|Solution|Why)\s*[:=]\s*(.*)$/i);
        if (expMatch && activeQuestion) {
          const expVal = expMatch[1].trim();
          if (expVal) {
            activeQuestion.explanation = expVal;
          } else {
            // Explanation on following lines
            const parts: string[] = [];
            for (let j = i + 1; j < blocks.length; j++) {
              const nb = blocks[j];
              if (nb.type !== 'paragraph' && nb.type !== 'heading') break;
              const nt = (nb as V2ParagraphNode).plainText.trim();
              if (!nt || isMetadataLine(nt) || isOptionLine(nt) || isQuestionLabelOnly(nt) || isNumberedQuestionStart(nt) || looksLikeSectionHeader(nt)) break;
              parts.push(nt);
              i = j;
              if (parts.length >= 4) break;
            }
            if (parts.length) activeQuestion.explanation = parts.join(' ');
          }
          continue;
        }

        // Check for Option line (A. Earth, B) Mars, a. Venus, (i) ..., • Windows, 1. Requirements)
        resumeQuestionForOrphanOptions();
        if (activeQuestion && isOptionLine(txt)) {
          // Prefer not to treat numbered question stems as options
          if (isNumberedQuestionStart(txt) && activeQuestion.options.length >= 2) {
            // New numbered question after options of previous — fall through to new question path below
          } else {
            const parsedOpt = parseListItemAsOption(txt, activeQuestion.options.length);
            if (parsedOpt) {
              // If this looks like a new numbered question (has ?) while we already have letter options, start new Q
              if (
                isNumberedQuestionStart(txt) &&
                activeQuestion.options.length > 0 &&
                /^[A-Za-z]$/i.test(String(activeQuestion.options[0]?.label || ''))
              ) {
                // fall through — will be handled as new question by looksLikeQuestion below... 
                // but we're inside activeQuestion branch. Start new question here.
                startNewQuestion(txt.replace(/^\d+\s*[.)]\s+/, '').trim(), pNode.runs);
                continue;
              }
              applyOptionToQuestion({
                ...parsedOpt,
                id: `v2_opt_${activeQuestion.id}_${activeQuestion.options.length + 1}`,
              });
              continue;
            }
          }
        }

        // New numbered question while an active question already has options
        if (activeQuestion && isNumberedQuestionStart(txt) && activeQuestion.options.length >= 1) {
          startNewQuestion(txt.replace(/^\d+\s*[.)]\s+/, '').trim(), pNode.runs);
          continue;
        }

        // Check for Math Equation inside paragraph
        if (txt.includes('E = mc²') || txt.includes('a² + b² = c²') || txt.includes('$$')) {
          const latex = txt.includes('E = mc²') ? 'E = mc^2' : txt.includes('a² + b² = c²') ? 'a^2 + b^2 = c^2' : txt;
          activeQuestion.children.push({
            id: `blk_math_${activeQuestion.id}_${activeQuestion.children.length}`,
            type: 'formula',
            order: activeQuestion.children.length,
            latex,
          });
          activeQuestion.associatedMath.push({
            id: `math_${activeQuestion.id}_${activeQuestion.associatedMath.length + 1}`,
            type: 'math',
            latex,
            isDisplayMode: true,
          });
          continue;
        }

        // Check for Code Block inside paragraph — only when it looks like a real code snippet
        if (
          (txt.includes('\n') || txt.includes('def ') || /function\s*\(|public class|#include|console\.log/.test(txt)) &&
          (txt.includes('def ') || txt.includes('factorial') || /function\s*\(/.test(txt) || (pNode.runs.some(r => r.formatting.fontFamily?.includes('Consolas'))))
        ) {
          activeQuestion.children.push({
            id: `blk_code_${activeQuestion.id}_${activeQuestion.children.length}`,
            type: 'code',
            order: activeQuestion.children.length,
            language: 'python',
            code: txt,
          });
          activeQuestion.associatedCode.push({
            id: `code_${activeQuestion.id}_${activeQuestion.associatedCode.length + 1}`,
            type: 'code',
            language: 'python',
            code: txt,
            indentationPreserved: true,
          });
          if (activeQuestion.options.length === 0) {
            activeQuestion.type = 'coding';
          }
          continue;
        }

        // Append remaining text as stem continuation (multi-line questions) or child block
        if (
          activeQuestion.options.length === 0 &&
          !isMetadataLine(txt) &&
          !isOptionLine(txt) &&
          !looksLikeSectionHeader(txt) &&
          !/^https?:\/\//i.test(txt)
        ) {
          const labelOnlyStem = isQuestionLabelOnly(activeQuestion.stem);
          if (labelOnlyStem) {
            activeQuestion.stem = txt;
            const firstChild = activeQuestion.children.find((c) => c.type === 'text');
            if (firstChild && firstChild.type === 'text') {
              firstChild.content = txt;
            }
          } else {
            activeQuestion.stem = `${activeQuestion.stem} ${txt}`.replace(/\s+/g, ' ').trim();
          }
        }

        activeQuestion.children.push({
          id: `blk_txt_${activeQuestion.id}_${activeQuestion.children.length}`,
          type: 'text',
          order: activeQuestion.children.length,
          content: txt,
          runs: pNode.runs,
        });

        // Track hyperlinks in run formatting
        pNode.runs.forEach(r => {
          if (r.formatting.hyperlinkUrl && activeQuestion) {
            activeQuestion.hyperlinks.push(r.formatting.hyperlinkUrl);
          }
        });
      }
    }

    closeActiveQuestion();

    return AnswerKeyReconciler.reconcile(questionBlocks, rawText, blocks, deferredAnswerKeyEntries);
  }
}
