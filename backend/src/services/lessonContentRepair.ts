/**
 * Detect and repair generic AI / heuristic lesson prose for existing + future courses.
 */

export interface LessonRepairContext {
  lessonTitle: string;
  moduleTitle?: string;
  courseTitle?: string;
  subject?: string;
  industry?: string;
}

const GENERIC_MARKERS = [
  "modern curricula formalize prerequisites",
  "the central idea is structured decomposition",
  "mechanism and trade-offs matter as much as final answers",
  "organizations map",
  "structured handling of complexity with measurable outcomes",
  "a well-designed control system: inputs, logic, and outputs",
  "problem framing",
  "define inputs, constraints, and success metrics",
  "hello from",
  "console.log(\"hello from",
  "wikipedia.org/wiki/main_page",
  "key concept 1",
  "key concept 2",
  "advanced concept",
  "formula 1: description",
  "flowchart td",
  "graph lr",
  "a fundamental concept related to",
  "the main subject of this lesson, a core concept in",
  "technology teams treat",
  "hiring and delivery signal",
  "emerged because teams in",
  "focus on mechanism before memorization",
];

/** Instructor-authored sections that must appear in the student player when they have content. */
const STUDENT_CURRICULUM_SECTIONS = [
  /^summary$/i,
  /^key takeaways$/i,
  /^glossary$/i,
  /^revision notes/i,
  /^references$/i,
  /^learning outcome$/i,
  /^checkpoint$/i,
  /^further reading$/i,
  /^core content$/i,
  /^theory$/i,
  /^real-world analogy$/i,
  /^concept explanation$/i,
  /^examples$/i,
  /^case study$/i,
  /^common mistakes$/i,
  /^best practices$/i,
  /^industry notes$/i,
  /^mathematical derivation$/i,
  /^overview$/i,
];

/** Auto-generated appendix blocks — omit only when content is empty or stubby. */
const STUB_APPENDIX_SECTIONS = [
  /^flashcards$/i,
  /^cheat sheet$/i,
  /^research papers$/i,
  /^visual learning aids$/i,
  /^diagrams$/i,
  /^visual diagram$/i,
  /^process flowchart$/i,
  /^execution steps$/i,
  /^interview questions$/i,
  /^faq$/i,
  /^industry tips$/i,
];

const READING_SECTION_TITLES = STUDENT_CURRICULUM_SECTIONS;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Authored TeX/media markers — never treat as generic stub content. */
function hasAuthoredRichContent(text: string): boolean {
  return /\\includegraphics|\\begin\{|\\\[|\\\(|\\video\s*\{/i.test(text);
}

function normalizeTopicName(lessonTitle: string): string {
  const main = lessonTitle.split(/[-–—|]/)[0]?.trim() || lessonTitle;
  const sub = lessonTitle.split(/[-–—|]/).slice(1).join(" — ").trim();
  return sub ? `${main} — ${sub}` : main;
}

function lessonFocus(lessonTitle: string): string {
  const parts = lessonTitle.split(/[-–—|]/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(" — ") : parts[0] || lessonTitle;
}

function isWebCourse(ctx: LessonRepairContext): boolean {
  const hay = `${ctx.courseTitle ?? ""} ${ctx.subject ?? ""} ${ctx.lessonTitle ?? ""}`.toLowerCase();
  return /web\s*dev|html|css|javascript|frontend|full[\s-]?stack/.test(hay);
}

export function isGenericLessonContent(text: string): boolean {
  if (hasAuthoredRichContent(text)) return false;
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized || normalized === "{" || normalized.startsWith("{")) return true;
  if (wordCount(normalized) < 40) return true;
  const hits = GENERIC_MARKERS.filter((m) => normalized.includes(m));
  return hits.length >= 2 || (hits.length >= 1 && wordCount(normalized) < 180);
}

function hasSubstantiveBody(body: string): boolean {
  const trimmed = body.trim();
  return Boolean(trimmed && trimmed !== "{" && !/^[\[{]\s*$/.test(trimmed));
}

export function isDistinctCurriculumSection(title: string): boolean {
  return STUDENT_CURRICULUM_SECTIONS.some((re) => re.test(title.trim()));
}

export function shouldOmitLearnerTheorySection(title: string, body: string): boolean {
  const trimmed = body.trim();
  const titleTrim = title.trim();
  if (!hasSubstantiveBody(trimmed)) return true;

  if (isDistinctCurriculumSection(titleTrim)) return false;

  if (STUB_APPENDIX_SECTIONS.some((re) => re.test(titleTrim))) {
    if (/^front:/i.test(trimmed) && /back:/i.test(trimmed)) return true;
    if (/key concept [12]/i.test(trimmed)) return true;
    if (/^graph\s+lr|^flowchart\s+td/i.test(trimmed.replace(/```[\s\S]*?```/g, ""))) return true;
    if (wordCount(trimmed) < 20) return true;
    return isGenericLessonContent(trimmed);
  }

  if (/^front:/i.test(trimmed) && /back:/i.test(trimmed)) return true;
  if (/console\.log\("hello from/i.test(trimmed)) return true;
  if (/wikipedia\.org\/wiki\/main_page/i.test(trimmed)) return true;
  if (/key concept [12]/i.test(trimmed)) return true;
  if (/^graph\s+lr|^flowchart\s+td/i.test(trimmed.replace(/```[\s\S]*?```/g, ""))) return true;
  return false;
}

export function isPrimaryReadingSection(title: string): boolean {
  return READING_SECTION_TITLES.some((re) => re.test(title.trim()));
}

function buildWebFoundationsPremium(ctx: LessonRepairContext): string {
  const topic = normalizeTopicName(ctx.lessonTitle);
  const focus = lessonFocus(ctx.lessonTitle);
  const course = ctx.courseTitle || ctx.subject || "Web Development";

  return [
    `## ${topic}`,
    ``,
    `This lesson establishes the **professional baseline** for ${focus.toLowerCase()} in ${course}. Strong web teams do not rush into frameworks before everyone shares the same mental model of how browsers, documents, styles, scripts, and deployment environments work together.`,
    ``,
    `### What you are building toward`,
    `- A clear map of the web platform: user agent, network, markup, styling, scripting, and hosting.`,
    `- The vocabulary used in code reviews, onboarding docs, and production incident discussions.`,
    `- A readiness checklist you can apply before every new feature, refactor, or debugging session.`,
    ``,
    `### Core concepts`,
    `**1. Documents and structure.** HTML is not just syntax — it defines meaning, accessibility, and how assistive technologies interpret your interface. Semantic elements (\`header\`, \`main\`, \`nav\`, \`article\`, \`section\`) make pages easier to maintain and test.`,
    ``,
    `**2. Presentation layer.** CSS controls layout, spacing, typography, and responsive behavior. The box model, cascade, specificity, and flex/grid fundamentals explain most real-world UI bugs.`,
    ``,
    `**3. Runtime behavior.** JavaScript coordinates user input, DOM updates, and asynchronous network calls. Understanding the event loop, promises, and fetch basics prevents fragile UI code.`,
    ``,
    `**4. Delivery path.** A change is not "done" until it is versioned, reviewed, tested, and deployed through a predictable pipeline. Git, linting, and environment parity are part of the craft — not optional extras.`,
    ``,
    `### Real-world analogy`,
    `Think of a production web app like a live concert: the **HTML** is the stage layout, **CSS** is lighting and staging, **JavaScript** is the conductor coordinating musicians, and **infrastructure** is power, security, and ticketing at the door. If the stage is unsafe or power is unstable, the performance fails no matter how talented the band is.`,
    ``,
    `### How practitioners work`,
    `1. Confirm prerequisites — repo access, Node/runtime versions, browser devtools, and API contracts.`,
    `2. Reproduce the smallest working path before adding complexity.`,
    `3. Validate accessibility, responsive layout, and error states — not only the happy path.`,
    `4. Document assumptions so the next engineer can continue without guesswork.`,
    ``,
    `### Common mistakes`,
    `- Skipping semantic HTML and relying on \`div\` soup that breaks accessibility.`,
    `- Chasing frameworks before understanding HTTP, DOM, and CSS layout fundamentals.`,
    `- Treating local success as production readiness without build, test, or deploy checks.`,
    ``,
    `### Best practices`,
    `- Keep components small, testable, and named after user-visible behavior.`,
    `- Use browser devtools as your first debugger — network, console, performance, and accessibility panels.`,
    `- Write acceptance criteria that mention devices, browsers, and failure behavior.`,
    ``,
    `### Examples in practice`,
    `**Onboarding scenario:** A junior developer joins a product team. Before touching feature code, they trace one user action end-to-end: click → event handler → API request → JSON response → DOM update → persisted state.`,
    ``,
    `**Debugging scenario:** A button appears broken in production but works locally. The team compares network traces, environment variables, and build artifacts instead of guessing at CSS.`,
    ``,
    `### Summary`,
    `${topic} is your readiness layer. When it is solid, later lessons on architecture, frameworks, and performance become faster to learn because you are building on verified fundamentals instead of fragile assumptions.`,
  ].join("\n");
}

function buildGenericPremium(ctx: LessonRepairContext): string {
  const topic = normalizeTopicName(ctx.lessonTitle);
  const focus = lessonFocus(ctx.lessonTitle);
  const subject = ctx.subject || ctx.courseTitle || "this subject";
  const industry = ctx.industry || "professional teams";

  return [
    `## ${topic}`,
    ``,
    `${focus} is a practical capability in ${subject}, not a label to memorize. In ${industry}, practitioners use it to reduce rework, communicate decisions clearly, and ship outcomes that survive review, handoff, and scale.`,
    ``,
    `### Why this lesson exists`,
    `Teams introduce ${focus.toLowerCase()} when informal knowledge stops working. The goal is a repeatable workflow: define prerequisites, execute deliberately, verify outcomes, and document what is safe for the next step.`,
    ``,
    `### Concept model`,
    `1. **Entry conditions** — What must already be true?`,
    `2. **Operating rules** — What standards keep work consistent?`,
    `3. **Execution path** — What sequence produces reliable results?`,
    `4. **Verification** — How do you prove correctness before moving on?`,
    `5. **Handoff** — What should the next person or system be able to trust?`,
    ``,
    `### Real-world analogy`,
    `${focus} works like a pre-flight checklist. Pilots with thousands of hours still verify fuel, instruments, and weather because expertise does not remove the need for disciplined preparation.`,
    ``,
    `### Applied examples`,
    `- **Delivery:** A team documents prerequisites before implementation so code review focuses on design instead of missing context.`,
    `- **Incident response:** When production fails, engineers trace which prerequisite was assumed instead of verified.`,
    `- **Stakeholder communication:** Progress is explained as risk reduced and readiness proven — not activity completed.`,
    ``,
    `### Common mistakes`,
    `- Jumping to advanced patterns before foundational checks pass.`,
    `- Copying solutions without understanding why each step exists.`,
    `- Optimizing before correctness is demonstrated on realistic inputs.`,
    ``,
    `### Best practices`,
    `- Write observable acceptance criteria.`,
    `- Prefer small, testable units with explicit interfaces.`,
    `- Record decisions so future changes do not repeat old failures.`,
    ``,
    `### Summary`,
    `Mastering ${focus.toLowerCase()} means you can explain the workflow, apply it under pressure, and defend your choices with evidence — not slogans.`,
  ].join("\n");
}

export function buildPremiumLessonReading(ctx: LessonRepairContext): string {
  if (isWebCourse(ctx) && /foundation|prerequisite|notation|core theory/i.test(ctx.lessonTitle)) {
    return buildWebFoundationsPremium(ctx);
  }
  return buildGenericPremium(ctx);
}

export function repairLessonSectionBody(
  title: string,
  body: string,
  ctx: LessonRepairContext
): string {
  const trimmed = body.trim();
  if (hasAuthoredRichContent(trimmed)) return trimmed;
  if (isDistinctCurriculumSection(title.trim())) return trimmed;
  if (!trimmed || isGenericLessonContent(trimmed)) {
    if (/core content|^theory$/i.test(title.trim())) {
      return buildPremiumLessonReading(ctx);
    }
    if (/real-world analogy/i.test(title)) {
      const topic = lessonFocus(ctx.lessonTitle);
      return `## Real-World Analogy\n\nThink of **${topic}** as the checklist stage before high-stakes work begins. When prerequisites are explicit, teams move faster because they are not rebuilding context from scratch after every mistake.`;
    }
    if (/concept explanation/i.test(title)) {
      return [
        `## Concept Explanation`,
        `1. **Prerequisites** — Confirm tools, knowledge, and constraints.`,
        `2. **Workflow** — Apply the core process in a deliberate order.`,
        `3. **Verification** — Test realistic inputs and failure cases.`,
        `4. **Handoff** — Document what is proven and what remains open.`,
      ].join("\n");
    }
    if (/common mistakes/i.test(title)) {
      return `## Common Mistakes\n\n1. Skipping readiness checks.\n2. Mixing setup work with optimization too early.\n3. Using inconsistent terminology across the team.`;
    }
    if (/best practices/i.test(title)) {
      return `## Best Practices\n\n1. Define measurable acceptance criteria.\n2. Keep the first working path small and observable.\n3. Record why each prerequisite exists.`;
    }
    if (/examples/i.test(title)) {
      return `## Examples\n\n**Scenario A:** A team validates prerequisites before implementation and catches a missing dependency during planning instead of in production.\n\n**Scenario B:** A reviewer asks for evidence of verification — not just code volume — before approving the next milestone.`;
    }
    if (/summary/i.test(title)) {
      const focus = lessonFocus(ctx.lessonTitle);
      return `## Summary\n\n${focus} gives you a disciplined workflow for reliable progress: prepare, execute, verify, and communicate readiness clearly.`;
    }
  }
  return trimmed;
}

export function consolidateReadingMarkdown(
  sections: Array<{ title: string; body: string }>,
  ctx: LessonRepairContext
): string {
  const primary = sections.filter(
    (s) => isPrimaryReadingSection(s.title) && !shouldOmitLearnerTheorySection(s.title, s.body)
  );

  const generic = primary.length === 0 || primary.every((s) => isGenericLessonContent(s.body));
  if (generic) {
    return buildPremiumLessonReading(ctx);
  }

  const parts: string[] = [];
  for (const section of primary) {
    const repaired = repairLessonSectionBody(section.title, section.body, ctx);
    if (!repaired.trim() || isGenericLessonContent(repaired)) continue;
    if (/^core content$|^theory$/i.test(section.title.trim())) {
      parts.push(repaired);
      continue;
    }
    parts.push(`### ${section.title}\n\n${repaired.replace(/^##\s+[^\n]+\n+/i, "")}`);
  }

  if (parts.length === 0) return buildPremiumLessonReading(ctx);
  return parts.join("\n\n");
}
