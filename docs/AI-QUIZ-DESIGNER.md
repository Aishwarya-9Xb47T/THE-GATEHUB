# AI Quiz Designer — Production Documentation



**Feature:** Guided 16-step AI Quiz Design Wizard  

**Entry:** Quiz Room Create → **AI Quiz Designer** card  

**Also:** Template Library → Generate with AI → same wizard  

**Date:** 2026-07-06



---



## Overview



The AI Quiz Designer replaces the old "paste a prompt and generate" flow. Instructors answer structured questions; the system builds the AI prompt internally and produces a reviewable assessment before opening the Quiz Builder.



Comparable to: Quizizz AI, MagicSchool AI, Microsoft Copilot assessment flows.



---



## Architecture



```

Create Quiz → AI Quiz Designer card

        ↓

AiQuizDesignerWizard (16 steps, localStorage draft)

        ↓

buildConfig() → QuizGenerationConfiguration

        ↓

AssessmentGenerationService (shared backend)

        ↓

AiRouter / MockProvider → validate count + type distribution

        ↓

Review screen (requested vs generated, coverage %)

        ↓

commitAiToQuiz() + optional saveQuizAsTemplate()

        ↓

Quiz Builder (all questions editable)

```



Template Library AI generation uses the **same** `AssessmentGenerationService` — no separate code path.



### Key files



| Layer | Path |

|-------|------|

| Wizard UI | `frontend/src/components/ai-quiz-designer/AiQuizDesignerWizard.tsx` |

| Coverage review | `frontend/src/components/ai-quiz-designer/GenerationCoverageReview.tsx` |

| State / types | `frontend/src/lib/aiQuizDesigner/` |

| Shared generation service | `backend/src/services/assessmentGeneration/assessmentGenerationService.ts` |

| AI pipeline entry | `backend/src/services/assessmentStudio/aiAssessment/aiAssessmentService.ts` |

| Template AI | `backend/src/services/templateLibrary/aiTemplateService.ts` |

| Prompt builder | `backend/src/services/ai/assessmentCore.ts` |

| Analytics | `POST /api/ai-quiz-designer/analytics` |



---



## Source of truth: QuizGenerationConfiguration



All AI quiz generation is driven by a single configuration object (extends `AiAssessmentConfig`):



```typescript

{

  questionCount: 20,                    // totalQuestions

  questionTypeDistribution: {           // must sum to questionCount

    multiple_choice: 12,

    true_false: 8,

  },

  difficultyMix?: { easy, medium, hard },

  bloomDistribution?: { Remember: 10, ... },

  // + quizName, subject, topic, media flags, etc.

}

```



**Rules:**



1. `sum(questionTypeDistribution) === questionCount` — enforced before generation (UI disables Generate, API returns 400).

2. AI prompt includes exact counts per type; no hardcoded limits (removed legacy 8-question cap).

3. After generation, count is validated again. Generation runs **per question type in batches of 10** (providers often cap single responses at ~8). Auto-retries up to 5 times per type; UI offers **Generate Remaining**.

4. If AI returns too many, extras are discarded — instructor never sees wrong totals.

5. **Continue** / **Save** disabled until `generated === requested`.

### Per-type batch generation

`AssessmentGenerationService` never relies on a single AI call for the full quiz:

```
QuizGenerationConfiguration
        ↓
For each type in questionTypeDistribution (e.g. MCQ=12, true_false=8)
        ↓
Generate in batches of ≤10 per type (with fill retries)
        ↓
Assemble in type-sequence order → align → validate coverage
```

Both **AI Quiz Designer** (`aiAssessmentService` job pipeline) and **Template Library AI** (`aiTemplateService`) call the same `generateAssessment()` / `generateRemainingQuestions()` functions. `maxTokens` scales with `questionCount` in `BaseChatProvider`.



---



## Wizard flow (16 steps)



| Step | Name | Collects |

|------|------|----------|

| 1 | What to create | Title, subject, level, purpose |

| 2 | Content source | Topic, PDF, DOCX, URL, YouTube, etc. |

| 3 | AI understanding | Topic detail / file upload / analysis animation |

| 4 | Question mix | Count + sliders per type (live total) |

| 5 | Difficulty | Easy / Medium / Hard / Mixed + chart |

| 6 | Bloom's taxonomy | Sliders + live chart |

| 7 | AI content options | Explanations, hints, objectives, etc. |

| 8 | Media preferences | Images, diagrams, charts, etc. |

| 9 | Quiz behavior | Live, homework, mock test, etc. |

| 10 | Quiz rules | Timer, shuffle, leaderboard, XP, passing score |

| 11 | Review plan | Summary before generation |

| 12 | Generate | Progress stages, AI pipeline |

| 13 | Overview | Coverage review + charts |

| 14 | Edit questions | Delete, include/exclude |

| 15 | Save | Quiz / Template / Both |

| 16 | Open builder | Redirect with full edit access |



---



## Prompt generation strategy



The instructor never writes a raw prompt. `buildConfig()` maps wizard answers to `QuizGenerationConfiguration`:



- Title → `quizName`

- Composition → `questionTypeDistribution` (not just type names)

- Bloom sliders → `bloomDistribution` + dominant `bloomLevel`

- Difficulty mix → `difficultyMix`

- Rules → `shuffleQuestions`, `negativeMarking`, etc.



`buildAssessmentSystemPrompt()` emits:



```

Generate EXACTLY 20 questions.

Do NOT generate fewer. Do NOT generate more.

Distribution: multiple_choice = 12, true_false = 8

```



---



## AssessmentGenerationService



Location: `backend/src/services/assessmentGeneration/assessmentGenerationService.ts`



| Function | Purpose |

|----------|---------|

| `validateQuizGenerationConfiguration` | Pre-flight: distribution sum === total |

| `resolveTypeDistribution` | Normalize config to per-type counts |

| `expandTypeSequence` | Ordered type list for alignment |

| `generateAssessment` | Full pipeline with fill retries |

| `generateRemainingQuestions` | Fill gap after partial generation |

| `alignQuestionsToSpec` | Assign types, trim extras |

| `buildGenerationCoverage` | Requested vs generated summary |



Entry points that call this service:



- AI Quiz Designer (`aiAssessmentService.runPipeline`)

- Template Library AI (`aiTemplateService.generateAiTemplate`)

- Assessment Studio AI jobs



---



## API contracts



| Endpoint | Method | Purpose |

|----------|--------|---------|

| `/api/assessment-studio/ai/generate-assessment` | POST | Start generation job |

| `/api/assessment-studio/ai/jobs/:id` | GET | Poll status |

| `/api/assessment-studio/ai/jobs/:id/fill-remaining` | POST | Generate missing questions |

| `/api/assessment-studio/ai/jobs/:id/commit-quiz` | POST | Materialize quiz (blocks if incomplete) |

| `/api/template-library/ai/generate` | POST | Template wizard generation |

| `/api/ai-quiz-designer/analytics` | POST | Event logging |



---



## Validation rules



- Step 4: Composition total must equal question count — show *"Question distribution does not equal total questions"*

- Step 11: `canGenerate()` must pass before Generate Assessment enabled

- Step 13: Continue disabled until coverage is 100%

- Step 15: Save disabled until generation complete

- Commit API: rejects if `questions.length !== config.questionCount`



---



## Error handling



If AI repeatedly fails to reach the requested count:



- Review shows: *"AI generated 18 of the requested 20 questions"*

- Actions: **Generate Remaining**, **Retry Entire Quiz**, **Edit Configuration**

- Never silently create an incomplete quiz



---



## Regression tests



```bash

cd backend && npm run validate:assessment-generation

```



Covers: 5/10/25/50 question counts, mixed types, alignment trim/pad, offline generator, coverage metrics.



---



## QA checklist



| # | Test | Status |

|---|------|--------|

| 1 | Request 50 questions → receive 50 | PASS |

| 2 | Custom type distribution honored exactly | PASS |

| 3 | Composition mismatch blocks Generate | PASS |

| 4 | Review shows requested vs generated | PASS |

| 5 | Continue disabled when incomplete | PASS |

| 6 | Template Library uses shared service | PASS |

| 7 | No hardcoded 8-question limit | PASS |

| 8 | Generate Remaining fills gap | PASS |



---



## Known limitations



1. PDF/QTI/Moodle export buttons deferred (save to builder first)

2. Google Drive / Notion / GitHub sources UI present; full OAuth import deferred

3. Document analysis animation is UX staging (real extraction via AI pipeline on generate)



---



## Production sign-off



| Area | Verdict |

|------|---------|

| Configuration-driven generation | **GO** |

| Shared AssessmentGenerationService | **GO** |

| Review before builder | **GO** |

| No silent truncation | **GO** |



**Recommendation:** Ship as primary AI creation path.


