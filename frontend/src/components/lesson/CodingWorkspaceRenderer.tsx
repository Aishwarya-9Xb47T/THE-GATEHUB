/**
 * Coding Workspace Renderer
 * Dedicated renderer for CodingWorkspaceBlock - NOT a markdown renderer.
 * Mounts the Coding Lab application directly as a first-class interactive component.
 * 
 * This renderer consumes a CodingWorkspaceBlock structured object and launches
 * a full interactive coding environment with professional IDE features.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { CodingWorkspaceBlock } from '../../types/codingWorkspace';
import { apiUrl } from "@/lib/api";

interface CodingWorkspaceRendererProps {
  workspace: CodingWorkspaceBlock;
  lessonId: string;
  userId?: string;
  onProgress?: (progress: number) => void;
  onComplete?: (result: { passed: boolean; score: number; timeSpent: number }) => void;
}

interface CompilerError {
  line: number;
  column: number;
  message: string;
  type: 'syntax' | 'runtime' | 'compilation';
}

export const CodingWorkspaceRenderer: React.FC<CodingWorkspaceRendererProps> = ({
  workspace,
  lessonId,
  userId,
  onProgress,
  onComplete,
}) => {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [code, setCode] = useState(() => workspace.files[0]?.content || '');
  const [output, setOutput] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<Array<{ id: string; name: string; passed: boolean; output: string }>>([]);
  const [hintsUsed, setHintsUsed] = useState<Set<string>>(new Set());
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  
  // IDE State
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fontSize, setFontSize] = useState(workspace.uiConfig?.editorConfig?.fontSize || 14);
  const [theme, setTheme] = useState<'light' | 'dark' | 'high-contrast'>(workspace.uiConfig?.theme || 'dark');
  const [showLineNumbers, setShowLineNumbers] = useState(workspace.uiConfig?.editorConfig?.showLineNumbers ?? true);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [history, setHistory] = useState<string[]>([code]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  // Error display
  const [compilerErrors, setCompilerErrors] = useState<CompilerError[]>([]);
  const [selectedError, setSelectedError] = useState<CompilerError | null>(null);

  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Update code when file changes
  useEffect(() => {
    const activeFile = workspace.files[activeFileIndex];
    if (activeFile) {
      setCode(activeFile.content);
    }
  }, [activeFileIndex, workspace.files]);

  // Autosave
  useEffect(() => {
    if (workspace.uiConfig?.enableAutosave) {
      const interval = setInterval(() => {
        // Save to local storage or backend
        console.log('Autosaving code...');
      }, 30000); // Every 30 seconds
      return () => clearInterval(interval);
    }
  }, [workspace.uiConfig?.enableAutosave]);

  // Undo/Redo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setCode(history[historyIndex - 1]);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setCode(history[historyIndex + 1]);
    }
  }, [history, historyIndex]);

  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newCode);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  // Search/Replace
  const handleSearch = useCallback(() => {
    if (!searchQuery) return;
    const index = code.toLowerCase().indexOf(searchQuery.toLowerCase());
    if (index !== -1 && editorRef.current) {
      editorRef.current.focus();
      editorRef.current.setSelectionRange(index, index + searchQuery.length);
    }
  }, [code, searchQuery]);

  const handleReplace = useCallback(() => {
    if (!searchQuery || !replaceQuery) return;
    const newCode = code.replace(new RegExp(searchQuery, 'g'), replaceQuery);
    handleCodeChange(newCode);
  }, [code, searchQuery, replaceQuery, handleCodeChange]);

  // Reset to starter code
  const handleReset = useCallback(() => {
    const activeFile = workspace.files[activeFileIndex];
    if (activeFile) {
      handleCodeChange(activeFile.content);
      setOutput('');
      setTestResults([]);
      setHintsUsed(new Set());
      setShowSolution(false);
      setCompilerErrors([]);
    }
  }, [workspace.files, activeFileIndex, handleCodeChange]);

  // Download code
  const handleDownload = useCallback(() => {
    const activeFile = workspace.files[activeFileIndex];
    if (!activeFile) return;
    
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.path;
    a.click();
    URL.revokeObjectURL(url);
  }, [code, workspace.files, activeFileIndex]);

  // Upload code
  const handleUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.py,.js,.java,.c,.cpp,.ts,.go,.rs,.sql,.html,.css';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          handleCodeChange(event.target?.result as string);
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [handleCodeChange]);

  // Execution actions
  const handleCompile = useCallback(async () => {
    setIsRunning(true);
    setOutput('');
    setCompilerErrors([]);
    
    try {
      const response = await fetch(apiUrl('/api/coding-lab/execute'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'compile',
          language: workspace.language,
          code,
          files: workspace.files,
        }),
      });
      
      const result = await response.json();
      
      if (result.errors && Array.isArray(result.errors)) {
        setCompilerErrors(result.errors.map((err: any) => ({
          line: err.line || 0,
          column: err.column || 0,
          message: err.message || 'Unknown error',
          type: err.type || 'compilation',
        })));
      }
      
      setOutput(result.stdout || result.output || '');
      setCompilerErrors(result.diagnostics || []);
    } catch (error: any) {
      setOutput(`Error: ${error instanceof Error ? error.message : 'Failed to compile code'}`);
    } finally {
      setIsRunning(false);
    }
  }, [workspace.language, code, workspace.files]);

  const handleDebug = useCallback(async () => {
    setIsRunning(true);
    setOutput('');
    setCompilerErrors([]);
    
    try {
      const response = await fetch(apiUrl('/api/coding-lab/execute'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'debug',
          language: workspace.language,
          code,
          files: workspace.files,
        }),
      });
      
      const result = await response.json();
      setOutput(result.stdout || result.output || '');
      setCompilerErrors(result.diagnostics || []);
    } catch (error: any) {
      setOutput(`Error: ${error instanceof Error ? error.message : 'Failed to start debug session'}`);
    } finally {
      setIsRunning(false);
    }
  }, [workspace.language, code, workspace.files]);

  const handleTestOnly = useCallback(async () => {
    setIsRunning(true);
    setOutput('');
    
    try {
      const response = await fetch(apiUrl('/api/coding-lab/execute'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          language: workspace.language,
          code,
          files: workspace.files,
          testCases: workspace.publicTestCases,
        }),
      });
      
      const result = await response.json();
      setTestResults(result.testResults || []);
      setOutput(result.stdout || result.output || '');
      
      if (result.testResults) {
        const passedCount = result.testResults.filter((r: any) => r.passed).length;
        onProgress?.((passedCount / result.testResults.length) * 100);
      }
    } catch (error: any) {
      setOutput(`Error: ${error instanceof Error ? error.message : 'Failed to run tests'}`);
    } finally {
      setIsRunning(false);
    }
  }, [workspace.language, code, workspace.files, workspace.publicTestCases, onProgress]);

  const handleRun = useCallback(async () => {
    setIsRunning(true);
    setOutput('');
    setCompilerErrors([]);
    
    try {
      const response = await fetch(apiUrl('/api/coding-lab/execute'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run',
          language: workspace.language,
          code,
          files: workspace.files,
          testCases: workspace.publicTestCases,
        }),
      });
      
      const result = await response.json();
      
      // Parse compiler/runtime errors
      if (result.errors && Array.isArray(result.errors)) {
        setCompilerErrors(result.errors.map((err: any) => ({
          line: err.line || 0,
          column: err.column || 0,
          message: err.message || 'Unknown error',
          type: err.type || 'runtime',
        })));
      }
      
      setOutput(result.output || result.stdout || '');
      
      // Show execution details
      if (result.executionTimeMs) {
        setOutput(prev => `${prev}\nExecution time: ${result.executionTimeMs}ms`);
      }
      if (result.memoryUsageMb) {
        setOutput(prev => `${prev}\nMemory usage: ${result.memoryUsageMb}MB`);
      }
      
      if (result.testResults) {
        setTestResults(result.testResults);
        const passedCount = result.testResults.filter((r: any) => r.passed).length;
        onProgress?.((passedCount / result.testResults.length) * 100);
      }
    } catch (error: any) {
      setOutput(`Error: ${error instanceof Error ? error.message : 'Failed to execute code'}`);
    } finally {
      setIsRunning(false);
    }
  }, [workspace.language, code, workspace.files, workspace.publicTestCases, onProgress]);

  // Submit solution
  const handleSubmit = useCallback(async () => {
    setIsRunning(true);
    
    try {
      const response = await fetch(apiUrl('/api/coding-lab/submit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: workspace.language,
          code,
          testCases: [...workspace.publicTestCases, ...(workspace.hiddenTestCases || [])],
          userId,
          learningUniverseId: workspace.id,
          publishVersionId: 'preview',
          lessonId,
          stepId: workspace.id,
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        const passedCount = result.testResults?.filter((r: any) => r.passed).length || 0;
        const totalCount = result.testResults?.length || 0;
        
        onComplete?.({
          passed: passedCount === totalCount,
          score: workspace.evaluationConfig.maxPoints ? (passedCount / totalCount) * workspace.evaluationConfig.maxPoints : 0,
          timeSpent: timeElapsed,
        });
      }
      
      setOutput(result.output || result.stdout || '');
      setTestResults(result.testResults || []);
    } catch (error: any) {
      setOutput(`Error: ${error instanceof Error ? error.message : 'Failed to submit solution'}`);
    } finally {
      setIsRunning(false);
    }
  }, [workspace, code, userId, lessonId, timeElapsed, onComplete]);

  // Use hint
  const handleUseHint = useCallback((hintId: string) => {
    if (hintsUsed.has(hintId)) return;
    if (workspace.aiAssistant.maxHints && hintsUsed.size >= workspace.aiAssistant.maxHints) return;
    
    setHintsUsed(prev => new Set([...prev, hintId]));
  }, [workspace.aiAssistant.maxHints, hintsUsed]);

  // Reveal solution (if allowed)
  const handleRevealSolution = useCallback(() => {
    if (workspace.aiAssistant.revealSolution) {
      setShowSolution(true);
    }
  }, [workspace.aiAssistant.revealSolution]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  // Adjust font size
  const increaseFontSize = useCallback(() => setFontSize((prev: number) => Math.min(prev + 2, 24)), []);
  const decreaseFontSize = useCallback(() => setFontSize((prev: number) => Math.max(prev - 2, 10)), []);

  // Cycle theme
  const cycleTheme = useCallback(() => {
    setTheme((prev: 'light' | 'dark' | 'high-contrast') => {
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'high-contrast';
      return 'light';
    });
  }, []);

  const availableHints = workspace.hints.filter((h: any) => !hintsUsed.has(h.id));
  const allTestsPassed = testResults.length > 0 && testResults.every((t: any) => t.passed);
  const activeFile = workspace.files[activeFileIndex];

  return (
    <div className={`coding-workspace ${theme} ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* Header */}
      <div className="workspace-header">
        <h2>{workspace.title}</h2>
        <div className="workspace-meta">
          <span className="language-badge">{workspace.language}</span>
          <span className="difficulty-badge">{workspace.difficulty}</span>
          <span className="challenge-type-badge">{workspace.challengeType}</span>
          <span className="time-badge">{Math.floor(timeElapsed / 60)}:{(timeElapsed % 60).toString().padStart(2, '0')}</span>
        </div>
        <div className="header-actions">
          <button onClick={toggleFullscreen} className="btn-icon" title="Toggle Fullscreen">
            {isFullscreen ? '⛶' : '⛶'}
          </button>
          <button onClick={cycleTheme} className="btn-icon" title="Toggle Theme">
            🎨
          </button>
        </div>
      </div>

      {/* Description */}
      <div className="workspace-description">
        <p>{workspace.description}</p>
        {workspace.learningObjectives && workspace.learningObjectives.length > 0 && (
          <div className="learning-objectives">
            <h4>Learning Objectives:</h4>
            <ul>
              {workspace.learningObjectives.map((obj: string, i: number) => (
                <li key={i}>{obj}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Main Workspace */}
      <div className="workspace-main">
        {/* File Sidebar (for multi-file projects) */}
        {workspace.isMultiFileProject && workspace.files.length > 1 && (
          <div className="file-sidebar">
            <h4>Files</h4>
            {workspace.files.map((file: any, index: number) => (
              <div
                key={index}
                className={`file-item ${index === activeFileIndex ? 'active' : ''}`}
                onClick={() => setActiveFileIndex(index)}
              >
                {file.isEntry && '📄 '}
                {file.path}
              </div>
            ))}
          </div>
        )}

        {/* Code Editor */}
        <div className="code-editor-section">
          <div className="editor-toolbar">
            <div className="toolbar-left">
              <button onClick={handleReset} className="btn-secondary" title="Reset Code">
                ↺ Reset
              </button>
              <button onClick={handleUndo} className="btn-secondary" title="Undo" disabled={historyIndex === 0}>
                ↶
              </button>
              <button onClick={handleRedo} className="btn-secondary" title="Redo" disabled={historyIndex === history.length - 1}>
                ↷
              </button>
              {workspace.uiConfig?.allowDownload && (
                <button onClick={handleDownload} className="btn-secondary" title="Download Code">
                  ⬇ Download
                </button>
              )}
              {workspace.uiConfig?.allowUpload && (
                <button onClick={handleUpload} className="btn-secondary" title="Upload Code">
                  ⬆ Upload
                </button>
              )}
            </div>
            <div className="toolbar-center">
              <button onClick={() => setFontSize((prev: number) => Math.max(prev - 2, 10))} className="btn-icon" title="Decrease Font Size">
                A-
              </button>
              <span className="font-size">{fontSize}px</span>
              <button onClick={() => setFontSize((prev: number) => Math.min(prev + 2, 24))} className="btn-icon" title="Increase Font Size">
                A+
              </button>
            </div>
            <div className="toolbar-right">
              <button onClick={() => setShowSearch(!showSearch)} className="btn-icon" title="Search">
                🔍
              </button>
              {workspace.aiAssistant.revealSolution && (
                <button onClick={handleRevealSolution} className="btn-secondary" title="Reveal Solution">
                  👁 Solution
                </button>
              )}
            </div>
          </div>

          {/* Search Bar */}
          {showSearch && (
            <div className="search-bar">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
              />
              <input
                type="text"
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                placeholder="Replace with..."
              />
              <button onClick={handleSearch} className="btn-secondary">Find</button>
              <button onClick={handleReplace} className="btn-secondary">Replace All</button>
              <button onClick={() => setShowSearch(false)} className="btn-secondary">✕</button>
            </div>
          )}

          {/* Line Numbers + Editor */}
          <div className="editor-container">
            {showLineNumbers && (
              <div className="line-numbers">
                {code.split('\n').map((_: string, i: number) => (
                  <div key={i} className="line-number">{i + 1}</div>
                ))}
              </div>
            )}
            {showSolution && workspace.referenceSolution ? (
              <div className="solution-view">
                <div className="solution-warning">
                  ⚠️ This is the reference solution. Try to solve it yourself first!
                </div>
                <pre className="solution-code" style={{ fontSize: `${fontSize}px` }}>
                  {typeof workspace.referenceSolution === 'string' 
                    ? workspace.referenceSolution 
                    : JSON.stringify(workspace.referenceSolution, null, 2)}
                </pre>
              </div>
            ) : (
              <textarea
                ref={editorRef}
                className="code-editor"
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                spellCheck={false}
                style={{
                  fontFamily: 'Monaco, "Courier New", monospace',
                  fontSize: `${fontSize}px`,
                  tabSize: workspace.uiConfig?.editorConfig?.tabSize || 4,
                }}
                placeholder={activeFile ? `Editing ${activeFile.path}` : 'Write your code here...'}
              />
            )}
          </div>

          {/* Compiler Errors */}
          {compilerErrors.length > 0 && (
            <div className="compiler-errors">
              <h4>Errors</h4>
              {compilerErrors.map((error, index) => (
                <div
                  key={index}
                  className={`error-item ${selectedError === error ? 'selected' : ''}`}
                  onClick={() => setSelectedError(error)}
                >
                  <span className="error-type">{error.type}</span>
                  <span className="error-location">Line {error.line}, Col {error.column}</span>
                  <span className="error-message">{error.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Output Panel */}
        <div className="output-section">
          <div className="output-toolbar">
            <div className="toolbar-actions">
              <button 
                onClick={handleCompile} 
                disabled={isRunning}
                className="btn-secondary"
                title="Compile code"
              >
                {isRunning ? 'Compiling...' : '⚙ Compile'}
              </button>
              <button 
                onClick={handleRun} 
                disabled={isRunning}
                className="btn-primary"
                title="Run code"
              >
                {isRunning ? 'Running...' : '▶ Run'}
              </button>
              <button 
                onClick={handleDebug} 
                disabled={isRunning}
                className="btn-secondary"
                title="Debug code"
              >
                {isRunning ? 'Debugging...' : '🐛 Debug'}
              </button>
              <button 
                onClick={handleTestOnly} 
                disabled={isRunning}
                className="btn-secondary"
                title="Run tests only"
              >
                {isRunning ? 'Testing...' : '🧪 Test'}
              </button>
              <button 
                onClick={handleSubmit} 
                disabled={isRunning}
                className="btn-success"
                title="Submit for grading"
              >
                {isRunning ? 'Submitting...' : '✓ Submit'}
              </button>
            </div>
            <div className="workspace-mode-badge">
              Mode: {workspace.workspaceMode}
            </div>
          </div>
          
          {/* Console Output */}
          <div className="console-output">
            <h4>Console Output</h4>
            <pre>{output || 'Run your code to see output here'}</pre>
          </div>

          {/* Test Results */}
          {testResults.length > 0 && (
            <div className="test-results">
              <h4>Test Results</h4>
              {testResults.map(test => (
                <div key={test.id} className={`test-case ${test.passed ? 'passed' : 'failed'}`}>
                  <span className="test-name">{test.name}</span>
                  <span className="test-status">{test.passed ? '✓ Passed' : '✗ Failed'}</span>
                </div>
              ))}
              {allTestsPassed && workspace.successMessage && (
                <div className="success-message">{workspace.successMessage}</div>
              )}
            </div>
          )}

          {/* AI Hints */}
          {workspace.aiAssistant.enabled && availableHints.length > 0 && (
            <div className="hints-section">
              <h4>Hints ({availableHints.length} available)</h4>
              {availableHints.map((hint: any) => (
                <div key={hint.id} className="hint-card">
                  <button 
                    onClick={() => handleUseHint(hint.id)}
                    className="btn-hint"
                  >
                    Show Hint
                  </button>
                  {hintsUsed.has(hint.id) && (
                    <div className="hint-text">
                      {hint.text}
                      {hint.cost && <span className="hint-cost">(-{hint.cost} points)</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Execution Config Info */}
      <div className="execution-info">
        <small>
          Time Limit: {workspace.executionConfig.timeLimitSeconds}s | 
          Memory Limit: {workspace.executionConfig.memoryLimitMb}MB |
          Pass Criteria: {workspace.evaluationConfig.passCriteria} |
          Max Points: {workspace.evaluationConfig.maxPoints}
        </small>
      </div>
    </div>
  );
};

export default CodingWorkspaceRenderer;
