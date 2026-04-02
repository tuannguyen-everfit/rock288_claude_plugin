# Rock288 Claude Plugin

Claude Code plugin containing reusable skills, agents, hooks, and rules for all repos.

## Installation

```bash
# Add marketplace (one-time)
claude plugin marketplace add https://github.com/tuannguyen-everfit/rock288_claude_plugin

# Install plugin
claude plugin install rock288@rk-kit
```

## Update

```bash
# Update marketplace first (pull latest version info)
claude plugin marketplace update rk-kit

# Then update plugin
claude plugin update rock288@rk-kit
```

## Uninstall

```bash
# Remove plugin
claude plugin uninstall rock288@rk-kit

# Remove marketplace (optional)
claude plugin marketplace remove rk-kit
```

## Contents

| Type | Count | Description |
|------|-------|-------------|
| Skills | 79 | Slash commands for dev workflows (fix, debug, plan, test, etc.) |
| Agents | 14 | Specialized subagents (code-reviewer, tester, planner, etc.) |
| Hooks | 14 | Event handlers (session-init, privacy-block, dev-rules, etc.) |
| Rules | 5 | Development rules, workflow, orchestration, documentation |

## Usage

After installation, skills use the `rk:` prefix (short for **R**oc**K**288). Type `/rk:` in Claude Code to see autocomplete.

### Development Workflow

| Skill | Description |
|-------|-------------|
| `/rk:cook` | Autonomous full workflow (research → implement → review → commit) |
| `/rk:fix [issue]` | Fix bugs, errors, test failures, CI/CD issues |
| `/rk:debug [error]` | Systematic debugging with root cause analysis |
| `/rk:plan [feature]` | Create implementation plans and architecture |
| `/rk:test` | Run unit, integration, e2e tests and coverage |
| `/rk:code-review` | Review code quality before PRs |
| `/rk:review-pr [PR#]` | Review pull requests on GitHub with actionable feedback |
| `/rk:bdd [feature]` | Behavior-Driven Development with Gherkin specs |

### Research & Planning

| Skill | Description |
|-------|-------------|
| `/rk:ask [question]` | Answer technical questions about codebase |
| `/rk:research [topic]` | Research technical topics with structured report |
| `/rk:scientific-research [topic]` | Deep research for science, engineering, finance, data analysis |
| `/rk:brainstorm [idea]` | Brainstorm solutions with trade-off analysis |
| `/rk:docs-seeker [lib]` | Search library/framework documentation |
| `/rk:sequential-thinking` | Step-by-step analysis for complex problems |
| `/rk:spec-driven [feature]` | Spec-driven dev (AB Method) — decompose problems into focused missions |
| `/rk:context-priming [area]` | Systematic context priming before complex tasks |

### Frontend & UI

| Skill | Description |
|-------|-------------|
| `/rk:frontend-development` | React/TypeScript with modern patterns |
| `/rk:frontend-design` | Create polished UIs from designs/screenshots |
| `/rk:design-review [screenshot]` | Automated UI/UX review (accessibility, consistency, responsiveness) |
| `/rk:ui-styling` | Style with shadcn/ui (Radix + Tailwind) |
| `/rk:ui-ux-pro-max` | UI/UX design (50 styles, 21 palettes, 50 fonts) |
| `/rk:web-frameworks` | Next.js App Router, RSC, Turborepo |
| `/rk:react-best-practices` | React/Next.js performance optimization |
| `/rk:threejs` | 3D web apps with Three.js |
| `/rk:shader` | GLSL fragment shaders for procedural graphics |
| `/rk:web-design-guidelines` | Web design principles and guidelines |
| `/rk:tanstack` | TanStack Start, Form, and AI |
| `/rk:mermaidjs-v11` | Mermaid.js diagrams |
| `/rk:remotion` | Programmatic video with Remotion |

### Backend & Infra

| Skill | Description |
|-------|-------------|
| `/rk:backend-development` | Node.js, Python, Go (NestJS, FastAPI, Django) |
| `/rk:databases` | MongoDB & PostgreSQL schemas and queries |
| `/rk:readonly-postgres [query]` | Safe read-only PostgreSQL queries with validation & timeouts |
| `/rk:devops` | Cloudflare, Docker, GCP, Kubernetes |
| `/rk:payment-integration` | SePay, Stripe, Paddle, Polar payments |
| `/rk:better-auth` | Authentication with Better Auth |
| `/rk:shopify` | Shopify app development and themes |
| `/rk:google-adk-python` | Google ADK for Python |
| `/rk:web-testing` | Web testing and CI/CD workflows |

### Mobile

| Skill | Description |
|-------|-------------|
| `/rk:mobile-development` | React Native, Flutter, Swift, Kotlin |

### Tools & Utilities

| Skill | Description |
|-------|-------------|
| `/rk:git` | Git operations with conventional commits |
| `/rk:scout` | Fast codebase scouting with parallel agents |
| `/rk:team` | Orchestrate agent teams for parallel work |
| `/rk:autonomous-loop [task]` | Autonomous task loop with safety guardrails (Ralph technique) |
| `/rk:chrome-devtools` | Browser automation with Puppeteer |
| `/rk:mcp-builder` | Build MCP servers |
| `/rk:mcp-management` | Manage MCP server integrations |
| `/rk:use-mcp` | Use MCP tools and resources |
| `/rk:repomix` | Pack repos into AI-friendly files |
| `/rk:media-processing` | FFmpeg, ImageMagick, AI background removal |
| `/rk:ai-multimodal` | Analyze images/audio/video with Gemini API |
| `/rk:ai-artist` | Generate images (129 curated prompts) |
| `/rk:agent-browser` | Browser agent for web automation |
| `/rk:worktree` | Git worktree management |
| `/rk:context-engineering` | Advanced context engineering techniques |
| `/rk:problem-solving` | Structured problem-solving methodology |

### Documentation & Project

| Skill | Description |
|-------|-------------|
| `/rk:docs` | Analyze and manage project documentation |
| `/rk:document-skills` | Work with documents (PDF, DOCX, XLSX, PPTX) |
| `/rk:project-management` | Track progress, update plans, generate reports |
| `/rk:plans-kanban` | View plans dashboard with progress tracking |
| `/rk:kanban` | AI agent orchestration board |
| `/rk:journal` | Write journal entries analyzing changes |
| `/rk:mintlify` | Build documentation sites with Mintlify |
| `/rk:copywriting` | Conversion copywriting formulas |
| `/rk:blogging [topic]` | Create, manage, and publish blog posts with SEO |
| `/rk:markdown-novel-viewer` | Markdown novel/book viewer |
| `/rk:gkg` | GitLab Knowledge Graph — semantic code analysis |

### Learning & Process

| Skill | Description |
|-------|-------------|
| `/rk:learn-faster [topic]` | Accelerated learning with FASTER method & spaced repetition |
| `/rk:learn-from-mistakes` | Compound engineering — turn failures into guardrails |
| `/rk:codebase-to-course [path]` | Transform codebase into interactive HTML course |
| `/rk:vibe-log` | Session analysis, productivity review, strategic guidance |
| `/rk:coding-level` | Set coding level for tailored explanations |

### Other

| Skill | Description |
|-------|-------------|
| `/rk:bootstrap` | Bootstrap new projects from scratch |
| `/rk:skill-creator` | Create or update Claude skills |
| `/rk:find-skills` | Discover and install new skills |
| `/rk:preview` | View files or generate visual explanations |
| `/rk:watzup` | Review recent changes and wrap up session |
| `/rk:rk-help` | Show all available skills |

## License

MIT
