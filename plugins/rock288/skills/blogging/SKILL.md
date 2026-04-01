---
name: rk:blogging
description: "Create, manage, and publish blog posts. Write technical articles, tutorials, and content with SEO optimization. Use for content creation and blog management."
argument-hint: "[topic or action]"
---

# Blogging

Create and manage blog content with SEO optimization.

## Workflow

### Step 1: Topic & Outline

```
## Blog Post Plan

**Title:** [Working title]
**Target Audience:** [Who will read this]
**Goal:** [Educate | Persuade | Entertain | Tutorial]
**Keywords:** [primary keyword, secondary keywords]
**Length:** [word count target]
```

Generate an outline:
```
# [Title]

## Hook / Introduction
- Opening that grabs attention
- What the reader will learn
- Why it matters

## [Section 1: Setup/Context]
- Key point
- Code example or illustration

## [Section 2: Core Content]
- Main teaching point
- Step-by-step walkthrough
- Code examples

## [Section 3: Advanced/Nuance]
- Edge cases
- Best practices
- Common mistakes

## Conclusion
- Key takeaways (3 bullets)
- Call to action
- Related resources
```

### Step 2: Write Content

**Writing Rules:**
- Lead with value — no lengthy preambles
- Use short paragraphs (2-3 sentences max)
- Include code examples that actually work
- Add headings every 200-300 words for scannability
- Use active voice
- Write at 8th grade reading level (Hemingway App standard)

**Technical Article Structure:**
1. The problem (relatable)
2. The solution (clear)
3. The implementation (step-by-step)
4. The result (proof it works)
5. The takeaway (what to remember)

### Step 3: SEO Optimization

| Element | Guideline |
|---------|-----------|
| **Title** | Include primary keyword, under 60 characters |
| **Meta description** | 150-160 characters, include keyword, compelling |
| **H1** | One per page, matches title intent |
| **H2/H3** | Include secondary keywords naturally |
| **URL slug** | Short, keyword-rich, hyphens only |
| **Images** | Alt text with keywords, compressed, WebP format |
| **Internal links** | Link to 2-3 related posts |
| **External links** | Link to 1-2 authoritative sources |

### Step 4: Frontmatter

Generate appropriate frontmatter:

**MDX/Markdown:**
```yaml
---
title: "[Title]"
description: "[Meta description]"
date: "[YYYY-MM-DD]"
author: "[Author name]"
tags: ["tag1", "tag2"]
image: "/blog/[slug]/cover.webp"
draft: false
---
```

### Step 5: Publish Checklist

- [ ] Proofread for grammar and typos
- [ ] All code examples tested and working
- [ ] Images optimized and have alt text
- [ ] SEO elements filled in
- [ ] Internal links added
- [ ] Social sharing preview looks good
- [ ] Mobile formatting verified
- [ ] Reading time calculated
