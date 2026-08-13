/**
 * Slide content parser — server-side mirror of frontend slideParser.
 * Used for enriching live interactions and export reports.
 */

export interface ParsedSlideContent {
  question: string;
  options: Array<{ text: string; isCorrect?: boolean }>;
}

export function parseSlideContent(slide: { title?: string; content?: unknown }): ParsedSlideContent {
  const content = (slide.content ?? {}) as Record<string, unknown>;
  const question = extractQuestion(content) || slide.title?.trim() || '';
  const options = extractOptions(content);
  return { question, options };
}

function extractQuestion(content: Record<string, unknown>): string {
  if (typeof content.question === 'string') return content.question;
  if (typeof content.title === 'string') return content.title;
  if (typeof content.heading === 'string') return content.heading;

  if (content.text) {
    const text = Array.isArray(content.text) ? content.text.join(' ') : String(content.text);
    if (/\?$/.test(text) || /^(What|Which|How|Why|When|Where|Who)/i.test(text)) return text;
  }

  if (Array.isArray(content.shapes)) {
    for (const shape of content.shapes as Array<{ text?: string }>) {
      if (shape.text && /\?$/.test(shape.text)) return shape.text;
    }
  }

  if (Array.isArray(content.paragraphs)) {
    for (const para of content.paragraphs as Array<{ text?: string }>) {
      if (para.text && /\?$/.test(para.text)) return para.text;
    }
  }

  if (Array.isArray(content.textRuns)) {
    const text = (content.textRuns as Array<{ text?: string }>).map((r) => r.text ?? '').join('');
    if (/\?$/.test(text)) return text;
  }

  return '';
}

function extractOptions(content: Record<string, unknown>): Array<{ text: string; isCorrect?: boolean }> {
  if (Array.isArray(content.options)) {
    return content.options as Array<{ text: string; isCorrect?: boolean }>;
  }

  if (Array.isArray(content.choices)) {
    return (content.choices as unknown[]).map((choice) =>
      typeof choice === 'string'
        ? { text: choice }
        : { text: (choice as { text: string }).text, isCorrect: (choice as { isCorrect?: boolean }).isCorrect },
    );
  }

  const options: Array<{ text: string; isCorrect?: boolean }> = [];

  if (content.text) {
    const items = Array.isArray(content.text) ? content.text : [content.text];
    for (const item of items) {
      if (typeof item === 'string') {
        const match = item.match(/^([A-Z]\.|[0-9]\.|•|-)\s*(.+)$/);
        if (match) options.push({ text: match[2]! });
      }
    }
  }

  if (Array.isArray(content.paragraphs)) {
    for (const para of content.paragraphs as Array<{ text?: string }>) {
      if (!para.text || /\?$/.test(para.text)) continue;
      const match = para.text.match(/^([A-Z]\.|[0-9]\.|•|-)\s*(.+)$/);
      if (match) options.push({ text: match[2]! });
      else if (para.text.length > 0 && para.text.length < 200) options.push({ text: para.text });
    }
  }

  return options;
}

export function getDefaultOptionsForType(type: string): Array<{ text: string; isCorrect?: boolean }> {
  switch (type) {
    case 'true_false':
      return [{ text: 'True' }, { text: 'False' }];
    case 'rating':
      return [];
    default:
      return [
        { text: 'Option A' },
        { text: 'Option B' },
        { text: 'Option C' },
        { text: 'Option D' },
      ];
  }
}

export function enrichInteractionSettings(
  slide: { title?: string; content?: unknown },
  type: string,
  settings: Record<string, unknown> = {},
): Record<string, unknown> {
  const parsed = parseSlideContent(slide);
  const result: Record<string, unknown> = {
    showResults: true,
    anonymous: false,
    ...settings,
  };

  if (!result.question) {
    result.question = parsed.question || slide.title?.trim() || 'Live Question';
  }

  const existing = result.options;
  if (!Array.isArray(existing) || existing.length === 0) {
    result.options = parsed.options.length > 0 ? parsed.options : getDefaultOptionsForType(type);
  }

  return result;
}
