import React, { useEffect, useState } from 'react';

interface RichCodeViewerProps {
  code: string;
  language?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  height?: string;
  theme?: 'vs-dark' | 'light';
}

export const RichCodeViewer: React.FC<RichCodeViewerProps> = ({
  code,
  language = 'javascript',
  readOnly = true,
  onChange,
  height = '220px',
  theme = 'vs-dark',
}) => {
  const [val, setVal] = useState(code);

  useEffect(() => {
    setVal(code);
  }, [code]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setVal(newVal);
    if (onChange) onChange(newVal);
  };

  return (
    <div
      className="rich-code-viewer-container"
      style={{
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.15)',
        backgroundColor: theme === 'vs-dark' ? '#1e1e1e' : '#f5f5f5',
        color: theme === 'vs-dark' ? '#d4d4d4' : '#333333',
        fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
        fontSize: '14px',
        margin: '12px 0',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 14px',
          backgroundColor: theme === 'vs-dark' ? '#2d2d2d' : '#e0e0e0',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          fontSize: '12px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        <span>{language}</span>
        <span style={{ opacity: 0.7 }}>{readOnly ? 'Read Only' : 'Interactive Editor'}</span>
      </div>

      {/* Code Area */}
      {readOnly ? (
        <pre
          style={{
            margin: 0,
            padding: '14px',
            whiteSpace: 'pre',
            wordWrap: 'normal',
            overflowX: 'auto',
            minHeight: '60px',
            maxHeight: height,
            lineHeight: 1.5,
          }}
        >
          <code>{val}</code>
        </pre>
      ) : (
        <textarea
          value={val}
          onChange={handleChange}
          style={{
            width: '100%',
            height,
            padding: '14px',
            backgroundColor: 'transparent',
            color: 'inherit',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            lineHeight: 1.5,
            border: 'none',
            outline: 'none',
            resize: 'vertical',
            whiteSpace: 'pre',
          }}
          placeholder={`// Write your ${language} code here...`}
        />
      )}
    </div>
  );
};
