# Document Intelligence Engine - Phase 5 Complete

## Overview

Phase 5 implements reasoning enhancement and debugging capabilities to improve transparency and debuggability of the extraction process.

**Phase 5: Reasoning & Debugging (Weeks 25-28)** - ✅ COMPLETE

---

## What Was Built in Phase 5

### 1. Reasoning Tree Enhancer (`ReasoningTreeEnhancer.ts`)
Enhances reasoning trees with more detailed decision provenance:
- **Enhanced Reasoning Trees**: Hierarchical tree structure capturing all decisions
- **Decision Nodes**: Each decision becomes a node with children for sub-decisions
- **Agent Attribution**: Each decision is attributed to the agent that made it
- **Context Capture**: Captures document context and working memory state
- **Evidence Tracking**: Detailed evidence for each decision
- **Alternatives**: Alternative decisions considered with confidence
- **Tree Statistics**: Depth, total nodes, decision path
- **Tree Caching**: Caches enhanced trees for efficient retrieval
- **Visualization**: Text-based tree visualization
- **Export**: JSON export of reasoning trees

### 2. Regex-as-Hint System (`RegexHintSystem.ts`)
Uses regex patterns as hints that are verified by AI:
- **Regex Hints**: Pre-defined regex patterns for common document elements
- **Hint Categories**: Question, option, heading, instruction, answer patterns
- **AI Verification**: Regex suggestions are not trusted - AI must verify them
- **Verification History**: Tracks verification results for learning
- **Custom Hints**: Ability to add custom regex hints
- **Hint Management**: Add, remove, import, export hints
- **Statistics**: Verification rate, average confidence
- **Simulated AI**: Placeholder for actual AI verification (production would use real AI)

### 3. Debugging Tools (`DebuggingTools.ts`)
Visualization and debugging utilities:
- **Graph Visualization**: Text-based visualization of document graph
- **Question Visualization**: Detailed view of question components
- **Reasoning Visualization**: Visualize reasoning trees
- **Timeline Visualization**: Processing timeline with phases
- **JSON Export**: Export graphs and questions as JSON
- **Extraction Comparison**: Compare two extractions to find differences
- **HTML Visualization**: Generate HTML for web-based debugging
- **Summary Statistics**: Type and difficulty distributions
- **Question Tracing**: Trace a specific question through the pipeline

### 4. Confidence Calibrator (`ConfidenceCalibrator.ts`)
Calibrates confidence scores using historical data:
- **Calibration Data**: Stores predicted vs actual accuracy pairs
- **Linear Regression**: Calculates intercept and slope for calibration
- **Type-Specific Adjustments**: Adjusts confidence based on question type
- **Difficulty-Specific Adjustments**: Adjusts confidence based on difficulty
- **Recalibration**: Updates model from historical data
- **Calibration Accuracy**: Measures how well calibrated the model is
- **Import/Export**: Save and load calibration data
- **Minimum Sample Size**: Configurable minimum samples for recalibration

### 5. Decision Logger (`DecisionLogger.ts`)
Detailed logging of all decisions made during extraction:
- **Decision Logging**: Logs every decision with full context
- **Agent Attribution**: Tracks which agent made each decision
- **Phase Tracking**: Tracks which phase each decision belongs to
- **Evidence Logging**: Captures evidence for each decision
- **Outcome Tracking**: Tracks success/failure of decisions
- **Query Methods**: Query logs by agent, phase, question, type, time range
- **Statistics**: Decision counts, average confidence, failure rate
- **Timeline**: Chronological view of all decisions
- **Question Tracing**: Trace all decisions for a specific question
- **Import/Export**: Save and load decision logs

---

## Architecture

```
Extraction Process
    ↓
[Decision Logger]
    ↓
[Regex-as-Hint System] → [AI Verification]
    ↓
[Reasoning Tree Enhancer]
    ↓
[Confidence Calibrator]
    ↓
[Debugging Tools]
    ↓
Visualization & Analysis
```

---

## Reasoning Tree Structure

```
Root Node (Decision)
├─ Agent: QuestionReasoner
├─ Confidence: 0.85
├─ Evidence:
│  ├─ option_pattern: 4 options (0.95)
│  └─ semantic_intent: "What is..." (0.80)
├─ Alternatives:
│  └─ Could be multiple_select (0.20): Similar pattern
└─ Children:
   ├─ Type Decision
   │  ├─ Agent: QuestionReasoner
   │  └─ Decision: Classified as multiple_choice
   ├─ Difficulty Decision
   │  ├─ Agent: QuestionReasoner
   │  └─ Decision: Difficulty: medium
   └─ Bloom's Level Decision
      ├─ Agent: QuestionReasoner
      └─ Decision: Bloom's level: L2
```

---

## Regex Hint Categories

### Question Patterns
- Question starting with question word (What, Which, Who, etc.)
- Numbered question ending with question mark
- Instruction to choose answer

### Option Patterns
- Option marker (A-E)
- Option marker in parentheses (A-E)
- Numbered option (1-9)

### Heading Patterns
- Section header (Chapter, Section, Part, etc.)
- All caps heading

### Instruction Patterns
- Instruction header (Instructions, Directions, Guidelines)
- Instruction text (Answer all questions, Choose correct answer)

### Answer Patterns
- Answer key format (Answer: A)
- Answer key format (Key: A)

---

## Calibration Model

The calibration model uses:
- **Linear Regression**: `calibrated = intercept + slope * predicted`
- **Type Adjustments**: Multiplier based on question type
- **Difficulty Adjustments**: Easy questions often overconfident (+5%), hard questions often underconfident (-5%)
- **Minimum Sample Size**: Default 50 samples required for recalibration

---

## Decision Log Schema

```typescript
{
  id: string;
  timestamp: Date;
  agent: string;
  phase: string;
  decisionType: string;
  decision: string;
  confidence: number;
  evidence: Array<{
    type: string;
    value: any;
    confidence: number;
  }>;
  alternatives: Array<{
    decision: string;
    confidence: number;
    reason: string;
  }>;
  context: {
    questionId?: string;
    documentPage?: number;
    nodeId?: string;
    additionalInfo?: Record<string, any>;
  };
  outcome?: {
    success: boolean;
    finalDecision?: string;
    reason?: string;
  };
}
```

---

## Usage Example

```typescript
import { ReasoningTreeEnhancer } from './reasoning/ReasoningTreeEnhancer.js';
import { RegexHintSystem } from './reasoning/RegexHintSystem.js';
import { DebuggingTools } from './reasoning/DebuggingTools.js';
import { ConfidenceCalibrator } from './reasoning/ConfidenceCalibrator.js';
import { DecisionLogger } from './reasoning/DecisionLogger.js';

// Initialize components
const reasoningEnhancer = new ReasoningTreeEnhancer();
const regexSystem = new RegexHintSystem();
const debugTools = new DebuggingTools();
const calibrator = new ConfidenceCalibrator();
const logger = new DecisionLogger();

// Enhance reasoning tree
const enhancedQuestion = reasoningEnhancer.enhanceReasoningTree(question, {
  documentPage: 1,
  surroundingNodes: ['node1', 'node2'],
  workingMemoryState: memory,
  agent: 'QuestionReasoner',
});

// Find and verify regex hints
const hints = await regexSystem.verifyAllHints(text, {
  surroundingText: context,
  documentPage: 1,
});

// Visualize question
const visualization = debugTools.visualizeQuestion(question);

// Calibrate confidence
const calibratedConfidence = calibrator.calibrate(
  question.confidence.overall,
  question.type,
  question.metadata.difficulty
);

// Log decision
logger.logQuestionClassification(
  'QuestionReasoner',
  question.id,
  'Classified as multiple_choice',
  0.85,
  question.reasoning.evidence
);

// Get statistics
const stats = logger.getStatistics();
console.log('Decision Statistics:', stats);
```

---

## File Structure

```
documentIntelligence/
├── reasoning/
│   ├── ReasoningTreeEnhancer.ts    # Reasoning tree enhancement
│   ├── RegexHintSystem.ts          # Regex-as-hint system
│   ├── DebuggingTools.ts           # Debugging utilities
│   ├── ConfidenceCalibrator.ts     # Confidence calibration
│   ├── DecisionLogger.ts           # Decision logging
│   └── Phase5_README.md            # This file
```

---

## Key Features

### Reasoning Tree Enhancer
- Hierarchical decision trees
- Agent attribution
- Context capture
- Evidence tracking
- Alternatives consideration
- Tree caching
- Text visualization
- JSON export

### Regex-as-Hint System
- Pre-defined regex hints
- AI verification (simulated)
- Verification history
- Custom hints
- Hint management
- Statistics tracking

### Debugging Tools
- Graph visualization
- Question visualization
- Reasoning visualization
- Timeline visualization
- Extraction comparison
- HTML generation
- Summary statistics
- Question tracing

### Confidence Calibrator
- Historical data tracking
- Linear regression
- Type-specific adjustments
- Difficulty-specific adjustments
- Recalibration
- Calibration accuracy
- Import/export

### Decision Logger
- Comprehensive decision logging
- Agent/phase/question tracking
- Evidence and outcome logging
- Query methods
- Statistics
- Timeline generation
- Question tracing

---

## What's Next (Phase 6: Golden Corpus)

Phase 6 will implement:
- **Golden Corpus Creation**: Build a curated set of documents with ground truth
- **Benchmarking**: Run the engine on golden corpus and measure performance
- **Error Analysis**: Analyze errors and improve the system
- **Continuous Learning**: Use golden corpus for model improvement
- **Performance Metrics**: Define and track key performance indicators
- **Regression Testing**: Ensure changes don't degrade performance

---

## Testing

To test Phase 5:

```typescript
import { ReasoningTreeEnhancer, RegexHintSystem, DebuggingTools, ConfidenceCalibrator, DecisionLogger } from './reasoning/index.js';

// Test reasoning tree enhancement
const enhancer = new ReasoningTreeEnhancer();
const enhanced = enhancer.enhanceReasoningTree(question, context);
console.log('Enhanced reasoning:', enhancer.visualizeTree(question));

// Test regex hints
const regexSystem = new RegexHintSystem();
const hints = await regexSystem.verifyAllHints(text, context);
console.log('Regex hints:', hints);

// Test debugging tools
const debugTools = new DebuggingTools();
const graphViz = debugTools.visualizeGraph(graph);
const questionViz = debugTools.visualizeQuestion(question);
console.log(graphViz);
console.log(questionViz);

// Test confidence calibration
const calibrator = new ConfidenceCalibrator();
calibrator.addCalibrationData({ timestamp: new Date(), predictedConfidence: 0.8, actualAccuracy: 0.75, questionType: 'multiple_choice', difficulty: 'medium' });
const calibrated = calibrator.calibrate(0.8, 'multiple_choice', 'medium');
console.log('Calibrated confidence:', calibrated);

// Test decision logging
const logger = new DecisionLogger();
logger.logQuestionClassification('QuestionReasoner', question.id, 'Classified as multiple_choice', 0.85, evidence);
const stats = logger.getStatistics();
console.log('Decision statistics:', stats);
```

---

## Notes

- Reasoning trees are cached in memory for efficiency
- Regex verification is currently simulated - production would use actual AI models
- Confidence calibration requires historical data to be effective
- Decision logging can be disabled if not needed
- Debugging tools provide multiple visualization formats
- All components support import/export for persistence
- Calibration model uses simple linear regression - could be enhanced with more sophisticated models
- Decision logs provide complete audit trail for debugging

---

## Status

✅ Phase 1: Foundation - COMPLETE
✅ Phase 2: Semantic Understanding - COMPLETE
✅ Phase 3: Question Extraction - COMPLETE
✅ Phase 4: Validation & Repair - COMPLETE
✅ Phase 5: Reasoning & Debugging - COMPLETE
⏳ Phase 6: Golden Corpus - NEXT
