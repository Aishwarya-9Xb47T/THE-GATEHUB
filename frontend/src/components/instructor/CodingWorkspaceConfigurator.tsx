/**
 * Coding Workspace Configurator
 * Instructor UI for configuring CodingWorkspaceBlock.
 * Supports paste, upload, and AI generation of starter code.
 * Preserves instructor code byte-for-byte - no AI modification.
 */
import React, { useState, useCallback } from 'react';

interface CodingWorkspaceConfiguratorProps {
  onSave: (workspace: any) => void;
  onCancel: () => void;
  initialWorkspace?: any;
}

export const CodingWorkspaceConfigurator: React.FC<CodingWorkspaceConfiguratorProps> = ({
  onSave,
  onCancel,
  initialWorkspace,
}) => {
  const [sourceType, setSourceType] = useState<'paste' | 'upload' | 'ai-generated'>('paste');
  const [aiPrompt, setAiPrompt] = useState('');

  // Basic Information
  const [title, setTitle] = useState(initialWorkspace?.title || '');
  const [description, setDescription] = useState(initialWorkspace?.description || '');
  const [language, setLanguage] = useState(initialWorkspace?.language || 'python');
  const [difficulty, setDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>(
    initialWorkspace?.difficulty || 'intermediate'
  );
  const [estimatedTime, setEstimatedTime] = useState(initialWorkspace?.estimatedTimeMinutes || 15);
  const [tags, setTags] = useState<string[]>(initialWorkspace?.tags || []);

  // Challenge Configuration
  const [challengeType, setChallengeType] = useState<any>(
    initialWorkspace?.challengeType || 'fill-todo'
  );
  const [starterCodeMode, setStarterCodeMode] = useState<any>(
    initialWorkspace?.starterCodeMode || 'partial-code'
  );

  // Code (Paste mode)
  const [pastedCode, setPastedCode] = useState('');
  const [referenceSolution, setReferenceSolution] = useState(initialWorkspace?.referenceSolution as string || '');

  // Multi-file project
  const [isMultiFile, setIsMultiFile] = useState(initialWorkspace?.isMultiFileProject || false);
  const [files, setFiles] = useState<Array<{ path: string; content: string; language?: string; isEntry?: boolean }>>(
    initialWorkspace?.files || []
  );

  // Test Cases
  const [publicTestCases, setPublicTestCases] = useState(
    initialWorkspace?.publicTestCases || [{ id: 'test-1', name: 'Test 1', input: '', expectedOutput: '' }]
  );
  const [hiddenTestCases, setHiddenTestCases] = useState(
    initialWorkspace?.hiddenTestCases || []
  );

  // Hints
  const [hints, setHints] = useState(
    initialWorkspace?.hints || [{ id: 'hint-1', text: '', cost: 5 }]
  );

  // Execution Config
  const [timeLimit, setTimeLimit] = useState(initialWorkspace?.executionConfig?.timeLimitSeconds || 30);
  const [memoryLimit, setMemoryLimit] = useState(initialWorkspace?.executionConfig?.memoryLimitMb || 256);
  const [compileRequired, setCompileRequired] = useState(initialWorkspace?.executionConfig?.compileRequired || false);

  // Evaluation Config
  const [passCriteria, setPassCriteria] = useState<'all-tests' | 'public-tests-only' | 'percentage'>(
    initialWorkspace?.evaluationConfig?.passCriteria || 'all-tests'
  );
  const [maxPoints, setMaxPoints] = useState(initialWorkspace?.evaluationConfig?.maxPoints || 100);

  // AI Assistant Config
  const [aiEnabled, setAiEnabled] = useState(initialWorkspace?.aiAssistant?.enabled ?? true);
  const [explainErrors, setExplainErrors] = useState(initialWorkspace?.aiAssistant?.explainErrors ?? true);
  const [revealSolution, setRevealSolution] = useState(initialWorkspace?.aiAssistant?.revealSolution ?? false);

  const handleAddPublicTestCase = useCallback(() => {
    setPublicTestCases([...publicTestCases, {
      id: `test-${publicTestCases.length + 1}`,
      name: `Test ${publicTestCases.length + 1}`,
      input: '',
      expectedOutput: ''
    }]);
  }, [publicTestCases]);

  const handleAddHiddenTestCase = useCallback(() => {
    setHiddenTestCases([...hiddenTestCases, {
      id: `hidden-${hiddenTestCases.length + 1}`,
      name: `Hidden Test ${hiddenTestCases.length + 1}`,
      input: '',
      expectedOutput: ''
    }]);
  }, [hiddenTestCases]);

  const handleAddHint = useCallback(() => {
    setHints([...hints, { id: `hint-${hints.length + 1}`, text: '', cost: 5 }]);
  }, [hints]);

  const handleAddFile = useCallback(() => {
    setFiles([...files, { path: '', content: '', language, isEntry: files.length === 0 }]);
  }, [files, language]);

  const handleSave = useCallback(() => {
    const workspace: any = {
      type: 'coding-workspace',
      id: initialWorkspace?.id || `workspace-${Date.now()}`,
      title,
      description,
      language,
      challengeType,
      difficulty,
      estimatedTimeMinutes: estimatedTime,
      tags,
      starterCodeMode,
      isMultiFileProject: isMultiFile,
      files: isMultiFile ? files : [{
        path: `main.${getFileExtension(language)}`,
        content: pastedCode,
        language,
        isEntry: true
      }],
      referenceSolution: isMultiFile ? undefined : referenceSolution,
      publicTestCases,
      hiddenTestCases,
      hints,
      expectedOutput: '',
      successMessage: 'Great job! All tests passed.',
      learningObjectives: [],
      prerequisites: [],
      executionConfig: {
        timeLimitSeconds: timeLimit,
        memoryLimitMb: memoryLimit,
        allowFileAccess: false,
        allowNetworkAccess: false,
        compileRequired,
      },
      evaluationConfig: {
        passCriteria,
        maxPoints,
        scoring: 'binary',
        showHiddenTestResults: false,
      },
      aiAssistant: {
        enabled: aiEnabled,
        explainErrors,
        revealSolution,
        maxHints: 3,
        hintCooldown: 30,
        generateHints: true,
        generateExplanations: true,
      },
      ideConfig: {
        theme: 'dark',
        fontSize: 14,
        tabSize: 4,
        showLineNumbers: true,
        enableAutocomplete: true,
        enableBracketMatching: true,
        enableAutoIndentation: true,
        allowDownload: true,
        allowUpload: true,
        enableFullscreen: true,
        enableAutosave: true,
      },
      sourceConfig: {
        type: sourceType,
        originalSource: sourceType === 'paste' ? pastedCode : undefined,
        aiPrompt: sourceType === 'ai-generated' ? aiPrompt : undefined,
        preserveOriginal: true,
      },
    };

    onSave(workspace);
  }, [
    initialWorkspace, title, description, language, challengeType, difficulty, estimatedTime, tags,
    starterCodeMode, isMultiFile, files, pastedCode, referenceSolution, publicTestCases,
    hiddenTestCases, hints, timeLimit, memoryLimit, compileRequired, passCriteria, maxPoints,
    aiEnabled, explainErrors, revealSolution, sourceType, aiPrompt, onSave
  ]);

  const handleGenerateWithAI = useCallback(async () => {
    // Call backend API to generate workspace from AI prompt
    // This would use the codingWorkspaceAgent
    console.log('Generating workspace with AI:', aiPrompt);
  }, [aiPrompt]);

  return (
    <div className="coding-workspace-configurator">
      <h2>Coding Workspace Configuration</h2>

      {/* Source Type Selection */}
      <div className="config-section">
        <h3>Source Type</h3>
        <div className="source-type-selector">
          <label>
            <input
              type="radio"
              value="paste"
              checked={sourceType === 'paste'}
              onChange={(e) => setSourceType(e.target.value as any)}
            />
            Paste Code
          </label>
          <label>
            <input
              type="radio"
              value="upload"
              checked={sourceType === 'upload'}
              onChange={(e) => setSourceType(e.target.value as any)}
            />
            Upload Files
          </label>
          <label>
            <input
              type="radio"
              value="ai-generated"
              checked={sourceType === 'ai-generated'}
              onChange={(e) => setSourceType(e.target.value as any)}
            />
            AI Generate
          </label>
        </div>
      </div>

      {/* AI Generation */}
      {sourceType === 'ai-generated' && (
        <div className="config-section">
          <h3>AI Generation</h3>
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Describe the coding challenge you want AI to generate..."
            rows={4}
          />
          <button onClick={handleGenerateWithAI} className="btn-primary">
            Generate with AI
          </button>
        </div>
      )}

      {/* Basic Information */}
      <div className="config-section">
        <h3>Basic Information</h3>
        <div className="form-group">
          <label>Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Coding Challenge Title"
          />
        </div>
        <div className="form-group">
          <label>Description *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what students need to do"
            rows={3}
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Language *</label>
            <input
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="python, java, javascript, etc."
            />
            <small>Any language supported - no restrictions</small>
          </div>
          <div className="form-group">
            <label>Difficulty *</label>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as any)}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
          <div className="form-group">
            <label>Estimated Time (minutes) *</label>
            <input
              type="number"
              value={estimatedTime}
              onChange={(e) => setEstimatedTime(Number(e.target.value))}
              min={1}
            />
          </div>
        </div>
      </div>

      {/* Challenge Configuration */}
      <div className="config-section">
        <h3>Challenge Configuration</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Challenge Type *</label>
            <select value={challengeType} onChange={(e) => setChallengeType(e.target.value as any)}>
              <option value="complete-missing">Complete Missing Code</option>
              <option value="fix-buggy">Fix Buggy Code</option>
              <option value="implement-algorithm">Implement Algorithm</option>
              <option value="fill-todo">Fill TODO Sections</option>
              <option value="write-solution">Write from Scratch</option>
              <option value="debugging">Debugging</option>
              <option value="output-prediction">Output Prediction</option>
              <option value="optimise-code">Optimise Code</option>
              <option value="sql-query">SQL Query</option>
              <option value="html-css">HTML/CSS</option>
              <option value="api-challenge">API Challenge</option>
              <option value="code-input">Code Input</option>
            </select>
          </div>
          <div className="form-group">
            <label>Starter Code Mode *</label>
            <select value={starterCodeMode} onChange={(e) => setStarterCodeMode(e.target.value as any)}>
              <option value="full-program">Full Program</option>
              <option value="partial-code">Partial Code</option>
              <option value="buggy-code">Buggy Code</option>
              <option value="skeleton-project">Skeleton Project</option>
              <option value="from-scratch">From Scratch</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={isMultiFile}
              onChange={(e) => setIsMultiFile(e.target.checked)}
            />
            Multi-file Project
          </label>
        </div>
      </div>

      {/* Code Input */}
      {sourceType === 'paste' && !isMultiFile && (
        <div className="config-section">
          <h3>Starter Code</h3>
          <textarea
            value={pastedCode}
            onChange={(e) => setPastedCode(e.target.value)}
            placeholder={`Paste your ${language} code here...`}
            rows={15}
            style={{ fontFamily: 'Monaco, "Courier New", monospace' }}
          />
          <small>Code will be preserved exactly as entered - no modification</small>
        </div>
      )}

      {/* Multi-file Project */}
      {isMultiFile && (
        <div className="config-section">
          <h3>Project Files</h3>
          {files.map((file, index) => (
            <div key={index} className="file-input">
              <input
                type="text"
                value={file.path}
                onChange={(e) => {
                  const newFiles = [...files];
                  newFiles[index].path = e.target.value;
                  setFiles(newFiles);
                }}
                placeholder="File path (e.g., src/main.py)"
              />
              <textarea
                value={file.content}
                onChange={(e) => {
                  const newFiles = [...files];
                  newFiles[index].content = e.target.value;
                  setFiles(newFiles);
                }}
                placeholder="File content"
                rows={5}
                style={{ fontFamily: 'Monaco, "Courier New", monospace' }}
              />
              <label>
                <input
                  type="checkbox"
                  checked={file.isEntry}
                  onChange={(e) => {
                    const newFiles = [...files];
                    newFiles[index].isEntry = e.target.checked;
                    setFiles(newFiles);
                  }}
                />
                Entry Point
              </label>
            </div>
          ))}
          <button onClick={handleAddFile} className="btn-secondary">Add File</button>
        </div>
      )}

      {/* Reference Solution */}
      {!isMultiFile && (
        <div className="config-section">
          <h3>Reference Solution (Hidden from Students)</h3>
          <textarea
            value={referenceSolution}
            onChange={(e) => setReferenceSolution(e.target.value)}
            placeholder="Paste the correct solution (hidden from students, used for grading)"
            rows={10}
            style={{ fontFamily: 'Monaco, "Courier New", monospace' }}
          />
        </div>
      )}

      {/* Test Cases */}
      <div className="config-section">
        <h3>Public Test Cases</h3>
        {publicTestCases.map((test: any, index: number) => (
          <div key={test.id} className="test-case">
            <input
              type="text"
              value={test.name}
              onChange={(e) => {
                const newTests = [...publicTestCases];
                newTests[index].name = e.target.value;
                setPublicTestCases(newTests);
              }}
              placeholder="Test name"
            />
            <textarea
              value={test.input}
              onChange={(e) => {
                const newTests = [...publicTestCases];
                newTests[index].input = e.target.value;
                setPublicTestCases(newTests);
              }}
              placeholder="Input"
              rows={2}
            />
            <textarea
              value={test.expectedOutput}
              onChange={(e) => {
                const newTests = [...publicTestCases];
                newTests[index].expectedOutput = e.target.value;
                setPublicTestCases(newTests);
              }}
              placeholder="Expected output"
              rows={2}
            />
          </div>
        ))}
        <button onClick={handleAddPublicTestCase} className="btn-secondary">Add Test Case</button>
      </div>

      <div className="config-section">
        <h3>Hidden Test Cases</h3>
        {hiddenTestCases.map((test: any, index: number) => (
          <div key={test.id} className="test-case">
            <input
              type="text"
              value={test.name}
              onChange={(e) => {
                const newTests = [...hiddenTestCases];
                newTests[index].name = e.target.value;
                setHiddenTestCases(newTests);
              }}
              placeholder="Test name"
            />
            <textarea
              value={test.input}
              onChange={(e) => {
                const newTests = [...hiddenTestCases];
                newTests[index].input = e.target.value;
                setHiddenTestCases(newTests);
              }}
              placeholder="Input"
              rows={2}
            />
            <textarea
              value={test.expectedOutput}
              onChange={(e) => {
                const newTests = [...hiddenTestCases];
                newTests[index].expectedOutput = e.target.value;
                setHiddenTestCases(newTests);
              }}
              placeholder="Expected output"
              rows={2}
            />
          </div>
        ))}
        <button onClick={handleAddHiddenTestCase} className="btn-secondary">Add Hidden Test Case</button>
      </div>

      {/* Hints */}
      <div className="config-section">
        <h3>Hints</h3>
        {hints.map((hint: any, index: number) => (
          <div key={hint.id} className="hint">
            <textarea
              value={hint.text}
              onChange={(e) => {
                const newHints = [...hints];
                newHints[index].text = e.target.value;
                setHints(newHints);
              }}
              placeholder="Hint text"
              rows={2}
            />
            <input
              type="number"
              value={hint.cost}
              onChange={(e) => {
                const newHints = [...hints];
                newHints[index].cost = Number(e.target.value);
                setHints(newHints);
              }}
              placeholder="Point cost"
              min={0}
            />
          </div>
        ))}
        <button onClick={handleAddHint} className="btn-secondary">Add Hint</button>
      </div>

      {/* Execution Configuration */}
      <div className="config-section">
        <h3>Execution Configuration</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Time Limit (seconds)</label>
            <input
              type="number"
              value={timeLimit}
              onChange={(e) => setTimeLimit(Number(e.target.value))}
              min={1}
            />
          </div>
          <div className="form-group">
            <label>Memory Limit (MB)</label>
            <input
              type="number"
              value={memoryLimit}
              onChange={(e) => setMemoryLimit(Number(e.target.value))}
              min={1}
            />
          </div>
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={compileRequired}
                onChange={(e) => setCompileRequired(e.target.checked)}
              />
              Compile Required
            </label>
          </div>
        </div>
      </div>

      {/* Evaluation Configuration */}
      <div className="config-section">
        <h3>Evaluation Configuration</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Pass Criteria</label>
            <select value={passCriteria} onChange={(e) => setPassCriteria(e.target.value as any)}>
              <option value="all-tests">All Tests</option>
              <option value="public-tests-only">Public Tests Only</option>
              <option value="percentage">Percentage</option>
            </select>
          </div>
          <div className="form-group">
            <label>Max Points</label>
            <input
              type="number"
              value={maxPoints}
              onChange={(e) => setMaxPoints(Number(e.target.value))}
              min={1}
            />
          </div>
        </div>
      </div>

      {/* AI Assistant Configuration */}
      <div className="config-section">
        <h3>AI Assistant Configuration</h3>
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(e) => setAiEnabled(e.target.checked)}
            />
            Enable AI Assistant
          </label>
        </div>
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={explainErrors}
              onChange={(e) => setExplainErrors(e.target.checked)}
            />
            Explain Errors
          </label>
        </div>
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={revealSolution}
              onChange={(e) => setRevealSolution(e.target.checked)}
            />
            Allow Reveal Solution
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="config-actions">
        <button onClick={handleSave} className="btn-primary">Save Workspace</button>
        <button onClick={onCancel} className="btn-secondary">Cancel</button>
      </div>
    </div>
  );
};

function getFileExtension(language: string): string {
  const extMap: Record<string, string> = {
    python: 'py',
    javascript: 'js',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    typescript: 'ts',
    go: 'go',
    rust: 'rs',
    sql: 'sql',
    html: 'html',
    css: 'css',
  };
  return extMap[language] || 'txt';
}

export default CodingWorkspaceConfigurator;
