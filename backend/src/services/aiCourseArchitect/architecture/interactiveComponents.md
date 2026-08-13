# Interactive Components Architecture

## Overview

The AI Curriculum Architect generates lessons composed of typed components. Interactive components are first-class learning experiences that are fundamentally different from content blocks.

## Component Categories

### Content Components (Read-only educational material)
- Overview
- Objectives
- Theory
- Analogy
- Examples
- Cheat Sheet
- Summary
- References
- Further Reading

### Assessment Components (Testing and evaluation)
- Quiz
- Assignment
- Checkpoint
- Reflection
- Project

### Visual Components (Diagrams and visualizations)
- Diagram
- Flowchart
- Timeline
- Mind Map
- Comparison Table

### Interactive Components (Active learning environments)
- **Coding Workspace** ✓ (Implemented)
- Research Workspace
- Simulation
- Sandbox
- AI Chat Tutor
- Whiteboard
- File Upload Activity
- Dataset Explorer

## Architecture Pattern for Interactive Components

Each interactive component follows this pattern:

### 1. Schema Definition
Location: `backend/src/services/aiCourseArchitect/schemas/lessonBlockSchemas.ts`

### 2. Type Integration
Location: `backend/src/services/aiCourseArchitect/types.ts`

### 3. Validator Extension
Location: `backend/src/services/aiCourseArchitect/validation/lessonValidator.ts`

### 4. Migration Support
Location: `backend/src/services/aiCourseArchitect/migration/lessonMigrator.ts`

### 5. Agent Generator
Location: `backend/src/services/aiCourseArchitect/agents/componentNameAgent.ts`

### 6. Renderer
Location: `frontend/src/components/lesson/ComponentNameRenderer.tsx`

## Key Principles

1. **First-class components**: Interactive components are peers in the architecture, not squeezed into content blocks
2. **No markdown fallback**: Components have their own renderers, not markdown parsers
3. **Structured generation**: AI generates structured JSON, not authoring syntax
4. **Validation**: Each component has specific validation for required fields
5. **Migration**: Legacy data migrates to structured format, then legacy fields are removed

## Coding Workspace Implementation

The Coding Workspace serves as the reference implementation for all interactive components:

- Schema: `CodingWorkspaceBlock` with full configuration
- Generator: `codingWorkspaceAgent.ts` produces structured blocks
- Validator: Validates all required fields and authoring syntax
- Migrator: Converts legacy `ArchitectCodingLab` to `CodingWorkspaceBlock`
- Renderer: `CodingWorkspaceRenderer.tsx` mounts dedicated coding environment

## Future Components

When implementing new interactive components (Research, Simulation, Whiteboard, etc.), follow the Coding Workspace pattern:
- Define complete schema with execution and AI assistant config
- Create dedicated agent generator
- Add specific validation
- Build dedicated renderer (not markdown-based)
- Treat as peer to other interactive components
