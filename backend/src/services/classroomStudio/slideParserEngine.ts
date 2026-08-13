/**
 * Slide Parser Engine — Educational Slide Question & Interaction Detection
 *
 * Slides are the single source of truth.
 * Automatically parses educational slides (PPTX, PDF, Google Slides, manual)
 * to determine:
 *  - isQuestion
 *  - question text
 *  - options array
 *  - optionCount (2, 3, 4, 5, etc. — never hardcoded)
 *  - correctAnswer (if detectable via styling, tags, or slide notes)
 *  - interactionRecommendation ('mcq' | 'true_false' | 'rating' | 'word_cloud' | 'discussion' | 'drawing' | 'reflection' | 'attendance' | 'exit_ticket' | 'poll')
 *  - confidence score (0.0 to 1.0)
 */

export interface DetectedOption {
  text: string;
  label?: string; // "A", "B", "1", "2", "I", "II", etc.
  isCorrect?: boolean;
}

export interface SlideInteractionAnalysis {
  isQuestion: boolean;
  question: string;
  options: DetectedOption[];
  optionCount: number;
  correctAnswer?: string;
  correctAnswerIndex?: number;
  interactionRecommendation:
    | 'mcq'
    | 'true_false'
    | 'rating'
    | 'word_cloud'
    | 'discussion'
    | 'drawing'
    | 'reflection'
    | 'attendance'
    | 'exit_ticket'
    | 'poll'
    | 'short_answer'
    | 'numeric_answer';
  confidence: number;
}

/**
 * Extract clean string text lines from slide JSON content
 */
export function extractSlideTextLines(slide: { title?: string; content?: any; notes?: string }): string[] {
  const lines: string[] = [];

  if (slide.title && slide.title.trim()) {
    lines.push(slide.title.trim());
  }

  const content = slide.content;

  if (typeof content === 'string') {
    lines.push(...content.split('\n').map((l) => l.trim()).filter(Boolean));
  } else if (Array.isArray(content)) {
    // Array of elements/shapes
    for (const item of content) {
      if (typeof item === 'string') {
        lines.push(item.trim());
      } else if (item && typeof item === 'object') {
        if (item.text) {
          if (Array.isArray(item.text)) {
            lines.push(...item.text.map((t: any) => String(t).trim()).filter(Boolean));
          } else {
            lines.push(String(item.text).trim());
          }
        }
        if (item.paragraphs && Array.isArray(item.paragraphs)) {
          for (const p of item.paragraphs) {
            if (p.text) lines.push(String(p.text).trim());
            if (p.runs && Array.isArray(p.runs)) {
              const runText = p.runs.map((r: any) => r.text || '').join('').trim();
              if (runText && !lines.includes(runText)) lines.push(runText);
            }
          }
        }
        if (item.rows && Array.isArray(item.rows)) {
          // Table rows
          for (const row of item.rows) {
            if (row.cells && Array.isArray(row.cells)) {
              for (const cell of row.cells) {
                const cellText = typeof cell === 'string' ? cell : cell?.text ?? '';
                if (cellText.trim()) lines.push(cellText.trim());
              }
            }
          }
        }
      }
    }
  } else if (content && typeof content === 'object') {
    if (content.elements && Array.isArray(content.elements)) {
      for (const el of content.elements) {
        if (el.text) lines.push(String(el.text).trim());
        if (el.paragraphs && Array.isArray(el.paragraphs)) {
          for (const p of el.paragraphs) {
            const pText = p.text || (p.runs ? p.runs.map((r: any) => r.text || '').join('') : '');
            if (pText.trim()) lines.push(pText.trim());
          }
        }
      }
    }
  }

  // Deduplicate consecutive identical lines
  return lines.filter((line, index, self) => line && self.indexOf(line) === index);
}

/**
 * Main parser function to analyze slide content and determine question/options/interaction
 */
export function analyzeSlideContent(slide: {
  title?: string;
  content?: any;
  notes?: string;
}): SlideInteractionAnalysis {
  const lines = extractSlideTextLines(slide);
  const notes = slide.notes ?? '';
  const fullText = [...lines, notes].join('\n').toLowerCase();

  // 1. Detect Interaction Intent from text keywords
  let recommendation: SlideInteractionAnalysis['interactionRecommendation'] = 'poll';
  let confidence = 0.5;

  // Check specific non-MCQ interaction keywords
  if (/\b(attendance|check\s*in|mark\s*present|present\?\b)/i.test(fullText)) {
    recommendation = 'attendance';
    confidence = 0.95;
    return {
      isQuestion: true,
      question: slide.title || 'Attendance Check: Please confirm your presence',
      options: [{ text: 'Present', label: '1' }],
      optionCount: 1,
      interactionRecommendation: recommendation,
      confidence,
    };
  }

  if (/\b(exit\s*ticket|exit\s*check|final\s*thought|before\s*you\s*leave)/i.test(fullText)) {
    recommendation = 'exit_ticket';
    confidence = 0.9;
    return {
      isQuestion: true,
      question: slide.title || 'Exit Ticket: What is your main takeaway from today?',
      options: [],
      optionCount: 0,
      interactionRecommendation: recommendation,
      confidence,
    };
  }

  if (/\b(reflection|reflect|what\s*did\s*you\s*learn|takeaway|summary)/i.test(fullText)) {
    recommendation = 'reflection';
    confidence = 0.9;
    return {
      isQuestion: true,
      question: slide.title || 'Reflection: Share your thoughts or key takeaway',
      options: [],
      optionCount: 0,
      interactionRecommendation: recommendation,
      confidence,
    };
  }

  if (/\b(word\s*cloud|one\s*word|single\s*word|keyword|brainstorm\s*word)/i.test(fullText)) {
    recommendation = 'word_cloud';
    confidence = 0.95;
    return {
      isQuestion: true,
      question: slide.title || 'Word Cloud: Type one word that describes this concept',
      options: [],
      optionCount: 0,
      interactionRecommendation: recommendation,
      confidence,
    };
  }

  if (/\b(discuss|partner|pair\s*share|group\s*discussion|chat\s*about|thoughts\s*on)/i.test(fullText)) {
    recommendation = 'discussion';
    confidence = 0.88;
    return {
      isQuestion: true,
      question: slide.title || 'Discussion: Share your perspective with the class',
      options: [],
      optionCount: 0,
      interactionRecommendation: recommendation,
      confidence,
    };
  }

  if (/\b(draw|sketch|diagram|annotate|canvas|illustration)/i.test(fullText)) {
    recommendation = 'drawing';
    confidence = 0.92;
    return {
      isQuestion: true,
      question: slide.title || 'Drawing Challenge: Sketch your solution on screen',
      options: [],
      optionCount: 0,
      interactionRecommendation: recommendation,
      confidence,
    };
  }

  if (/\b(rate|rating|scale\s*1\s*to\s*5|score\s*today|how\s*satisfied)/i.test(fullText)) {
    recommendation = 'rating';
    confidence = 0.92;
    return {
      isQuestion: true,
      question: slide.title || 'Rating: How would you rate today\'s session (1-5)?',
      options: [
        { text: '1 Star - Poor', label: '1' },
        { text: '2 Stars - Fair', label: '2' },
        { text: '3 Stars - Good', label: '3' },
        { text: '4 Stars - Very Good', label: '4' },
        { text: '5 Stars - Excellent', label: '5' },
      ],
      optionCount: 5,
      interactionRecommendation: recommendation,
      confidence,
    };
  }

  if (/\b(true\s*(or|\/)\s*false|t\s*\/\s*f)\b/i.test(fullText)) {
    recommendation = 'true_false';
    confidence = 0.95;
    const questionText = extractQuestionHeader(lines) || slide.title || 'True or False?';

    // Check correct answer from notes
    let correctAnswer: string | undefined;
    let correctAnswerIndex: number | undefined;

    if (/\banswer:\s*true\b/i.test(notes) || /\bcorrect:\s*true\b/i.test(notes)) {
      correctAnswer = 'True';
      correctAnswerIndex = 0;
    } else if (/\banswer:\s*false\b/i.test(notes) || /\bcorrect:\s*false\b/i.test(notes)) {
      correctAnswer = 'False';
      correctAnswerIndex = 1;
    }

    return {
      isQuestion: true,
      question: questionText,
      options: [
        { text: 'True', label: 'A', isCorrect: correctAnswer === 'True' },
        { text: 'False', label: 'B', isCorrect: correctAnswer === 'False' },
      ],
      optionCount: 2,
      correctAnswer,
      correctAnswerIndex,
      interactionRecommendation: recommendation,
      confidence,
    };
  }

  // 2. Parse Options from Slide Lines
  const options: DetectedOption[] = [];
  let questionHeader = '';

  // RegEx patterns for options
  const optionPatterns = [
    // A., B), c -
    { regex: /^([A-Ea-e])[\.\:\)\-]\s+(.+)$/, getLabel: (m: RegExpMatchArray) => m[1].toUpperCase() },
    // 1., 2), 3 -
    { regex: /^(\d+)[\.\:\)\-]\s+(.+)$/, getLabel: (m: RegExpMatchArray) => m[1] },
    // Roman numerals: I., II), III -
    { regex: /^(I|II|III|IV|V|VI)[\.\:\)\-]\s+(.+)$/i, getLabel: (m: RegExpMatchArray) => m[1].toUpperCase() },
    // Bullets, Hyphens, Checkboxes
    { regex: /^[\u2022\u25CF\u25CB\u25A0\u25A1\u25C6\-\*]\s*(.+)$/, getLabel: (_: RegExpMatchArray, idx: number) => String.fromCharCode(65 + idx) },
  ];

  const headerCandidates: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let matched = false;

    for (const pattern of optionPatterns) {
      const match = line.match(pattern.regex);
      if (match) {
        const optionText = match[match.length - 1].trim();
        // Check if option contains explicit correct indicator
        const isExplicitCorrect = /\((correct|answer|true)\)|\*|\[x\]|✅|✔/i.test(line);
        const cleanedText = optionText.replace(/\((correct|answer|true)\)|\*|\[x\]|✅|✔/gi, '').trim();

        const label = pattern.getLabel(match, options.length);
        options.push({
          text: cleanedText,
          label,
          isCorrect: isExplicitCorrect,
        });
        matched = true;
        break;
      }
    }

    if (!matched) {
      if (line.endsWith('?') || /^(what|which|why|how|who|where|when|select|choose|identify)\b/i.test(line)) {
        questionHeader = line;
      } else if (options.length === 0) {
        headerCandidates.push(line);
      }
    }
  }

  if (!questionHeader && headerCandidates.length > 0) {
    questionHeader = headerCandidates.join(' ');
  }

  if (!questionHeader) {
    questionHeader = slide.title || 'Interactive Question';
  }

  // 3. Detect Correct Answer from Notes or Explicit Indicators
  let correctAnswer: string | undefined;
  let correctAnswerIndex: number | undefined;

  // Check if option was explicitly marked correct in slide text
  const explicitCorrectIdx = options.findIndex((o) => o.isCorrect);
  if (explicitCorrectIdx >= 0) {
    correctAnswer = options[explicitCorrectIdx].text;
    correctAnswerIndex = explicitCorrectIdx;
  } else {
    // Search slide notes for Answer: B or Correct: 2
    const noteAnswerMatch = notes.match(/\b(answer|correct|key)\s*[:\-]\s*([A-Ea-e1-5]|true|false)\b/i);
    if (noteAnswerMatch) {
      const key = noteAnswerMatch[2].toUpperCase();
      const idx = options.findIndex((o) => o.label?.toUpperCase() === key || o.text.toLowerCase() === key.toLowerCase());
      if (idx >= 0) {
        options[idx].isCorrect = true;
        correctAnswer = options[idx].text;
        correctAnswerIndex = idx;
      }
    }
  }

  const isQuestion = options.length >= 2 || questionHeader.includes('?');
  const optionCount = options.length;

  if (optionCount >= 2) {
    confidence = correctAnswer ? 0.95 : 0.85;
    recommendation = correctAnswer ? 'mcq' : 'poll';
  } else if (isQuestion) {
    confidence = 0.7;
    recommendation = 'discussion';
  } else {
    confidence = 0.4;
    recommendation = 'poll';
  }

  return {
    isQuestion,
    question: questionHeader,
    options,
    optionCount,
    correctAnswer,
    correctAnswerIndex,
    interactionRecommendation: recommendation,
    confidence,
  };
}

function extractQuestionHeader(lines: string[]): string | undefined {
  for (const line of lines) {
    if (line.includes('?') || /^(what|which|why|how|who|where|when|is|are|can|do|does)\b/i.test(line)) {
      return line;
    }
  }
  return undefined;
}
