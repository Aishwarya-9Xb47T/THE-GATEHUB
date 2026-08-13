/**
 * List Engine
 * Preserves multi-level list structures including ordered, bulleted, roman,
 * alphabetic, checklist, and deeply nested list levels.
 */

export interface ListItemStructure {
  id: string;
  level: number;
  type: 'ordered' | 'bullet' | 'roman' | 'alpha' | 'checkbox';
  prefix: string; // e.g. "1.", "a)", "i.", "[x]"
  text: string;
  isChecked?: boolean;
}

export class ListEngine {
  private static readonly ROMAN_REGEX = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)\.|\)/i;
  private static readonly ALPHA_REGEX = /^[a-z][\.\)]/i;
  private static readonly DIGIT_REGEX = /^\d+[\.\)]/;
  private static readonly CHECKBOX_REGEX = /^\[([ xX])\]/;

  /**
   * Determine item type from marker string
   */
  static detectListType(marker: string): ListItemStructure['type'] {
    const clean = marker.trim();
    if (this.CHECKBOX_REGEX.test(clean)) return 'checkbox';
    if (this.ROMAN_REGEX.test(clean)) return 'roman';
    if (this.DIGIT_REGEX.test(clean)) return 'ordered';
    if (this.ALPHA_REGEX.test(clean)) return 'alpha';
    return 'bullet';
  }

  /**
   * Parse bullet / line marker from text
   */
  static parseListItem(text: string, defaultLevel: number = 0): ListItemStructure | null {
    const indentMatch = text.match(/^(\s*)/);
    const spaces = indentMatch ? indentMatch[1].length : 0;
    const level = Math.floor(spaces / 2) + defaultLevel;

    const trimmed = text.trim();

    // Checkbox
    const cbMatch = trimmed.match(/^\[([ xX])\]\s*(.*)/);
    if (cbMatch) {
      return {
        id: `list_${Date.now()}_${Math.random()}`,
        level,
        type: 'checkbox',
        prefix: `[${cbMatch[1]}]`,
        text: cbMatch[2],
        isChecked: cbMatch[1].toLowerCase() === 'x',
      };
    }

    // Numbered / Alpha / Roman
    const numMatch = trimmed.match(/^(\d+|[a-zA-Z]|[ivxLCDM]+)[\.\)]\s*(.*)/);
    if (numMatch) {
      const marker = numMatch[1];
      const type = this.detectListType(`${marker}.`);
      return {
        id: `list_${Date.now()}_${Math.random()}`,
        level,
        type,
        prefix: numMatch[0].substring(0, numMatch[0].indexOf(numMatch[2])).trim(),
        text: numMatch[2],
      };
    }

    // Bullet
    const bulletMatch = trimmed.match(/^([•\-\*\+])\s*(.*)/);
    if (bulletMatch) {
      return {
        id: `list_${Date.now()}_${Math.random()}`,
        level,
        type: 'bullet',
        prefix: bulletMatch[1],
        text: bulletMatch[2],
      };
    }

    return null;
  }
}
