/**
 * Slide Content Parser
 * 
 * Extracts questions, options, and content from slide data.
 * This makes the slide the single source of truth for interaction content.
 */

export interface ParsedSlide {
  question: string;
  options: Array<{ text: string; isCorrect?: boolean }>;
  interaction: {
    type: string;
    confidence: number;
    reason: string;
  };
}

export function parseSlide(slide: any): ParsedSlide {
  const content = slide.content || {};
  const question = extractQuestion(content);
  const options = extractOptions(content);
  const interaction = detectInteractionType(content, question, options);

  return {
    question,
    options,
    interaction,
  };
}

function extractQuestion(content: any): string {
  // Try different fields where questions might be stored
  if (content.question) return content.question;
  if (content.title) return content.title;
  if (content.heading) return content.heading;
  
  // Extract from text content
  if (content.text) {
    // Look for question patterns
    const text = Array.isArray(content.text) ? content.text.join(' ') : content.text;
    if (text.match(/\?$/)) return text;
    if (text.match(/^(What|Which|How|Why|When|Where|Who)/i)) return text;
  }
  
  // Extract from shapes/text boxes
  if (content.shapes) {
    for (const shape of content.shapes) {
      if (shape.text && shape.text.match(/\?$/)) return shape.text;
    }
  }
  
  // Extract from paragraphs (common in PPT exports)
  if (content.paragraphs) {
    for (const para of content.paragraphs) {
      if (para.text && para.text.match(/\?$/)) return para.text;
    }
  }
  
  // Extract from text runs
  if (content.textRuns) {
    const text = content.textRuns.map((run: any) => run.text || '').join('');
    if (text.match(/\?$/)) return text;
  }
  
  return '';
}

function extractOptions(content: any): Array<{ text: string; isCorrect?: boolean }> {
  const options: Array<{ text: string; isCorrect?: boolean }> = [];
  
  // Try different fields where options might be stored
  if (content.options && Array.isArray(content.options)) {
    return content.options;
  }
  
  if (content.choices && Array.isArray(content.choices)) {
    return content.choices.map((choice: any) => ({
      text: typeof choice === 'string' ? choice : choice.text,
      isCorrect: choice.isCorrect,
    }));
  }
  
  // Extract from bullet points or numbered lists
  if (content.text) {
    const text = Array.isArray(content.text) ? content.text : [content.text];
    for (const item of text) {
      if (typeof item === 'string') {
        // Match patterns like "A. Option", "1. Option", "• Option"
        const match = item.match(/^([A-Z]\.|[0-9]\.|•|-)\s*(.+)$/);
        if (match) {
          options.push({ text: match[2] });
        }
      }
    }
  }
  
  // Extract from shapes
  if (content.shapes) {
    for (const shape of content.shapes) {
      if (shape.text && !shape.text.match(/\?$/)) {
        // Skip if it looks like a question
        options.push({ text: shape.text });
      }
    }
  }
  
  // Extract from paragraphs (common in PPT exports)
  if (content.paragraphs) {
    for (const para of content.paragraphs) {
      if (para.text && !para.text.match(/\?$/)) {
        const match = para.text.match(/^([A-Z]\.|[0-9]\.|•|-)\s*(.+)$/);
        if (match) {
          options.push({ text: match[2] });
        } else if (para.text.length > 0 && para.text.length < 200) {
          // Assume it's an option if it's reasonably short
          options.push({ text: para.text });
        }
      }
    }
  }
  
  // Extract from text runs
  if (content.textRuns) {
    for (const run of content.textRuns) {
      if (run.text && !run.text.match(/\?$/) && run.text.length > 0 && run.text.length < 200) {
        options.push({ text: run.text });
      }
    }
  }
  
  return options;
}

function detectInteractionType(
  content: any,
  question: string,
  options: Array<{ text: string }>
): { type: string; confidence: number; reason: string } {
  // If we have a question and options, it's likely a choice-based interaction
  if (question && options.length > 0) {
    if (options.length === 2) {
      // Could be true/false or simple choice
      const lowerQuestion = question.toLowerCase();
      if (lowerQuestion.includes('true') || lowerQuestion.includes('false')) {
        return {
          type: 'true_false',
          confidence: 0.9,
          reason: 'Question contains true/false keywords with 2 options',
        };
      }
      return {
        type: 'mcq',
        confidence: 0.8,
        reason: 'Question with 2 options detected',
      };
    }
    
    if (options.length > 2) {
      const lowerQuestion = question.toLowerCase();
      if (lowerQuestion.includes('select all') || lowerQuestion.includes('multiple')) {
        return {
          type: 'multiple_select',
          confidence: 0.85,
          reason: 'Question suggests multiple correct answers',
        };
      }
      if (lowerQuestion.includes('poll') || lowerQuestion.includes('vote')) {
        return {
          type: 'poll',
          confidence: 0.8,
          reason: 'Question appears to be a poll',
        };
      }
      return {
        type: 'mcq',
        confidence: 0.85,
        reason: 'Question with multiple options detected',
      };
    }
  }
  
  // If we have a question but no options, it might be open-ended
  if (question && options.length === 0) {
    const lowerQuestion = question.toLowerCase();
    if (lowerQuestion.includes('rate') || lowerQuestion.includes('score')) {
      return {
        type: 'rating',
        confidence: 0.75,
        reason: 'Question asks for rating/scoring',
      };
    }
    if (lowerQuestion.includes('discuss') || lowerQuestion.includes('thoughts')) {
      return {
        type: 'discussion',
        confidence: 0.7,
        reason: 'Question invites discussion',
      };
    }
    if (lowerQuestion.includes('reflect') || lowerQuestion.includes('think about')) {
      return {
        type: 'reflection',
        confidence: 0.7,
        reason: 'Question asks for reflection',
      };
    }
    return {
      type: 'open_answer',
      confidence: 0.6,
      reason: 'Question without options detected',
    };
  }
  
  // No clear interaction detected
  return {
    type: 'none',
    confidence: 0.5,
    reason: 'No clear interaction pattern detected',
  };
}
