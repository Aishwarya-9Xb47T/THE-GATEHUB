# AI Assistant Guide

## Overview

THE GATEHUB Assistant is the official intelligent guide for the entire platform. It answers questions about courses, Learning Universes, Academic Studio, coding labs, research papers, Colab, Overleaf, certificates, publishing, payments, and every dashboard.

You do not need to search documentation manually — ask in plain language.

## Opening the Assistant

- Click **Ask Assistant** (floating button on any page).
- In Help Center, click **AI** in the header or **Ask AI Assistant** in the table of contents.
- Press **Ctrl+/** (Windows) or **⌘/** (Mac) from anywhere on the site.

## What the Assistant Knows

The assistant is synchronized with official documentation:

- Getting Started, Student, Instructor, and Admin manuals
- Product guides: Learning Universe, Coding Lab, Research Workspace, Integrations, Publishing
- FAQ, Troubleshooting, and Release Notes
- Platform navigation paths for one-click links in answers

It also uses your **current page** and **role** to tailor answers. On the Coding Lab, it prioritizes run/submit/Colab help. In the Instructor Dashboard, it prioritizes authoring and publishing.

## Example Questions

- How do I create a Learning Universe?
- How do certificates work?
- Where is Google Colab?
- How do I publish my course?
- Why isn't my quiz submitting?
- What is a checkpoint?
- What is the difference between Learning Universe and Course?
- What is Academic Studio?

## Conversation Features

- **Streaming responses** — answers appear as they are generated.
- **Stop generating** — halt a long response mid-stream.
- **Regenerate** — get a fresh answer to your last question.
- **Copy** — copy any assistant message.
- **Clear chat** — reset the conversation.
- **Suggested follow-ups** — tap chips after each answer.
- **Sources** — jump to the exact documentation section cited.
- **History** — your last messages persist across page navigation (same browser).

## Navigation in Answers

When the assistant tells you where to go, it includes clickable links such as [Instructor Dashboard](/instructor) or [Certificates](/student/certificates). Click to navigate directly.

## Troubleshooting the Assistant

### Slow or unavailable

- Check your internet connection.
- Try again — the assistant falls back to documentation search if AI is temporarily unavailable.
- Use **Help Center → Search** (⌘K) as a backup.

### Wrong or incomplete answer

- Rephrase with more context: "I'm on the quiz builder and save fails."
- Click **Regenerate** or ask a follow-up: "What are the required fields?"
- Open the **Sources** links for the full official section.

### Privacy

Conversations are processed to answer your question. Chat history is stored locally in your browser only (not synced across devices).

## For Administrators

Platform admins configure the AI model in **Admin → Settings**. Documentation index is rebuilt when developers run `npm run docs:sync` in the backend after doc updates.
