---
name: rk:codebase-to-course
description: "Transform any codebase into an interactive single-page HTML course with lessons, code examples, and quizzes. Use for documentation, onboarding, or teaching."
argument-hint: "[path or topic]"
---

# Codebase to Course

Transform a codebase into an interactive, self-contained HTML course.

## Workflow

### Step 1: Analyze Codebase

1. Identify the tech stack, architecture, and key patterns
2. Map file dependencies and data flow
3. Identify the "learning path" — what concepts build on what
4. Find the best code examples for each concept

### Step 2: Design Course Structure

Create a curriculum outline:

```
Course: [Project Name] Deep Dive
├── Module 1: Overview & Architecture
│   ├── Lesson 1.1: Project structure
│   ├── Lesson 1.2: Tech stack & dependencies
│   └── Lesson 1.3: Architecture diagram
├── Module 2: Core Concepts
│   ├── Lesson 2.1: Data models
│   ├── Lesson 2.2: Business logic
│   └── Lesson 2.3: API design
├── Module 3: Advanced Patterns
│   ├── Lesson 3.1: Authentication & authorization
│   ├── Lesson 3.2: Error handling
│   └── Lesson 3.3: Performance patterns
└── Module 4: Contributing
    ├── Lesson 4.1: Dev environment setup
    ├── Lesson 4.2: Testing strategy
    └── Lesson 4.3: PR workflow
```

### Step 3: Generate HTML Course

Create a single `course.html` file with:

- **Navigation sidebar** with module/lesson tree
- **Code blocks** with syntax highlighting (use Prism.js CDN)
- **Interactive quizzes** after each module (JavaScript-based)
- **Progress tracking** (localStorage)
- **Dark/light theme** toggle
- **Search** across all lessons
- **Responsive design** for mobile

### Step 4: Content for Each Lesson

Each lesson should include:
1. **Explanation** — What this code does and why
2. **Code snippet** — Actual code from the repo with annotations
3. **Key takeaways** — 2-3 bullet points
4. **Quiz question** — Test understanding

## Template Structure

```html
<!DOCTYPE html>
<html>
<head>
  <title>[Project] Course</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css">
  <style>/* Embedded styles */</style>
</head>
<body>
  <nav id="sidebar"><!-- Module tree --></nav>
  <main id="content"><!-- Lessons --></main>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
  <script>/* Navigation, quizzes, progress, search */</script>
</body>
</html>
```

## Rules

- All content must be from the actual codebase — no generic examples
- Keep explanations concise and practical
- Include file paths so readers can find the real code
- Make quizzes meaningful, not trivial
