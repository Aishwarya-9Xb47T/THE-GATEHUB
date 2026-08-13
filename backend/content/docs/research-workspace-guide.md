# Research Workspace Guide

## Overview

The **Research Workspace** is for writing academic papers in LaTeX with optional **Overleaf** integration.

## Open the workspace

1. Enroll in a Learning Universe with a **Research Paper** step.
2. Navigate to that step in the lesson player.
3. The workspace opens with a LaTeX editor and PDF preview.

## Write and compile

1. Edit `main.tex` or section files in the editor.
2. Click **Compile** to generate PDF.
3. Fix errors using the compile log (missing packages, undefined references).
4. Save frequently; versions may be stored in your project.

## Overleaf integration

1. Click **Open in Overleaf** from the workspace toolbar.
2. Authorize Overleaf if prompted.
3. Edit in Overleaf; sync returns to THE GATEHUB project.
4. Submit the final PDF from the lesson **Submit** button if required.

## References and citations

Use `\cite{}` with a `.bib` file or `thebibliography` environment. Academic Studio lessons may include templates with preloaded bibliography styles.

## Instructor setup

1. Add a **Research Paper** component in Visual or Academic Studio.
2. Provide a template `.tex` starter.
3. Set submission requirements (PDF upload, word count, due date).
4. Grade submissions under **Project Reviews**.

## Troubleshooting

- **Compile failed**: Read the log line number; common fixes are missing `\begin{document}`, unescaped `%`, or missing packages.
- **Overleaf won't connect**: Re-link from **Settings → Integrations**.
- **PDF blank**: Run compile twice for table of contents and references.

## Related

- Integrations Guide → Overleaf
- Instructor Manual → Academic Authoring Studio
