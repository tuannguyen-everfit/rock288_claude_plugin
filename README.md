# Rock288 Claude Plugin

Claude Code plugin containing reusable skills, agents, hooks, and rules for all repos.

## Installation

```bash
# Add marketplace (one-time)
/plugin marketplace add rock288/claude-plugin

# Install plugin
/plugin install claude-kit@rock288-plugins
```

## Contents

| Type | Count | Description |
|------|-------|-------------|
| Skills | 72 | Slash commands for dev workflows (fix, debug, plan, test, etc.) |
| Agents | 14 | Specialized subagents (code-reviewer, tester, planner, etc.) |
| Hooks | 15 | Event handlers (session-init, privacy-block, dev-rules, etc.) |
| Rules | 5 | Development rules, workflow, orchestration, documentation |

## Usage

After installation, skills are namespaced:

```
/claude-kit:fix [issue]
/claude-kit:debug [error]
/claude-kit:plan [feature]
/claude-kit:test
/claude-kit:ask [question]
```

## License

MIT
