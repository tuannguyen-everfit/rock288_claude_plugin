# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

This repo is a **Claude Code plugin marketplace** (`rk-kit`) containing a single plugin (`rk`) that bundles skills, agents, hooks, output-styles, and a statusline. Users install via the marketplace; nothing here ships as a runtime application.

- Marketplace manifest: [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json)
- Plugin manifest: [`plugins/rock288/.claude-plugin/plugin.json`](plugins/rock288/.claude-plugin/plugin.json) (plugin name = `rk`, source dir = `plugins/rock288/`)

## Layout

All shippable content lives under `plugins/rock288/`:

| Dir | What | Count (approx) |
|---|---|---|
| `skills/` | Skill folders (each has `SKILL.md` + optional `references/`, `scripts/`, `assets/`) | 77 |
| `agents/` | Subagent definitions (`*.md` with frontmatter) | 14 |
| `hooks/` | Node `.cjs` hook scripts wired through `hooks.json` | ~20 |
| `hooks/lib/` | Shared utilities required by multiple hooks (config, logger, statusline, transcript parser) | — |
| `hooks/notifications/` | Notification provider integrations | — |
| `output-styles/` | Coding-level personas (eli5 → god) | 6 |
| `scripts/` | Python + Node utilities used by skills/hooks | — |
| `statusline.cjs` | Custom statusline renderer | — |

## Common commands

```bash
# Run worktree script tests (canonical Node test suite, no test framework — plain assertions)
node plugins/rock288/scripts/worktree.test.cjs

# Validate docs structure
node plugins/rock288/scripts/validate-docs.cjs

# Rebuild skills_data.yaml (skill metadata index used by find-skills, kanban, etc.)
python3 plugins/rock288/scripts/scan_skills.py

# Install Python deps for scripts
pip install -r plugins/rock288/scripts/requirements.txt   # pyyaml

# Resolve env vars through the layered hierarchy (process.env > project .claude > user .claude)
python3 plugins/rock288/scripts/resolve_env.py <VAR> --skill <skill-name>
```

There is no top-level `package.json`, no lint config, no global build step. Per-skill `package.json` files exist only inside skills that ship runtime tools (e.g., `skills/markdown-novel-viewer/`, `skills/chrome-devtools/scripts/`) — install/test those locally inside the skill directory.

## Architecture notes

### Hook system (`plugins/rock288/hooks/`)
- Wired via [`hooks.json`](plugins/rock288/hooks/hooks.json) — Claude Code reads this to register hooks against events (`SessionStart`, `SubagentStart`, `SubagentStop`, `UserPromptSubmit`, `PreToolUse`, etc.).
- Each hook is a standalone `.cjs` file with a crash-wrapper pattern: all logic inside `try { ... } catch` so a hook failure never breaks the session.
- Shared logic lives in `hooks/lib/`. Most-touched modules: `ck-config-utils.cjs` (loads `.claude/.ck.json` config + session state), `hook-logger.cjs` (timing + crash logging), `project-detector.cjs` (mono-repo vs single-repo detection — also reused by an OpenCode plugin per the comment in `session-init.cjs`).
- `hooks/lib/__tests__/` holds unit tests for the lib modules (currently empty in this snapshot — verify before assuming).

### Skill naming convention

**`name` in `SKILL.md` frontmatter must be the BARE slug — no namespace prefix.**

Claude Code builds a plugin skill's slash command as `/<plugin-name>:<frontmatter name>`, concatenated verbatim with no prefix de-duplication. So:

| frontmatter `name` | slash command | |
|---|---|---|
| `git` | `/rk:git` | ✅ |
| `ck:git` | `/rk:ck:git` | ❌ legacy, migrated away |
| `rk:git` | `/rk:rk:git` | ❌ doubled |

- Folder name and `name` must be identical (the folder is what the Skill tool listing uses — a mismatch makes `/rk:<folder>` and the tool name disagree).
- Kebab-case, no prefix. Cross-references in skill bodies use the invocable form: `/rk:<slug>`.
- History: plugin was `claudekit` → `rk` (`5809bd7`, `ba72930`); all `ck:`/`ckm:` frontmatter names were stripped to bare slugs in `rk` 4.0.0, and the 7 `ck-*` skill folders were renamed (`ck-debug` → `debug`, etc.).

### Session state
- Hooks read/write session state via `hooks/lib/session-state-manager.cjs` and `ck-config-utils.cjs`.
- Per-project config: `.claude/.ck.json` in the consumer project (not in this repo).
- Env var resolution follows a 7-level hierarchy documented in [`plugins/rock288/scripts/README.md`](plugins/rock288/scripts/README.md) — keep that doc in sync if you change `resolve_env.py`.

### Skill metadata index
- `scripts/scan_skills.py` walks `skills/*/SKILL.md`, parses frontmatter, and emits `skills_data.yaml`.
- `EXACT_CATEGORY_MAP` at the top of `scan_skills.py` overrides categorization for high-signal skills — when adding a new skill that should not fall into "other", add it there.

### Skill structure
- `SKILL.md` frontmatter must include `name` (kebab-case, with `rk:` prefix) and `description` (under 1024 chars, includes both *what* and *when to use*). Optional: `argument-hint`, `metadata.author`, `metadata.version`.
- Detailed docs go in `references/<topic>.md` so SKILL.md stays focused on routing logic.
- Executable helpers go in `scripts/` and are invoked by the skill body.

## Conventions

- **`.cjs` for Node, `.py` for Python** — kebab-case filenames in both.
- **No README.md inside individual skill folders** (per Anthropic's skill spec) — repo-level README is fine, but per-skill docs go in `references/`.
- **Don't reformat** existing skill markdown when editing — preserve original style/quoting; many skills are quoted from external sources.
- **Hooks must be fast and silent** — they run on every session/turn boundary. Long work belongs in skills, not hooks.

## Version bumps (REQUIRED on every content change)

Every commit that touches plugin content (skills, agents, hooks, output-styles, statusline, scripts) **must bump `version` in BOTH** manifests, and the two numbers must match:

- [`plugins/rock288/.claude-plugin/plugin.json`](plugins/rock288/.claude-plugin/plugin.json) → `version`
- [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) → `plugins[0].version`

SemVer:
- patch (`x.y.Z`) — edit existing skill/hook content, bug fix
- minor (`x.Y.0`) — new skill/agent/hook added, new behavior
- major (`X.0.0`) — breaking change (skill renamed, config schema changed)

**Why:** Claude Code keys the installed plugin cache by version (`~/.claude/plugins/cache/rk-kit/rk/<version>/`). If `version` doesn't change, `/plugin update` won't re-sync files — users keep running the stale snapshot even after `marketplace update` pulls new commits. Bump in the same commit as the content change, not a separate one.

### Refresh installed plugin after pushing

Run these AFTER `git push origin main` lands the bumped version. One-liner — restart Claude Code afterward to load the new content:

```bash
claude plugin marketplace update rk-kit 2>&1 | tail -20 \
  && echo "---then update plugin---" \
  && claude plugin update rk@rk-kit 2>&1 | tail -20
```

Expected output: `✔ Successfully updated marketplace: rk-kit` then `✔ Plugin "rk" updated from <old> to <new> for scope user. Restart to apply changes.`

If the second step says "already up to date" but the source bumped, the version field in `plugin.json` and/or `marketplace.json` wasn't actually changed in the pushed commit — fix and force the cycle again.