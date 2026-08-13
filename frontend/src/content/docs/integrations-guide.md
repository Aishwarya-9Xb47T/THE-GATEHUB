# Integrations Guide

## Overview

THE GATEHUB connects with external tools so students and instructors can code, research, and collaborate without leaving the platform.

## Google Colab (Coding Labs)

### What it is

Coding Labs can launch **Google Colab** notebooks for hands-on Python exercises. Students run code in Colab and submit work back to THE GATEHUB.

### Student: Open Colab from a lesson

1. Enroll in the Learning Universe and open the lesson.
2. Navigate to the **Coding Lab** step.
3. Click **Open in Google Colab** (or **Connect Colab**).
4. Sign in with Google if prompted and authorize THE GATEHUB.
5. Complete the notebook and use **Submit** in the lesson when finished.

### Instructor: Add Colab to a lesson

1. Open **Visual Authoring Studio** or **Academic Studio**.
2. Add a **Coding Lab** component to the lesson.
3. Paste a valid Colab notebook URL or create a new notebook.
4. Publish the Learning Universe so students see the lab.

### Troubleshooting Colab

- **Colab won't open**: Check the notebook URL is public or shared correctly.
- **Authorization failed**: Reconnect Google from **Settings → Integrations**.
- **Submit not working**: Return to the lesson tab and click Submit after saving in Colab.

## Overleaf (Research Workspace)

### What it is

The **Research Workspace** lets students and instructors write LaTeX papers with **Overleaf** integration.

### Open Overleaf from a lesson

1. Open a lesson with a **Research Paper** or **Research Workspace** step.
2. Click **Open in Overleaf** or **Launch Overleaf**.
3. Edit your `.tex` project; changes sync back to THE GATEHUB workspace.
4. Compile PDF inside Overleaf or THE GATEHUB preview.

### Academic Studio LaTeX

Instructors authoring in **Academic Authoring Studio** use LaTeX DSL commands. Compile from the studio toolbar. Errors appear in the compile log panel.

## Google Drive

Connected Google accounts can import/export project files. Manage connections under **Settings → Integrations**.

## Permissions

| Role | Colab | Overleaf | Drive |
|------|-------|----------|-------|
| Student | Use in enrolled lessons | Use in research steps | Optional import |
| Instructor | Author labs | Author research steps | Import templates |
| Admin | Configure platform OAuth | Configure platform OAuth | Platform settings |

## Related

- Student Manual → Projects and Coding Labs
- Instructor Manual → Learning Universe authoring
- Troubleshooting → Code blocks and integrations
