# THE GATEHUB — Quiz Ecosystem Product Research & Architecture

> **Status:** Superseded by `ASSESSMENT-PLATFORM-ARCHITECTURE.md` for implementation  
> **Benchmark:** Quizizz / Wayground (rebranded summer 2025)  
> **Goal:** Build a superior, AI-powered quiz ecosystem inside THE GATEHUB — not a clone  
> **Canonical architecture:** See [`ASSESSMENT-PLATFORM-ARCHITECTURE.md`](./ASSESSMENT-PLATFORM-ARCHITECTURE.md)

---

## Table of Contents

1. [GATEHUB Quiz Room — Current State Audit](#0-gatehub-quiz-room--current-state-audit)
2. [Part 1 — Product Research (Quizizz/Wayground)](#part-1--product-research)
3. [Part 2 — Live Quiz System](#part-2--live-quiz-system)
4. [Part 3 — Scoring Engine](#part-3--scoring-engine)
5. [Part 4 — Streak System](#part-4--streak-system)
6. [Part 5 — Badges](#part-5--badges)
7. [Part 6 — Leaderboard](#part-6--leaderboard)
8. [Part 7 — Gamification](#part-7--gamification)
9. [Part 8 — Question Types](#part-8--question-types)
10. [Part 9 — Teacher Analytics](#part-9--teacher-analytics)
11. [Part 10 — Student Dashboard](#part-10--student-dashboard)
12. [Part 11 — Database Design](#part-11--database-design)
13. [Part 12 — System Design](#part-12--system-design)
14. [Part 13 — UI/UX Documentation](#part-13--uiux-documentation)
15. [Part 14 — GATEHUB Improvements](#part-14--gatehub-improvements)
16. [Part 15 — Implementation Roadmap](#part-15--implementation-roadmap)
17. [API Documentation (Draft)](#api-documentation-draft)
18. [UI Wireframes (Text)](#ui-wireframes-text)
19. [Task Breakdown](#task-breakdown)

---

## 0. GATEHUB Quiz Room — Current State Audit

Before benchmarking Quizizz, every Quiz Room file was reviewed. Summary of what exists today:

### Frontend — Pages

| File | Purpose | Maturity |
|------|---------|----------|
| `QuizRoomDashboardPage` | Instructor hub: My Quizzes, Live Sessions, Homework (placeholder), Reports, Templates, Settings | **70%** |
| `QuizRoomCreatePage` (wizard) | Multi-path creation: manual, import, AI, duplicate, templates, bank | **75%** |
| `QuizRoomEditPage` | Edit draft/scheduled/lobby rooms, launch | **80%** |
| `QuizBuilderPage` | Full visual quiz studio with AI panel, import, versioning | **85%** |
| `LiveSessionHostPage` | Host lobby, start, next, finish, projector link | **60%** |
| `LiveSessionJoinPage` | Student join via code/PIN | **70%** |
| `LiveSessionPlayerPage` | Student lobby, play, leaderboard, results | **65%** |

### Frontend — Components

| Area | Files | Notes |
|------|-------|-------|
| Quiz Room | `QuizRoomPreviewCard`, `QuizRoomSettingsForm`, `QuizRoomStatusBadge`, `RoomInvitePanel`, `WaitingRoomPanel` | Solid foundation |
| Wizard | `CreateMethodStep`, `DuplicateQuizStep`, `BankReuseStep`, `TemplatePickStep`, `RoomSettingsStep`, `PreviewStep`, `LaunchStep`, `WizardShell` | Course/curriculum steps exist but unused in current wizard flow |
| Live Session | `LiveQuestionDisplay`, `LiveLeaderboard`, `LivePodium`, `LiveSessionAnalyticsPanel`, `RoomCodeDisplay` | MCQ/MSQ only in player |
| Quiz Builder | 19 studio components | 22 question types defined; live player supports ~3 |

### Backend — Services

| Service | Capabilities |
|---------|-------------|
| `quizRoomService` | CRUD rooms, launch, duplicate, templates, preferences, question bank from courses, reports |
| `liveSessionService` | Join, start, advance, submit answer, leaderboard, finish, analytics, session state |
| `liveSessionServer` (WS) | Real-time: connect, answer, host controls, leaderboard broadcast |
| `quizGradingService` | Grade MCQ/MSQ/TF; live points with speed + streak |

### Database (Prisma) — Existing Models

- `Quiz`, `Question`, `Option`, `QuizVersion`, `QuizAttempt`
- `LiveSession`, `LiveParticipant`, `LiveAnswer`, `LeaderboardSnapshot`, `SessionAnalytics`
- `QuizRoomTemplate`, `QuizRoomPreferences`
- `BankQuestion` (Assessment Studio enterprise bank)

### Critical Gaps vs Quizizz

| Feature | Quizizz | GATEHUB Today |
|---------|---------|---------------|
| Homework mode | Full | Placeholder tab |
| Team mode | Full | Setting flag only |
| Power-ups | 10+ types | None |
| Pause/resume session | Yes | No |
| Guest join without account | Yes | Requires login |
| Memes / sound / music | Yes | None |
| Accuracy vs Score separation | Yes | Partial (score only) |
| Question type coverage in live player | 15+ | MCQ, MSQ, TF |
| Export reports | XLSX | Basic in-dashboard only |
| Student gamification dashboard | Limited | None |
| Redis / horizontal WS scale | N/A (their infra) | In-memory WS rooms |

---

# PART 1 — PRODUCT RESEARCH

## A. Instructor Journey (Quizizz/Wayground)

### Registration & Onboarding

| Screen | Elements | Why it exists |
|--------|----------|---------------|
| Sign-up | Email, Google, Microsoft, school SSO | Reduce friction for teachers |
| Role picker | Teacher / Student / Parent / Admin | Route to correct dashboard |
| Grade & subject | Dropdowns | Personalize content recommendations |
| Library tour | "Create" vs "Explore" CTA | Drive first quiz creation |

**Psychology:** Fast time-to-first-quiz (< 3 min) builds habit formation.

---

### Dashboard (Teacher Home)

| Zone | Buttons / Actions | Purpose |
|------|-------------------|---------|
| Header | Create (+), Search, Notifications, Profile | Primary action = create |
| Left nav | My Library, Reports, Classes, Collections, Settings | Information architecture |
| Hero | "Create a quiz" / "Create a lesson" | Conversion |
| Recent activity | Last hosted games, drafts | Continuity |
| Explore | Trending quizzes by subject | Discovery & reuse |

**Why:** Teachers return to manage content, not re-create. Reports and classes are second-most-used paths.

---

### Creating a Quiz — Entry Points

1. **Create → Assessment** — blank quiz
2. **AI Quiz Generator** — topic/PDF/URL → questions
3. **Import** — Google Forms, spreadsheet, PDF, existing Quizizz quiz
4. **Explore → Duplicate** — clone public quiz
5. **Combine quizzes** — merge questions from multiple sources

---

### AI Quiz Generation (Wayground)

| Step | UI | Why |
|------|-----|-----|
| Source picker | Topic text, PDF upload, URL, YouTube, passage | Meet teachers where their content lives |
| Config | Grade, subject, # questions, difficulty, question types | Control output quality |
| Generate | Progress spinner, streaming questions | Perceived speed |
| Review | Edit/delete/regenerate per question | Human-in-the-loop trust |
| Save | Add to library | Reuse across sessions |

**GATEHUB already has:** `AiAssessmentStudio`, import pipeline, quiz builder AI panel — **stronger than Quizizz in review workflow**.

---

### Manual Quiz Creation (Editor)

| Screen Region | Components | Purpose |
|---------------|------------|---------|
| Left rail | Question list, reorder, add (+) | Navigation at scale |
| Canvas | Stem editor, media attach, options | Authoring |
| Right panel | Points, timer, tags, standards, explanation | Metadata & pedagogy |
| Top bar | Preview, Save, Share, Host | Publish funnel |

**Per-question actions:** Duplicate, delete, convert type (AI), add image/audio/video, math editor, embed passage.

---

### Question Bank & Organization

| Feature | Behavior | Why |
|---------|----------|-----|
| My Library | Folders, tags, search | Scale content management |
| Collections | Curated sets by topic | Reuse across classes |
| Public library | Community quizzes | Network effects |
| Tags | Custom + auto (AI) | Discovery |
| Standards alignment | CCSS, state standards | Institutional sales |

**GATEHUB:** Course lecture quizzes + `BankQuestion` model — needs unified "My Question Bank" UX.

---

### Assign & Host Flows

| Mode | Flow | Use case |
|------|------|----------|
| **Live — Classic** | Host → code → student-paced within session window | Engagement |
| **Live — Instructor-paced** | Teacher advances questions together | Synchronous teaching |
| **Live — Team** | Individual answers, team aggregate score | Collaboration |
| **Live — Test** | Timer lock, login required, no memes | Formal assessment |
| **Live — Mastery Peak** | Climb accuracy mountain, redemption questions | Mastery learning |
| **Homework** | Assign with deadline, async | Practice |
| **Paper Mode** | QR cards for non-device students | Inclusion |

**Host settings screen (critical):**

- Shuffle questions / options
- Show timer (off / default / test lock)
- Power-ups on/off
- Memes on/off
- Music & sound effects
- Leaderboard on/off
- Show answers after question
- Redemption question
- Attempt limit
- Require login
- Late join lock

---

### Sharing, Visibility & Clone

| Setting | Options | Why |
|---------|---------|-----|
| Visibility | Private, organization, public | IP & collaboration |
| Share link | Direct URL to quiz | Async distribution |
| Clone | Full copy with new ID | Template culture |
| Co-edit | Shared editing (premium) | Team authoring |

---

## B. Student Journey (Quizizz/Wayground)

```
Join Code → Enter Name → Waiting Room → Quiz Starts → Question Screen
    → Timer → Answer → Correct/Wrong Feedback → Leaderboard Flash
    → Next Question → Final Result → Review Answers → Analytics
```

### Step-by-step UX & Psychology

| Step | UI Elements | Engagement Psychology |
|------|-------------|----------------------|
| **Join** | Large PIN input, join.quizizz.com | Low friction, game-like entry |
| **Name** | Nickname field, avatar picker | Identity & ownership |
| **Waiting room** | "Waiting for host…", player count, music toggle | Anticipation builds arousal |
| **Question screen** | Progress bar, timer arc, large option cards | Time pressure → focus |
| **Answer** | Tap option, submit | Immediate agency |
| **Feedback** | Green/red flash, meme, streak meter, points popup | Variable reward schedule |
| **Leaderboard** | Rank jump animation, top 5 | Social comparison (opt-in stress) |
| **Final** | Podium, personal stats, accuracy % | Closure & achievement |
| **Review** | Question-by-question with explanations | Learning (not just scoring) |

**Key insight:** Quizizz separates **Accuracy Points** (learning truth, LMS-synced) from **Session Scores** (gamification, leaderboard only). This is pedagogically important.

---

# PART 2 — LIVE QUIZ SYSTEM

## Quizizz Live Architecture (Inferred + Documented)

### Host Creates Room

1. Teacher selects quiz → mode (Classic/Test/Team/Teacher-led)
2. Configures game settings
3. System generates **6-digit game code** (Wayground) or join link
4. Lobby opens; teacher sees real-time join list

### GATEHUB Equivalent (Implemented)

- 6-char alphanumeric `roomCode` + 4-digit `PIN`
- Status machine: `draft → scheduled → lobby → active → paused → finished`
- Join URL: `/live/play/:sessionId`

### Real-time Synchronization

| Event | Quizizz | GATEHUB |
|-------|---------|---------|
| Student joins | Socket update to host | WS `participant_joined` |
| Host starts | All clients → Q1 | WS `session_started` + `session_state` |
| Answer submitted | Leaderboard update | WS `answer_received` + `leaderboard` |
| Next question | State sync | WS `question_advanced` |
| Finish | Final podium | WS `session_finished` |

### Backend Requirements (Full Spec)

```
┌─────────────┐     WebSocket      ┌──────────────────┐
│   Clients   │◄──────────────────►│  Live Session    │
│ (Host/Stud) │                    │  Gateway (WS)    │
└─────────────┘                    └────────┬─────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    ▼                       ▼                       ▼
             ┌────────────┐         ┌────────────┐         ┌────────────┐
             │   Redis    │         │  Postgres  │         │  Scoring   │
             │ Room State │         │  Persist   │         │  Engine    │
             │ Pub/Sub    │         │            │         │            │
             └────────────┘         └────────────┘         └────────────┘
```

**Required capabilities:**

| Capability | Spec |
|------------|------|
| Room code generation | Unique, collision-safe, easy to type (no O/0/I/1) |
| Late join | Configurable; sync to current question index |
| Reconnect | `allowRejoin`; restore participant state from DB |
| Network failure | Client exponential backoff; server marks `disconnected` |
| Pause / Resume | Host pauses timer; broadcast `session_paused` |
| End quiz | Idempotent finish; persist attempts + analytics |
| Teacher controls | Start, next, pause, finish, kick, announce |
| Timer authority | Server-side `questionStartedAt` (already in GATEHUB) |
| Anti-cheat basics | Server grades; never send `isCorrect` before submit |

### GATEHUB Gaps to Close

- [ ] Pause/resume
- [ ] Redis-backed room state (multi-instance WS)
- [ ] Late-join sync policy
- [ ] Guest/anonymous participants
- [ ] Team scoring aggregation
- [ ] Instructor-paced vs student-paced modes

---

# PART 3 — SCORING ENGINE

## Quizizz Official Formula (Wayground Help Center)

### Timer ON — Allow answers after time ends (Default)

```
IF correct:
  base_score = 600
  speed_bonus = 0..400  (linear by response speed within timer)
  total = 600 + speed_bonus
ELSE:
  total = 0

IF timed out (Test Timer mode):
  total = 0
```

### Timer OFF

```
IF correct: total = 600 (or 1000 in some business docs)
ELSE: total = 0
```

### Accuracy Points (Separate from Score)

- **Accuracy** = correctness only; used in reports & LMS
- **Score** = accuracy + speed + power-ups + streak bonuses; used for leaderboard
- Power-ups affect score ONLY, never accuracy

## GATEHUB Scoring (Current Implementation)

```typescript
// quizGradingService.calculateLivePoints
points = correctnessWeight                           // default 1000
       + round(speedWeight * (1 - responseTime/timer))  // default up to 500
       + streakBonus * (streak - 1)                     // default 100 per streak level
```

### Recommended GATEHUB Scoring v2

Dual-track system mirroring Quizizz pedagogy:

| Track | Formula | Used for |
|-------|---------|----------|
| **Accuracy Points** | `+1 per correct question` (or question marks) | Reports, LMS, mastery |
| **Session Score** | `base + speedBonus + streakBonus + powerUpMultiplier` | Leaderboard only |

```
speedBonus = max(0, floor(speedWeight * (1 - responseMs / timerMs)))
streakBonus = streak >= 2 ? streakBonusRate * min(streak, maxStreakCap) : 0
negativeMarking: if enabled, wrong = -0.25 * correctnessWeight
skipped: 0 points, breaks streak
```

### Tie-breaker Order

1. Higher session score
2. Higher accuracy %
3. More correct answers
4. Lower total response time
5. Earlier join timestamp (first-mover tiebreak)

---

# PART 4 — STREAK SYSTEM

## Quizizz Streak Behavior

| Streak | UI | Effect |
|--------|-----|--------|
| 2+ correct | Streak meter fills | Visual reward |
| 3+ | Flame icon intensifies | Identity ("on fire") |
| Wrong answer | Meter resets (unless Streak Saver power-up) | Loss aversion |
| Streak Booster power-up | Increments streak counter artificially | Engagement spike |

**Animations:** Progress bar fill, flame particles, combo text ("5 in a row!")

## GATEHUB Recreation Spec

```typescript
interface StreakState {
  current: number;
  best: number;
  multiplier: number;  // 1.0, 1.1, 1.25, 1.5 at 3, 5, 10
  lastBrokenAt?: Date;
}

// On correct: current++, update best, apply multiplier to streakBonus
// On wrong/skipped/timeout: current = 0
// Power-up "streak_shield": absorb one wrong
```

**Milestones for celebration:**

| Streak | Celebration |
|--------|-------------|
| 3 | "Heating up!" + small confetti |
| 5 | "On fire!" + flame animation |
| 10 | "Unstoppable!" + full-screen burst |
| Personal best | "New record!" badge |

---

# PART 5 — BADGES

## Quizizz Badge Landscape

Quizizz has **limited persistent student badges** compared to full LMS platforms. Most rewards are session-scoped. Institutional tiers add more.

## GATEHUB Expandable Badge Engine

### Schema Concept

```typescript
interface BadgeDefinition {
  id: string;
  slug: string;           // "perfect_score", "speed_demon"
  category: "daily" | "weekly" | "achievement" | "participation" | "milestone" | "learning";
  name: string;
  description: string;
  icon: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  criteria: BadgeCriteria;  // JSON rule engine
  xpReward: number;
  coinReward: number;
}

interface BadgeCriteria {
  type: "count" | "streak" | "threshold" | "composite";
  metric: string;         // "questions_answered", "live_sessions_joined", "accuracy_pct"
  operator: ">=" | "==" | "consecutive";
  value: number;
  window?: "daily" | "weekly" | "all_time";
}
```

### Badge Catalog (Launch Set)

| Badge | Criteria |
|-------|----------|
| First Steps | Complete 1 quiz |
| Perfect Score | 100% accuracy in a session |
| Speed Demon | Fastest correct answer in session |
| Streak Master | 10-question streak |
| Century | 100 questions lifetime |
| Dedicated | 7-day learning streak |
| Team Player | 5 team mode sessions |
| Night Owl | Complete quiz after 10pm |
| Placement Ready | 80%+ on coding track |

**Engine rules:** Event-driven (`quiz.completed`, `answer.submitted`) → evaluate criteria → award once → notify.

---

# PART 6 — LEADERBOARD

## Quizizz Leaderboard UX

- Updates after each question (Classic mode)
- Shows rank, name, score, streak indicator
- Top 3 podium with avatars
- Current user pinned/highlighted
- Rank movement arrows (↑↓)
- Class vs global (limited)

## GATEHUB Backend Logic (Current + Target)

### Current (`buildLeaderboard`)

```sql
ORDER BY score DESC, correctCount DESC
-- movement via previousRanks map in WS memory
```

### Target

```typescript
interface LeaderboardEntry {
  rank: number;
  participantId: string;
  displayName: string;
  avatar: string;
  sessionScore: number;
  accuracyPct: number;
  streak: number;
  movement: "up" | "down" | "same";
  badges: string[];       // session-earned
  isCurrentUser?: boolean;
  teamId?: string;
}
```

**Real-time flow:**

1. Answer submitted → recalculate scores
2. Sort participants → assign ranks
3. Diff vs `LeaderboardSnapshot` → compute movement
4. Broadcast `leaderboard` event
5. Persist snapshot per question index

**Animations (Framer Motion — already started in `LiveLeaderboard`):**

- `layout` transitions on rank change
- Spring physics for position swaps
- Podium scale emphasis for top 3

---

# PART 7 — GAMIFICATION

| Feature | Quizizz | Engagement Psychology | GATEHUB Plan |
|---------|---------|----------------------|--------------|
| **XP** | Session-scoped mostly | Progression visibility | Persistent XP ledger |
| **Coins** | Limited | Secondary currency for shop | Earn per session, spend on avatars |
| **Power-ups** | 10 types | Agency & comeback mechanics | Phase 3 |
| **Lives** | Via Immunity power-up | Risk/reward | Optional "hardcore" mode |
| **Memes** | After each answer | Humor reward | Themed feedback cards |
| **Music/SFX** | Toggleable | Sensory engagement | Ambient + correct/wrong sounds |
| **Daily Challenge** | Limited | Habit loop | 1 quiz/day bonus XP |
| **Weekly Challenge** | Limited | Sustained engagement | Department competitions |
| **Levels** | Minimal | Long-term progression | Level = f(total XP) |
| **Avatars** | Yes | Self-expression | Profile customization |
| **Redemption Q** | Re-attempt wrong | Growth mindset | Mastery Peak mode |

**Motivation framework (Self-Determination Theory):**

- **Autonomy:** Power-ups, pace choice, avatar
- **Competence:** Streaks, levels, mastery mode
- **Relatedness:** Team mode, class leaderboard

---

# PART 8 — QUESTION TYPES

## Quizizz / Wayground Types

| Category | Types |
|----------|-------|
| Basic | MCQ, Multi-select, T/F, Fill blank, Open-ended |
| Math | Math response, Graphing |
| Interactive | Match, Reorder, Categorize, Drag-drop, Dropdown, Hot text, Labeling, Hotspot |
| Media | Interactive video, Audio response, Video response, Draw |
| Pedagogy | Poll, Word cloud, Passage (comprehension) |

## GATEHUB Builder Types (22 defined)

`multiple_choice`, `multiple_select`, `true_false`, `fill_blank`, `numerical`, `matching`, `ordering`, `sequence`, `poll`, `short_answer`, `essay`, `image_based`, `video_based`, `audio_based`, `hotspot`, `matrix`, `coding`, `debugging`, `predict_output`, `sql`, `case_study`, `scenario`

## Recommended Database Structure

```
Quiz
 └── Question
      ├── type (enum)
      ├── stem (text/html)
      ├── media[] (QuestionMedia: image|video|audio)
      ├── metadata (JSON per type)
      ├── difficulty, bloomLevel, tags[]
      ├── explanation, hints[]
      ├── marks, timeLimitSeconds
      └── Option[] (for choice-based)
           OR MatchPair[] (matching)
           OR Blank[] (fill_blank)
           OR HotspotRegion[] (hotspot)
           OR CodeTestCase[] (coding)
           OR RubricCriteria[] (essay/audio/video)
```

### `Question.metadata` Examples

```json
// fill_blank
{ "blanks": [{ "id": "b1", "acceptedAnswers": ["mitochondria"], "caseSensitive": false }] }

// coding
{ "language": "python", "starterCode": "...", "testCases": [...], "timeLimitMs": 5000 }

// passage
{ "passageId": "...", "subQuestions": ["q1", "q2"] }

// hotspot
{ "imageUrl": "...", "regions": [{ "x", "y", "width", "height, "label" }] }
```

---

# PART 9 — TEACHER ANALYTICS

## Quizizz Reports

| Report | Contents |
|--------|----------|
| **Session overview** | Class accuracy %, avg score, participant count |
| **Per student** | Score, accuracy, time per Q, email parent |
| **Per question** | % correct, avg time, review in class |
| **Topics** | Tag-level weakness |
| **Export** | XLSX download |

## GATEHUB Target Analytics

| Report | Metrics |
|--------|---------|
| Class Report | Accuracy, participation rate, avg response time, score distribution |
| Student Report | Per-question breakdown, weak topics, improvement vs last attempt |
| Question Report | P-value (difficulty), discrimination index |
| Live Session | Real-time + post-session heatmap |
| Cohort | Department, semester, placement track |
| Export | CSV, XLSX, PDF |

**GATEHUB advantage:** Tie quiz analytics to **course progress**, **Learning Universe**, and **placement prep tracks**.

---

# PART 10 — STUDENT DASHBOARD

## Quizizz Student Experience

- Minimal persistent dashboard
- Game history via assigned activities
- Accuracy tracked per assignment

## GATEHUB Student Dashboard (Proposed)

| Section | Content |
|---------|---------|
| **Progress ring** | Weekly quizzes completed vs goal |
| **XP & Level** | Current level, XP to next |
| **Badges** | Earned + in-progress |
| **Recent Quizzes** | Last 10 with score/accuracy |
| **Leaderboard position** | Class, department, global toggle |
| **Weak topics** | AI-generated from miss patterns |
| **Learning path** | Placement / DSA / company-specific tracks |
| **Certificates** | Milestone completions |
| **Streak calendar** | Daily activity heatmap |

---

# PART 11 — DATABASE DESIGN

## Entity Relationship (Target State)

```
User ──┬── Quiz (author)
       ├── LiveSession (host)
       ├── LiveParticipant
       ├── QuizAttempt
       ├── UserXP / UserLevel
       ├── UserBadge
       └── QuizRoomPreferences

Quiz ──┬── Question ── Option / metadata
       ├── QuizVersion
       └── LiveSession

LiveSession ──┬── LiveParticipant ── LiveAnswer
              ├── LeaderboardSnapshot
              └── SessionAnalytics

BadgeDefinition ── UserBadge
QuestionBank (BankQuestion) ── materializes to ── Question
```

## New Tables (Proposed)

```prisma
model UserXP {
  userId    String @id
  totalXp   Int
  level     Int
  coins     Int
  updatedAt DateTime
}

model BadgeDefinition { id, slug, category, criteria Json, ... }
model UserBadge { userId, badgeId, earnedAt, sessionId? }

model UserStreak { userId, currentDays, bestDays, lastActiveDate }
model PowerUpInventory { userId, powerUpType, quantity }

model Team { id, sessionId, name, color }
model TeamMember { teamId, participantId }

model HomeworkAssignment {
  id, quizId, hostUserId, courseId?, dueAt, settings Json, status
}
model HomeworkSubmission { assignmentId, userId, attemptId, submittedAt }

model LeaderboardScope {
  id, scopeType, scopeId, period, rankings Json, computedAt
}
```

## Indexing Strategy

- `LiveSession(roomCode)`, `LiveSession(status, hostUserId)`
- `LiveParticipant(sessionId, score DESC)`
- `LiveAnswer(sessionId, questionId)`
- `QuizAttempt(userId, createdAt DESC)`
- `UserBadge(userId, earnedAt DESC)`

---

# PART 12 — SYSTEM DESIGN

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CDN (media, assets)                       │
└─────────────────────────────────────────────────────────────────┘
                                  │
┌─────────────────────────────────────────────────────────────────┐
│                     React SPA (Frontend)                         │
│  Quiz Room │ Quiz Builder │ Live Player │ Analytics │ Student  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS / WSS
┌────────────────────────────▼────────────────────────────────────┐
│                      API Gateway / Load Balancer                 │
└───────┬─────────────────┬─────────────────────┬─────────────────┘
        │                 │                     │
┌───────▼──────┐  ┌───────▼──────┐      ┌───────▼──────┐
│  REST API    │  │  WS Gateway  │      │  AI Service  │
│  (Express)   │  │  (Socket.IO  │      │  (Router +   │
│              │  │   or ws+Redis)│      │   Providers) │
└───────┬──────┘  └───────┬──────┘      └───────┬──────┘
        │                 │                     │
        └────────┬────────┴─────────────────────┘
                 │
    ┌────────────▼────────────┐
    │     PostgreSQL (Prisma)  │
    └────────────┬────────────┘
                 │
    ┌────────────▼────────────┐
    │  Redis                   │
    │  - Room state cache      │
    │  - Pub/sub for WS scale  │
    │  - Leaderboard sorted set│
    │  - Rate limiting         │
    └─────────────────────────┘
```

## Component Decisions

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Realtime | Socket.IO + Redis adapter | Horizontal scale; fallback transports |
| Auth | JWT (existing) + optional guest tokens | Matches GATEHUB auth |
| Media | S3-compatible + `resolveCourseMediaUrl` | Reuse platform media |
| Caching | React Query + Redis | Invalidate on curriculum edits |
| Analytics | SessionAnalytics + nightly rollup job | Fast dashboards |
| AI | Existing `AiRouter` / Assessment Studio | Single AI plane |

## Scaling Notes

- WS sticky sessions OR Redis pub/sub for cross-node broadcast
- Leaderboard in Redis `ZADD` during active session; flush to Postgres on finish
- Question payloads cached per session (shuffle seed stored server-side)

---

# PART 13 — UI/UX DOCUMENTATION

## Page Inventory

### Teacher

| Page | Key Components | Primary Actions |
|------|----------------|-----------------|
| Quiz Room Dashboard | Tab bar, quiz cards, session list | Create, Host, Edit, Reports |
| Creation Wizard | Method cards, import, AI studio | Pick source → configure → launch |
| Quiz Builder | Navigator, canvas, properties, AI panel | Add/edit questions, preview |
| Room Edit | Settings form, preview card | Save, Launch |
| Host Dashboard | Waiting room, invite panel, analytics | Start, Next, Finish, Projector |
| Reports | Session list, drill-down | Export, Review questions |
| Analytics Detail | Charts, per-Q heatmap | Identify weak topics |

### Student

| Page | Key Components | Primary Actions |
|------|----------------|-----------------|
| Join | Code/PIN input | Join |
| Lobby | Title, player count, wait animation | Wait |
| Player | Question display, timer, streak, LB | Answer |
| Results | Podium, personal stats, review link | View history |
| Dashboard | XP, badges, paths | Start challenge |

## Component Library (Reuse from GATEHUB)

- `CoursePlayerPage` patterns for immersive player
- `PremiumQuizCard` for library
- `MarkdownContent` for explanations
- `VideoPlayer` / `UploadedVideoPlayer` for media questions
- `TryItPlayground` for coding questions
- Framer Motion for leaderboard animations

---

# PART 14 — GATEHUB IMPROVEMENTS (Don't Copy — Leapfrog)

| Feature | Why GATEHUB Wins |
|---------|------------------|
| **AI Quiz Generator** | Already built with review studio; add difficulty detection |
| **AI Difficulty Detection** | Auto-tag P-value after 50 attempts |
| **Adaptive Questions** | Serve harder Q on streak; easier on struggle |
| **AI Hint / Tutor** | Contextual hint without giving answer |
| **Coding Challenges** | 22-type builder includes code/SQL/debug — live runner |
| **DSA / Placement Tracks** | Company-specific quiz paths (Google, TCS, etc.) |
| **Department Leaderboard** | Multi-scope rankings Quizizz lacks |
| **Course Integration** | Quiz results feed course progress (single player) |
| **Learning Universe** | Quizzes embedded in LU projects |
| **Instructor Preview** | Same player for preview + student (GateHub rule) |
| **Resume / Interview Quiz** | AI evaluates open-ended responses |
| **Attendance Rewards** | Tie live session join to attendance module |
| **Leaderboard History** | Weekly/monthly/semester archives |
| **Personalized Learning Path** | AI groups weak topics → recommended quiz set |

---

# PART 15 — IMPLEMENTATION ROADMAP

## Phase 1 — Core Quiz Engine (4–6 weeks)

- [ ] Unify question type rendering in live player (MCQ → all builder types)
- [ ] Dual-track scoring (accuracy + session score)
- [ ] Homework assignment mode
- [ ] Report export (CSV/XLSX)
- [ ] Question validation pipeline for live

## Phase 2 — Live Quiz (4–5 weeks)

- [ ] Redis-backed WS scaling
- [ ] Pause/resume, late-join policy
- [ ] Instructor-paced mode
- [ ] Team mode scoring
- [ ] Projector/display view polish
- [ ] Guest join option

## Phase 3 — Gamification (3–4 weeks)

- [ ] Streak system v2 with animations
- [ ] Power-ups engine
- [ ] Badge system
- [ ] XP/levels/coins
- [ ] Sound, memes, confetti themes

## Phase 4 — Analytics (3–4 weeks)

- [ ] Per-question difficulty analytics
- [ ] Student weakness detection
- [ ] Department/semester leaderboards
- [ ] PDF report generation
- [ ] Parent/instructor email summaries

## Phase 5 — AI Features (4–6 weeks)

- [ ] Adaptive difficulty engine
- [ ] AI hint/tutor in live player
- [ ] AI grading for open-ended/audio/video
- [ ] Personalized learning paths
- [ ] Placement/company quiz generators

---

# API DOCUMENTATION (DRAFT)

## REST — Quiz Room (Existing + Proposed)

### Rooms

| Method | Path | Description |
|--------|------|-------------|
| POST | `/live-sessions` | Create room |
| PATCH | `/live-sessions/:id` | Update room |
| POST | `/live-sessions/:id/launch` | Launch to lobby |
| DELETE | `/live-sessions/:id` | Delete room |
| POST | `/live-sessions/:id/duplicate` | Clone room |
| GET | `/live-sessions/my` | List host rooms |
| GET | `/live-sessions/:id` | Room detail |
| GET | `/live-sessions/:id/state` | Snapshot state |
| GET | `/live-sessions/lookup/:code` | Resolve code/PIN |

### Live Controls

| Method | Path | Description |
|--------|------|-------------|
| POST | `/live-sessions/:id/join` | Join as participant |
| POST | `/live-sessions/:id/start` | Start session |
| POST | `/live-sessions/:id/next` | Advance question |
| POST | `/live-sessions/:id/pause` | **(new)** Pause |
| POST | `/live-sessions/:id/resume` | **(new)** Resume |
| POST | `/live-sessions/:id/finish` | End session |
| GET | `/live-sessions/:id/analytics` | Host analytics |

### Homework (Proposed)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/homework` | Assign quiz |
| GET | `/homework/my` | Student assignments |
| POST | `/homework/:id/submit` | Submit attempt |

### Gamification (Proposed)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users/me/xp` | XP & level |
| GET | `/users/me/badges` | Earned badges |
| GET | `/leaderboards/:scope` | Scoped leaderboard |

## WebSocket — `/live-sessions/ws/:sessionId`

### Client → Server

| Event | Payload | Who |
|-------|---------|-----|
| `ping` | — | All |
| `answer` | `{ questionId, answer }` | Student |
| `host:start` | — | Host |
| `host:next_question` | — | Host |
| `host:pause` | — | Host (new) |
| `host:resume` | — | Host (new) |
| `host:finish` | — | Host |

### Server → Client

| Event | Payload |
|-------|---------|
| `connected` | `{ participantId?, isHost }` |
| `session_state` | `{ state: LiveSessionState }` |
| `session_started` | — |
| `question_advanced` | — |
| `session_paused` | `{ pausedAt }` (new) |
| `answer_result` | `{ isCorrect, pointsEarned, explanation?, correctOptions? }` |
| `leaderboard` | `{ rankings: LeaderboardEntry[] }` |
| `streak_milestone` | `{ streak, label }` (new) |
| `powerup_available` | `{ type, expiresAt }` (new) |
| `session_finished` | `{ leaderboard }` |
| `error` | `{ message }` |

---

# UI WIREFRAMES (TEXT)

## Student Live Player

```
┌────────────────────────────────────────────────────────┐
│  Week 3 Review          Q4/20     🏆#3  12,400  🔥5   │
├────────────────────────────────────────────────────────┤
│  ████████████░░░░░░░░  Timer: 18s                      │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  What is the time complexity of binary search?    │  │
│  │  [image optional]                                │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │ O(n)    │ │ O(log n)│ │ O(n²)   │ │ O(1)    │      │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │
│                                                        │
│              [ Submit Answer ]                         │
│                                                        │
│  ┌─ Live Leaderboard (collapsible) ─────────────────┐  │
│  │ 1↑ Alice    14,200  🔥7                          │  │
│  │ 2→ You      12,400  🔥5   ← highlighted         │  │
│  │ 3↓ Bob      11,900  🔥3                          │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

## Host Dashboard (Active Question)

```
┌──────────────────────────────────────────────────────────────┐
│  Week 3 Review   ● LIVE   24 players   [Projector] [Finish]  │
├──────────────────────────────────────────────────────────────┤
│  Question 4/20 — "Binary search complexity"                  │
│  Answered: 18/24 ████████████░░  75%                        │
│  Correct: 82%    Avg time: 12.4s                             │
├────────────────────────────┬─────────────────────────────────┤
│  LIVE LEADERBOARD          │  QUESTION STATS                 │
│  🥇 Alice 14,200           │  [Bar chart per option]         │
│  🥈 Bob   11,900           │  A: 2%  B: 82%  C: 9%  D: 7%  │
│  🥉 Carol 11,500           │                                 │
│                            │  [Next Question →]              │
└────────────────────────────┴─────────────────────────────────┘
```

## Quiz Builder (Existing — Validated)

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Quiz Room   Untitled Quiz   ✓ Saved   [Preview] [AI] [Host]  │
├──────────┬──────────────────────────────┬───────────────────────┤
│ Q Nav    │  Question Canvas             │ Properties / AI Panel │
│ ├ Q1     │  Stem editor                 │ Difficulty            │
│ ├ Q2 ●   │  Options                     │ Bloom level           │
│ ├ Q3     │  Media attach                │ Timer override        │
│ [+ Add]  │  Explanation                 │ Tags                  │
└──────────┴──────────────────────────────┴───────────────────────┘
```

---

# TASK BREAKDOWN

## Epic 1: Core Engine Hardening

| ID | Task | Est. | Depends |
|----|------|------|---------|
| E1-1 | Question type renderer registry (player) | 5d | — |
| E1-2 | Grading adapters per question type | 5d | E1-1 |
| E1-3 | Dual-track scoring refactor | 3d | — |
| E1-4 | Homework assignment model + API | 4d | — |
| E1-5 | Homework student flow | 4d | E1-4 |
| E1-6 | CSV/XLSX report export | 3d | — |

## Epic 2: Live Session v2

| ID | Task | Est. | Depends |
|----|------|------|---------|
| E2-1 | Redis room state + pub/sub | 5d | — |
| E2-2 | Pause/resume host controls | 2d | — |
| E2-3 | Instructor-paced mode | 4d | — |
| E2-4 | Team mode aggregation | 4d | — |
| E2-5 | Guest join flow | 3d | — |
| E2-6 | Late-join sync policy | 2d | — |
| E2-7 | Projector view page | 3d | — |

## Epic 3: Gamification

| ID | Task | Est. | Depends |
|----|------|------|---------|
| E3-1 | Badge definition engine | 4d | — |
| E3-2 | XP/level/coins ledger | 3d | — |
| E3-3 | Streak celebrations UI | 2d | E1-3 |
| E3-4 | Power-up system | 5d | E2-1 |
| E3-5 | Sound/theme/memes | 3d | — |

## Epic 4: Analytics

| ID | Task | Est. | Depends |
|----|------|------|---------|
| E4-1 | Per-question stats dashboard | 4d | — |
| E4-2 | Student weakness report | 4d | E1-3 |
| E4-3 | Scoped leaderboards | 4d | E3-2 |
| E4-4 | PDF export | 2d | E1-6 |

## Epic 5: AI

| ID | Task | Est. | Depends |
|----|------|------|---------|
| E5-1 | Adaptive difficulty service | 5d | E4-2 |
| E5-2 | AI hint in live player | 3d | — |
| E5-3 | AI open-ended grading | 5d | E1-2 |
| E5-4 | Placement track generator | 5d | — |

---

## APPROVAL CHECKPOINT

**No code will be written until you approve:**

1. This product research direction
2. Database schema additions (Part 11)
3. API additions (API section)
4. Phase priority order (Part 15)
5. Which GATEHUB improvements to prioritize (Part 14)

Reply with approvals, changes, or phase selection to begin module-by-module implementation.

---

*Document generated from: GATEHUB Quiz Room codebase audit + Wayground/Quizizz official documentation (help.wayground.com, 2025).*
