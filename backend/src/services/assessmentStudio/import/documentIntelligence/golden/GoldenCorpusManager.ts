/**
 * Golden Corpus Manager
 * Manages a curated set of documents with ground truth for benchmarking
 */

import { QuestionObject } from '../types.js';

export interface GoldenDocument {
  id: string;
  name: string;
  source: string;
  type: 'pdf' | 'docx' | 'pptx' | 'image' | 'markdown';
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  language: string;
  totalPages: number;
  totalQuestions: number;
  groundTruth: QuestionObject[];
  metadata: {
    author?: string;
    subject?: string;
    grade?: string;
    year?: number;
    tags: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CorpusStatistics {
  totalDocuments: number;
  totalQuestions: number;
  documentsByType: Record<string, number>;
  documentsByCategory: Record<string, number>;
  documentsByDifficulty: Record<string, number>;
  averageQuestionsPerDocument: number;
  totalPages: number;
}

export class GoldenCorpusManager {
  private corpus: Map<string, GoldenDocument>;
  private corpusPath: string;

  constructor(corpusPath: string = './golden-corpus') {
    this.corpus = new Map();
    this.corpusPath = corpusPath;
  }

  /**
   * Add document to golden corpus
   */
  addDocument(document: GoldenDocument): void {
    document.updatedAt = new Date();
    this.corpus.set(document.id, document);
    console.log(`[GoldenCorpusManager] Added document: ${document.name} (${document.totalQuestions} questions)`);
  }

  /**
   * Get document by ID
   */
  getDocument(id: string): GoldenDocument | undefined {
    return this.corpus.get(id);
  }

  /**
   * Get all documents
   */
  getAllDocuments(): GoldenDocument[] {
    return Array.from(this.corpus.values());
  }

  /**
   * Get documents by category
   */
  getDocumentsByCategory(category: string): GoldenDocument[] {
    return this.getAllDocuments().filter(doc => doc.category === category);
  }

  /**
   * Get documents by difficulty
   */
  getDocumentsByDifficulty(difficulty: 'easy' | 'medium' | 'hard'): GoldenDocument[] {
    return this.getAllDocuments().filter(doc => doc.difficulty === difficulty);
  }

  /**
   * Get documents by type
   */
  getDocumentsByType(type: GoldenDocument['type']): GoldenDocument[] {
    return this.getAllDocuments().filter(doc => doc.type === type);
  }

  /**
   * Remove document from corpus
   */
  removeDocument(id: string): boolean {
    const deleted = this.corpus.delete(id);
    if (deleted) {
      console.log(`[GoldenCorpusManager] Removed document: ${id}`);
    }
    return deleted;
  }

  /**
   * Update document ground truth
   */
  updateGroundTruth(id: string, groundTruth: QuestionObject[]): boolean {
    const document = this.corpus.get(id);
    if (!document) {
      return false;
    }

    document.groundTruth = groundTruth;
    document.totalQuestions = groundTruth.length;
    document.updatedAt = new Date();
    
    console.log(`[GoldenCorpusManager] Updated ground truth for: ${document.name}`);
    return true;
  }

  /**
   * Get corpus statistics
   */
  getStatistics(): CorpusStatistics {
    const documents = this.getAllDocuments();
    const totalDocuments = documents.length;
    const totalQuestions = documents.reduce((sum, doc) => sum + doc.totalQuestions, 0);
    const totalPages = documents.reduce((sum, doc) => sum + doc.totalPages, 0);

    const documentsByType: Record<string, number> = {};
    const documentsByCategory: Record<string, number> = {};
    const documentsByDifficulty: Record<string, number> = {};

    for (const doc of documents) {
      documentsByType[doc.type] = (documentsByType[doc.type] || 0) + 1;
      documentsByCategory[doc.category] = (documentsByCategory[doc.category] || 0) + 1;
      documentsByDifficulty[doc.difficulty] = (documentsByDifficulty[doc.difficulty] || 0) + 1;
    }

    return {
      totalDocuments,
      totalQuestions,
      documentsByType,
      documentsByCategory,
      documentsByDifficulty,
      averageQuestionsPerDocument: totalDocuments > 0 ? totalQuestions / totalDocuments : 0,
      totalPages,
    };
  }

  /**
   * Search documents by tags
   */
  searchByTags(tags: string[]): GoldenDocument[] {
    return this.getAllDocuments().filter(doc =>
      tags.some(tag => doc.metadata.tags.includes(tag))
    );
  }

  /**
   * Search documents by subject
   */
  searchBySubject(subject: string): GoldenDocument[] {
    return this.getAllDocuments().filter(doc =>
      doc.metadata.subject?.toLowerCase().includes(subject.toLowerCase())
    );
  }

  /**
   * Export corpus as JSON
   */
  exportCorpus(): string {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      statistics: this.getStatistics(),
      documents: this.getAllDocuments(),
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import corpus from JSON
   */
  importCorpus(json: string): { success: boolean; message: string } {
    try {
      const data = JSON.parse(json);
      
      if (!data.documents || !Array.isArray(data.documents)) {
        return {
          success: false,
          message: 'Invalid corpus format: missing documents array',
        };
      }

      for (const doc of data.documents) {
        this.corpus.set(doc.id, {
          ...doc,
          createdAt: new Date(doc.createdAt),
          updatedAt: new Date(doc.updatedAt),
        });
      }

      console.log(`[GoldenCorpusManager] Imported ${data.documents.length} documents`);

      return {
        success: true,
        message: `Imported ${data.documents.length} documents`,
      };
    } catch (error) {
      console.error('[GoldenCorpusManager] Failed to import corpus:', error);
      return {
        success: false,
        message: 'Failed to parse JSON data',
      };
    }
  }

  /**
   * Clear corpus
   */
  clearCorpus(): void {
    this.corpus.clear();
    console.log('[GoldenCorpusManager] Corpus cleared');
  }

  /**
   * Get random document for testing
   */
  getRandomDocument(): GoldenDocument | undefined {
    const documents = this.getAllDocuments();
    if (documents.length === 0) {
      return undefined;
    }
    const randomIndex = Math.floor(Math.random() * documents.length);
    return documents[randomIndex];
  }

  /**
   * Get sample of documents
   */
  getSample(size: number): GoldenDocument[] {
    const documents = this.getAllDocuments();
    const shuffled = [...documents].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(size, documents.length));
  }

  /**
   * Validate document structure
   */
  validateDocument(document: GoldenDocument): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!document.id) errors.push('Missing id');
    if (!document.name) errors.push('Missing name');
    if (!document.source) errors.push('Missing source');
    if (!document.category) errors.push('Missing category');
    if (!document.difficulty) errors.push('Missing difficulty');
    if (!document.language) errors.push('Missing language');
    if (!Array.isArray(document.groundTruth)) errors.push('Invalid ground truth format');
    if (document.totalQuestions !== document.groundTruth.length) {
      errors.push('totalQuestions does not match ground truth length');
    }

    // Validate ground truth questions
    for (const question of document.groundTruth) {
      if (!question.id) errors.push(`Question missing id`);
      if (!question.statement) errors.push(`Question missing statement`);
      if (!question.type) errors.push(`Question missing type`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate entire corpus
   */
  validateCorpus(): { valid: boolean; errors: Array<{ documentId: string; errors: string[] }> } {
    const allErrors: Array<{ documentId: string; errors: string[] }> = [];

    for (const [id, document] of this.corpus.entries()) {
      const validation = this.validateDocument(document);
      if (!validation.valid) {
        allErrors.push({
          documentId: id,
          errors: validation.errors,
        });
      }
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
    };
  }

  /**
   * Get corpus path
   */
  getCorpusPath(): string {
    return this.corpusPath;
  }

  /**
   * Set corpus path
   */
  setCorpusPath(path: string): void {
    this.corpusPath = path;
    console.log(`[GoldenCorpusManager] Corpus path set to: ${path}`);
  }
}
