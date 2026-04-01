---
name: rk:design-review
description: "Automated UI/UX design review with specialized analysis. Review screenshots, mockups, or live UI for accessibility, consistency, responsiveness, and UX best practices."
argument-hint: "[screenshot path or URL or component name]"
---

# Design Review

Comprehensive UI/UX design review with actionable feedback.

## Workflow

### Step 1: Capture Current State

Gather the UI to review:
- Screenshot provided by user → analyze directly
- Component name → find the code and understand the rendered output
- URL → use browser tools to capture if available

### Step 2: Visual Analysis

Analyze the UI across these dimensions:

| Dimension | What to Check |
|-----------|---------------|
| **Layout** | Alignment, spacing consistency, visual hierarchy, grid usage |
| **Typography** | Font sizes, weights, line heights, readability, contrast |
| **Color** | Palette consistency, contrast ratios (WCAG AA/AAA), semantic usage |
| **Spacing** | Consistent padding/margin, breathing room, density |
| **Components** | Consistent button styles, form elements, card patterns |
| **Responsiveness** | Mobile-first, breakpoint handling, touch targets (44px min) |
| **Accessibility** | Alt text, focus indicators, screen reader support, color blindness |
| **Interaction** | Hover/active states, loading states, error states, empty states |

### Step 3: Code Review (if applicable)

Check implementation for:
- Hardcoded values vs design tokens
- Missing responsive styles
- Accessibility attributes (aria-*, role, tabIndex)
- Animation performance (transform/opacity only)
- Image optimization (lazy loading, srcset, WebP)

### Step 4: Generate Report

```
## Design Review Report

### Overall Score: X/10

### 🔴 Critical Issues
- [issue] — Why it matters + fix suggestion

### 🟡 Improvements
- [issue] — Why it matters + fix suggestion

### 🔵 Suggestions
- [idea] — How it would improve UX

### ✅ What's Working Well
- [positive observation]

### Accessibility Checklist
- [ ] Color contrast ≥ 4.5:1 (AA)
- [ ] Touch targets ≥ 44x44px
- [ ] Focus indicators visible
- [ ] Alt text on images
- [ ] Form labels associated
- [ ] Keyboard navigable
- [ ] Screen reader tested

### Responsive Checklist
- [ ] Mobile (320-480px)
- [ ] Tablet (768-1024px)
- [ ] Desktop (1280px+)
- [ ] Large screen (1920px+)
```

## Rules

- Be specific — reference exact elements, not vague areas
- Prioritize by user impact, not personal taste
- Always check accessibility first — it's not optional
- Suggest concrete CSS/component fixes when possible
- Compare against the existing design system if one exists
