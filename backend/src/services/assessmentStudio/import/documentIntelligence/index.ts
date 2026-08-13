/**
 * Document Intelligence Engine - Main Entry Point
 * Exports all public APIs for the Document Intelligence Engine
 */

// Core types
export * from './types.js';

// Core graph structure
export { DocumentGraph } from './DocumentGraph.js';

// Vision understanding
export { VisionUnderstanding } from './VisionUnderstanding.js';

// Graph construction
export { DocumentGraphConstructor } from './DocumentGraphConstructor.js';

// Main orchestrator
export { DocumentIntelligenceEngine } from './DocumentIntelligenceEngine.js';

// Working memory
export { WorkingMemorySystem } from './WorkingMemory.js';

// Agents
export { BaseAgent } from './agents/BaseAgent.js';
export { AgentOrchestrator } from './agents/AgentOrchestrator.js';
export { LayoutExpertAgent } from './agents/LayoutExpertAgent.js';
export { SemanticReaderAgent } from './agents/SemanticReaderAgent.js';
export { AgentMemoryIntegration } from './agents/AgentMemoryIntegration.js';
export { ContextAwareClassifier } from './agents/ContextAwareClassifier.js';
export { QuestionBuilderAgent } from './agents/QuestionBuilderAgent.js';
export { QuestionReasonerAgent } from './agents/QuestionReasonerAgent.js';
export { QuestionGraphConstructor } from './agents/QuestionGraphConstructor.js';
export { QuestionObjectAssembler } from './agents/QuestionObjectAssembler.js';
export { ContextReconstructor } from './agents/ContextReconstructor.js';
export { ValidatorAgent } from './agents/ValidatorAgent.js';
export { RepairAgent } from './agents/RepairAgent.js';
export { ReviewerAgent } from './agents/ReviewerAgent.js';

// Reasoning & Debugging
export { ReasoningTreeEnhancer } from './reasoning/ReasoningTreeEnhancer.js';
export { RegexHintSystem, type RegexHint, type RegexHintResult } from './reasoning/RegexHintSystem.js';
export { DebuggingTools, type DebugVisualization } from './reasoning/DebuggingTools.js';
export { ConfidenceCalibrator, type CalibrationData, type CalibrationModel } from './reasoning/ConfidenceCalibrator.js';
export { DecisionLogger, type DecisionLogEntry } from './reasoning/DecisionLogger.js';

// Golden Corpus & Benchmarking
export { GoldenCorpusManager, type GoldenDocument, type CorpusStatistics } from './golden/GoldenCorpusManager.js';
export { BenchmarkRunner, type BenchmarkResult, type BenchmarkSummary } from './golden/BenchmarkRunner.js';
export { ErrorAnalyzer, type ErrorAnalysis, type ErrorSummary } from './golden/ErrorAnalyzer.js';
export { PerformanceMetrics, type PerformanceMetric, type MetricsReport } from './golden/PerformanceMetrics.js';
export { RegressionTester, type RegressionTestResult, type BaselineData } from './golden/RegressionTester.js';
