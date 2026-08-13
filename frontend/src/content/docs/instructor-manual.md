# Instructor Manual

## Course Creation

1. Go to **Create Course** from the instructor sidebar.
2. Enter title, description, category, and pricing.
3. Use **AI Course Authoring** (optional) to generate curriculum drafts.
4. Build curriculum: sections, lectures, videos, notes, quizzes.

## Course Pricing

Set price in course settings. Use **0** for free courses. Paid courses integrate with the platform payment gateway.

## Publishing

- Save curriculum drafts as you build.
- Publish the course when ready — it becomes visible in Browse (subject to admin approval if configured).
- Unpublish to hide from new enrollments.

## Academic Authoring Studio

The Academic Authoring Studio uses a **Learning Universe DSL** in LaTeX (`main.tex`).

### Learning Universe DSL Structure

```latex
\learninguniverse{title={My Course}, description={...}}
\track{title={Track 1}}
\module{title={Module 1}}
\lesson{title={Lesson 1}}
```

### Content Commands

| Command | Purpose |
|---------|---------|
| `\overviewmarkdown` | Lesson overview |
| `\theory` | Main topic with title and body |
| `\note`, `\tip`, `\warning` | Callout blocks |
| `\image` | Image with caption |
| `\video` | YouTube, Vimeo, or upload |
| `\practice` | Try It Yourself block |
| `\quiz` | MCQ quiz |
| `\project` | Project with instructions |
| `\colab`, `\github` | Colab/GitHub project URLs |
| `\discussion` | Discussion prompt |
| `\assignment` | Graded assignment |
| `\resource`, `\download` | External links and files |
| `\checkpoint` | Progress marker |
| `\certificatecriteria` | Certificate rule text |
| `\finalexam` | Final exam block |

### Publishing to Learning Universe

Click **Publish** in Academic Studio. DSL is parsed into structured `contentBlocks` JSON and stored in the database.

## Visual Authoring Studio

Access via **Create Learning Universe → Visual Studio**.

### Creating Lessons

1. Build hierarchy: Track → Module → Lesson.
2. Select a lesson to open the lesson builder.
3. Add content blocks via **Add Block**.

### Creating Quizzes

Add a **Quiz** block. Configure:

- Single / multiple choice, true/false, fill-in-blank
- Questions, options, correct answers, explanations, marks

### Creating Projects

Add **Project**, **Colab Project**, or **GitHub Project** blocks. Set instructions, rubric, max marks, and submission type.

### Try It Yourself

Add a **Practice** block with starter code, expected output, solution, and hints.

### Uploading Images

Use the Image block — drag and drop or click to upload. Add caption and alt text.

### Uploading Videos

Use **Video Upload** block for MP4, WEBM, MOV. Files are bundled on publish.

### YouTube Embeds

Add **YouTube Video** block and paste the URL.

### Google Colab Projects

Add **Colab Project** block with notebook URL and deliverables. Students launch and submit from the player.

### GitHub Projects

Add **GitHub Project** with repository template URL. Students submit repo links for review.

## Student Analytics

View enrollment counts, progress, and engagement from **Analytics** in the instructor dashboard.

## Certificates

Configure certificate criteria using `\certificatecriteria` blocks or Visual Studio certificate rules. Students earn certificates when all rules pass.

## Project Reviews

Go to **Project Reviews** to grade submissions: approve, reject, assign marks, and leave feedback.

## FAQ

Visit [FAQ](/help/faq) for instructor-specific questions.
