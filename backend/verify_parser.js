
const { marked } = require('marked');

function cleanLatexBoilerplate(text) {
  if (!text) return "";
  
  let cleaned = text
    .replace(/^[\s\S]*?\\begin\s*\{document\}/i, '')
    .replace(/\\end\s*\{document\}[\s\S]*$/i, '')
    .replace(/\\documentclass(?:\[[\s\S]*?\])?\{[\s\S]*?\}/gi, '')
    .replace(/\\usepackage(?:\[[\s\S]*?\])?\{[\s\S]*?\}/gi, '')
    .replace(/\\definecolor\{[\s\S]*?\}\{[\s\S]*?\}\{[\s\S]*?\}/gi, '')
    .replace(/\\title\{[\s\S]*?\}/gi, '')
    .replace(/\\author\{[\s\S]*?\}/gi, '')
    .replace(/\\date\{[\s\S]*?\}/gi, '')
    .replace(/\\geometry\{[\s\S]*?\}/gi, '')
    .replace(/\\hypersetup\{[\s\S]*?\}/gi, '')
    .replace(/\\maketitle/gi, '')
    .replace(/\\tableofcontents/gi, '')
    .replace(/\\newpage/gi, '')
    .replace(/\\clearpage/gi, '')
    .replace(/\\thispagestyle\{[\s\S]*?\}/gi, '')
    .replace(/\\pagestyle\{[\s\S]*?\}/gi, '')
    .replace(/\\begin\s*\{(?:tikzpicture|pgfpicture|tikz|wrapfigure|tabular|longtable|tabu|frame).*?\}[\s\S]*?\\end\s*\{(?:tikzpicture|pgfpicture|tikz|wrapfigure|tabular|longtable|tabu|frame)\}/gi, '')
    .replace(/\\(?:Large|large|huge|Huge|small|footnotesize|tiny|centering|raggedright|raggedleft|selectfont|vfill|hfill|noindent|indent|hspace\{.*?\}|vspace\{.*?\}|\\|\[.*?\])(?![a-zA-Z])/gi, '')
    .replace(/(?<!\\)%.*$/gm, '')
    .replace(/\\(?:label|ref|cite|index|glossary)\{.*?\}/gi, '')
    .replace(/\\begin\{(?!lstlisting|verbatim|tcolorbox|tryit|pythoncode|javascriptcode|nodecode).*?\}(?:\[.*?\])?/gi, '')
    .replace(/\\end\{(?!lstlisting|verbatim|tcolorbox|tryit|pythoncode|javascriptcode|nodecode).*?\}/gi, '')
    .replace(/\\begin\{(?:itemize|enumerate|description)\}/gi, '\n')
    .replace(/\\end\{(?:itemize|enumerate|description)\}/gi, '\n')
    .replace(/\\item\s+/gi, '* ')
    .replace(/\\item/gi, '* ')
    .trim();

  return cleaned;
}

function compileInlineContent(text) {
  try {
    if (!text) return "";
    let cleanText = text;

    // Formatting
    cleanText = cleanText
      .replace(/\\(?:textbf|mathbf)\{([^}]*)\}/gi, '**$1**')
      .replace(/\\(?:textit|mathit|emph)\{([^}]*)\}/gi, '*$1*')
      .replace(/\\texttt\{([^}]*)\}/gi, '`$1`')
      .replace(/\\underline\{([^}]*)\}/gi, '<u>$1</u>');

    // Markdown
    let html = marked.parse(cleanText);
    return html;
  } catch (e) {
    return text;
  }
}

function parseContentToBlocks(text) {
  const blocks = [];
  let remainingText = text;

  const resolveAsset = (filename) => `/uploads/resources/${encodeURIComponent(filename)}`;

  const regexes = [
    { type: 'subsection', regex: /\\subsection\{([^}]+)\}/gi },
    { type: 'subsubsection', regex: /\\subsubsection\{([^}]+)\}/gi },
    { type: 'image', regex: /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/gi },
    { type: 'video', regex: /\\href\{([^}]+\.mp4)\}\{([^}]+)\}/gi },
    { type: 'editor', regex: /\\begin\{lstlisting\}(?:\[(.*?)\])?\s*([\s\S]*?)\\end\{lstlisting\}/gi },
    { type: 'output', regex: /\\begin\{verbatim\}([\s\S]*?)\\end\{verbatim\}/gi },
    { type: 'example', regex: /\\begin\{tcolorbox\}(?:\[(.*?)\])?\s*([\s\S]*?)\\end\{tcolorbox\}/gi }
  ];

  while (remainingText.length > 0) {
    let earliestMatch = null;
    let earliestIndex = Infinity;

    for (const r of regexes) {
      r.regex.lastIndex = 0;
      const match = r.regex.exec(remainingText);
      if (match && match.index < earliestIndex) {
        earliestIndex = match.index;
        earliestMatch = { ...r, match };
      }
    }

    if (earliestMatch) {
      if (earliestIndex > 0) {
        const textBefore = remainingText.substring(0, earliestIndex).trim();
        if (textBefore) {
          const cleanedText = cleanLatexBoilerplate(textBefore);
          if (cleanedText) {
            blocks.push({ type: 'text', content: compileInlineContent(cleanedText) });
          }
        }
      }

      const m = earliestMatch.match;
      const fullMatch = m[0];

      if (earliestMatch.type === 'subsection') {
        blocks.push({ type: 'subsection', title: m[1].trim(), id: m[1].trim().toLowerCase().replace(/[^a-z0-9]/g, '-') });
      } else if (earliestMatch.type === 'subsubsection') {
        blocks.push({ type: 'subsubsection', title: m[1].trim(), id: m[1].trim().toLowerCase().replace(/[^a-z0-9]/g, '-') });
      } else if (earliestMatch.type === 'image') {
        blocks.push({ type: 'image', src: resolveAsset(m[1].trim()), alt: m[1].trim() });
      } else if (earliestMatch.type === 'video') {
        blocks.push({ type: 'video', src: resolveAsset(m[1].trim()) });
      } else if (earliestMatch.type === 'editor') {
        let lang = 'javascript';
        const options = m[1] || '';
        if (options.includes('python')) lang = 'python';
        else if (options.includes('javascript') || options.includes('js')) lang = 'javascript';
        blocks.push({ type: 'editor', language: lang, code: m[2].trim(), expectedOutput: "" });
      } else if (earliestMatch.type === 'output') {
        if (blocks.length > 0 && blocks[blocks.length - 1].type === 'editor') {
          blocks[blocks.length - 1].expectedOutput = m[1].trim();
        } else {
          blocks.push({ type: 'output', content: m[1].trim() });
        }
      } else if (earliestMatch.type === 'example') {
        blocks.push({ 
          type: 'example', 
          title: (m[1] || 'Example').replace(/title=\{?([^\]\}]*)\}?/, '$1').trim(), 
          content: compileInlineContent(cleanLatexBoilerplate(m[2].trim()))
        });
      }

      remainingText = remainingText.substring(earliestIndex + fullMatch.length);
    } else {
      const finalContent = cleanLatexBoilerplate(remainingText.trim());
      if (finalContent) {
        blocks.push({ type: 'text', content: compileInlineContent(finalContent) });
      }
      remainingText = '';
    }
  }

  return blocks;
}

function generateStructuredContent(text) {
  const segments = text.split(/(?=\\section\{|^#\s+)/m);
  const sections = [];

  segments.forEach((segment) => {
    if (!segment.trim()) return;
    const sectionMatch = segment.match(/\\section\{([^}]+)\}/) || segment.match(/^#\s+(.+)/m);
    const title = (sectionMatch?.[1] || "Introduction").trim();
    let content = segment.replace(/\\section\{[^}]+\}/g, '').replace(/^#\s+.+/m, '').trim();
    const blocks = parseContentToBlocks(content);
    if (blocks.length > 0 || title !== "Introduction") {
      sections.push({ title, blocks });
    }
  });

  if (sections.length === 0) {
    sections.push({ title: "Introduction", blocks: parseContentToBlocks(text) });
  }

  return { sections };
}

const sampleLatex = `
\\section{Introduction To Deep Learning} 
 
 \\subsection{Overview} 
 
 Deep Learning allows computers to learn automatically. 
 
 \\subsubsection{Advantages} 
 
 \\begin{itemize} 
 \\item High Accuracy 
 \\item Automation 
 \\item Real Time Predictions 
 \\end{itemize} 
 
 % ===================================== 
 % IMAGE TEST 
 % ===================================== 
 
 \\subsection{Deep Learning Image Example} 
 
 Below image should render INSIDE website and INSIDE PDF. 
 
 \\includegraphics[width=0.9\\linewidth]{deep-learning-image.jpg} 
 
 % ===================================== 
 % VIDEO TEST 
 % ===================================== 
 
 \\subsection{Deep Learning Video Example} 
 
 Below video should PLAY inside website. 
 
 \\href{Media Player 2025-12-14 00-07-09.mp4}{Click Here To Open Video} 
 
 % ===================================== 
 % PYTHON TEST 
 % ===================================== 
 
 \\subsection{Python Try It Yourself} 
 
 Below should render Monaco editor. 
 
 \\begin{lstlisting}[language=Python] 
 print("Hello Python") 
 print("Everything Working") 
 \\end{lstlisting} 
 
 Expected Output: 
 
 \\begin{verbatim} 
 Hello Python 
 Everything Working 
 \\end{verbatim} 
 
 % ===================================== 
 % JAVASCRIPT TEST 
 % ===================================== 
 
 \\subsection{JavaScript Try It Yourself} 
 
 \\begin{lstlisting}[language=JavaScript] 
 console.log("Hello JavaScript") 
 console.log("JS Runtime Working") 
 \\end{lstlisting} 
 
 Expected Output: 
 
 \\begin{verbatim} 
 Hello JavaScript 
 JS Runtime Working 
 \\end{verbatim} 
 
 % ===================================== 
 % NODE TEST 
 % ===================================== 
 
 \\subsection{Node.js Try It Yourself} 
 
 \\begin{lstlisting}[language=JavaScript] 
 console.log("Node Runtime Working") 
 console.log(process.version) 
 \\end{lstlisting} 
 
 Expected Output: 
 
 \\begin{verbatim} 
 Node Runtime Working 
 v22.x.x 
 \\end{verbatim}
`;

const result = generateStructuredContent(sampleLatex);
console.log(JSON.stringify(result, null, 2));
