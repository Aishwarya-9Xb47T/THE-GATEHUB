import { AntiGravityV2Result } from './types.js';

export class JsonOutputEngine {
  /**
   * Format complete V2 Knowledge Object into clean, structured JSON
   */
  public static format(result: AntiGravityV2Result): string {
    return JSON.stringify(result, null, 2);
  }
}
