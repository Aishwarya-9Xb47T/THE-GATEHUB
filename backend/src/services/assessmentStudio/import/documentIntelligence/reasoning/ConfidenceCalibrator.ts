/**
 * Confidence Calibrator
 * Calibrates confidence scores using historical data
 * Adjusts confidence based on actual accuracy from past extractions
 */

export interface CalibrationData {
  timestamp: Date;
  predictedConfidence: number;
  actualAccuracy: number;
  questionType: string;
  difficulty: string;
}

export interface CalibrationModel {
  intercept: number;
  slope: number;
  typeAdjustments: Record<string, number>;
  difficultyAdjustments: Record<string, 'easy' | 'medium' | 'hard'>;
  lastCalibrated: Date;
  sampleSize: number;
}

export class ConfidenceCalibrator {
  private calibrationData: CalibrationData[];
  private model: CalibrationModel;
  private minSampleSize: number = 50;

  constructor() {
    this.calibrationData = [];
    this.model = this.initializeModel();
  }

  /**
   * Initialize calibration model
   */
  private initializeModel(): CalibrationModel {
    return {
      intercept: 0,
      slope: 1,
      typeAdjustments: {},
      difficultyAdjustments: {},
      lastCalibrated: new Date(),
      sampleSize: 0,
    };
  }

  /**
   * Add calibration data point
   */
  addCalibrationData(data: CalibrationData): void {
    this.calibrationData.push(data);
    console.log(`[ConfidenceCalibrator] Added calibration data point (total: ${this.calibrationData.length})`);
  }

  /**
   * Calibrate confidence score with enhanced semantic reasoning
   * Think like a human educator assessing extraction certainty
   */
  calibrate(
    predictedConfidence: number,
    questionType: string,
    difficulty: string,
    contextFactors?: {
      hasComplexFormatting?: boolean;
      hasAmbiguousMarkers?: boolean;
      hasMultipleAnswerIndicators?: boolean;
      hasContextualContent?: boolean;
      extractionComplexity?: number;
    }
  ): number {
    let calibrated = this.model.intercept + this.model.slope * predictedConfidence;

    // Apply type adjustment based on historical performance
    if (this.model.typeAdjustments[questionType]) {
      calibrated *= this.model.typeAdjustments[questionType];
    }

    // Apply difficulty adjustment
    if (this.model.difficultyAdjustments[difficulty]) {
      const diffAdj = this.model.difficultyAdjustments[difficulty];
      if (diffAdj === 'easy') {
        calibrated *= 1.05; // Easy questions often overconfident
      } else if (diffAdj === 'hard') {
        calibrated *= 0.95; // Hard questions often underconfident
      }
    }

    // Apply context-based adjustments (semantic reasoning)
    if (contextFactors) {
      // Complex formatting reduces confidence (harder to parse)
      if (contextFactors.hasComplexFormatting) {
        calibrated *= 0.92;
      }

      // Ambiguous markers reduce confidence
      if (contextFactors.hasAmbiguousMarkers) {
        calibrated *= 0.88;
      }

      // Multiple answer indicators suggest uncertainty
      if (contextFactors.hasMultipleAnswerIndicators) {
        calibrated *= 0.85;
      }

      // Contextual content increases confidence (semantic clarity)
      if (contextFactors.hasContextualContent) {
        calibrated *= 1.05;
      }

      // Extraction complexity inversely affects confidence
      if (contextFactors.extractionComplexity) {
        calibrated *= Math.max(0.7, 1 - (contextFactors.extractionComplexity * 0.1));
      }
    }

    // Apply semantic reasonableness check
    // If confidence is very high (>0.98) without strong evidence, reduce it
    if (calibrated > 0.98 && (!contextFactors || !contextFactors.hasContextualContent)) {
      calibrated = 0.95; // Be conservative without strong evidence
    }

    // If confidence is very low (<0.3) for simple questions, boost it
    if (calibrated < 0.3 && difficulty === 'easy' && 
        (questionType === 'multiple_choice' || questionType === 'true_false')) {
      calibrated = 0.45; // Simple questions should be extractable
    }

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, calibrated));
  }

  /**
   * Recalibrate model from historical data
   */
  recalibrate(): { success: boolean; message: string } {
    if (this.calibrationData.length < this.minSampleSize) {
      return {
        success: false,
        message: `Insufficient data: ${this.calibrationData.length} samples (need ${this.minSampleSize})`,
      };
    }

    console.log(`[ConfidenceCalibrator] Recalibrating with ${this.calibrationData.length} samples`);

    // Calculate linear regression
    const { intercept, slope } = this.calculateLinearRegression();

    // Calculate type-specific adjustments
    const typeAdjustments: Record<string, number> = {};
    const typeGroups = this.groupByType();

    for (const [type, data] of typeGroups.entries()) {
      const avgPredicted = data.reduce((sum, d) => sum + d.predictedConfidence, 0) / data.length;
      const avgActual = data.reduce((sum, d) => sum + d.actualAccuracy, 0) / data.length;
      typeAdjustments[type] = avgActual / avgPredicted;
    }

    // Calculate difficulty-specific adjustments
    const difficultyAdjustments: Record<string, 'easy' | 'medium' | 'hard'> = {};
    const diffGroups = this.groupByDifficulty();

    for (const [difficulty, data] of diffGroups.entries()) {
      const avgPredicted = data.reduce((sum, d) => sum + d.predictedConfidence, 0) / data.length;
      const avgActual = data.reduce((sum, d) => sum + d.actualAccuracy, 0) / data.length;
      
      if (avgPredicted > avgActual) {
        difficultyAdjustments[difficulty] = 'easy'; // Overconfident
      } else if (avgPredicted < avgActual) {
        difficultyAdjustments[difficulty] = 'hard'; // Underconfident
      } else {
        difficultyAdjustments[difficulty] = 'medium';
      }
    }

    // Update model
    this.model = {
      intercept,
      slope,
      typeAdjustments,
      difficultyAdjustments,
      lastCalibrated: new Date(),
      sampleSize: this.calibrationData.length,
    };

    console.log('[ConfidenceCalibrator] Recalibration complete');

    return {
      success: true,
      message: `Recalibrated with ${this.calibrationData.length} samples`,
    };
  }

  /**
   * Calculate linear regression
   */
  private calculateLinearRegression(): { intercept: number; slope: number } {
    const n = this.calibrationData.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (const data of this.calibrationData) {
      sumX += data.predictedConfidence;
      sumY += data.actualAccuracy;
      sumXY += data.predictedConfidence * data.actualAccuracy;
      sumX2 += data.predictedConfidence * data.predictedConfidence;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { intercept, slope };
  }

  /**
   * Group calibration data by question type
   */
  private groupByType(): Map<string, CalibrationData[]> {
    const groups = new Map<string, CalibrationData[]>();

    for (const data of this.calibrationData) {
      if (!groups.has(data.questionType)) {
        groups.set(data.questionType, []);
      }
      groups.get(data.questionType)!.push(data);
    }

    return groups;
  }

  /**
   * Group calibration data by difficulty
   */
  private groupByDifficulty(): Map<string, CalibrationData[]> {
    const groups = new Map<string, CalibrationData[]>();

    for (const data of this.calibrationData) {
      if (!groups.has(data.difficulty)) {
        groups.set(data.difficulty, []);
      }
      groups.get(data.difficulty)!.push(data);
    }

    return groups;
  }

  /**
   * Get calibration statistics
   */
  getStatistics(): {
    totalSamples: number;
    modelAge: number;
    calibrationAccuracy: number;
    typeAdjustments: Record<string, number>;
    difficultyAdjustments: Record<string, 'easy' | 'medium' | 'hard'>;
  } {
    const modelAge = Date.now() - this.model.lastCalibrated.getTime();
    
    // Calculate calibration accuracy (how well predicted matches actual)
    let totalError = 0;
    for (const data of this.calibrationData) {
      const calibrated = this.calibrate(data.predictedConfidence, data.questionType, data.difficulty);
      totalError += Math.abs(calibrated - data.actualAccuracy);
    }
    const calibrationAccuracy = this.calibrationData.length > 0 
      ? 1 - (totalError / this.calibrationData.length)
      : 0;

    return {
      totalSamples: this.calibrationData.length,
      modelAge,
      calibrationAccuracy,
      typeAdjustments: this.model.typeAdjustments,
      difficultyAdjustments: this.model.difficultyAdjustments,
    };
  }

  /**
   * Export calibration data
   */
  exportData(): string {
    return JSON.stringify({
      calibrationData: this.calibrationData,
      model: this.model,
    }, null, 2);
  }

  /**
   * Import calibration data
   */
  importData(json: string): { success: boolean; message: string } {
    try {
      const data = JSON.parse(json);
      
      if (data.calibrationData) {
        this.calibrationData = data.calibrationData;
      }
      
      if (data.model) {
        this.model = data.model;
      }

      console.log(`[ConfidenceCalibrator] Imported ${this.calibrationData.length} calibration data points`);

      return {
        success: true,
        message: `Imported ${this.calibrationData.length} samples`,
      };
    } catch (error) {
      console.error('[ConfidenceCalibrator] Failed to import data:', error);
      return {
        success: false,
        message: 'Failed to parse JSON data',
      };
    }
  }

  /**
   * Reset calibration
   */
  reset(): void {
    this.calibrationData = [];
    this.model = this.initializeModel();
    console.log('[ConfidenceCalibrator] Reset to initial state');
  }

  /**
   * Get model info
   */
  getModelInfo(): CalibrationModel {
    return { ...this.model };
  }

  /**
   * Set minimum sample size for recalibration
   */
  setMinSampleSize(size: number): void {
    this.minSampleSize = size;
    console.log(`[ConfidenceCalibrator] Set minimum sample size to ${size}`);
  }
}
