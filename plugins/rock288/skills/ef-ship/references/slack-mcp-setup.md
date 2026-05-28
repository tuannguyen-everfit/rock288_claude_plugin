# Slack MCP setup for `rk:ef-ship --slack`

The `--slack` flow uses **[korotovsky/slack-mcp-server](https://github.com/korotovsky/slack-mcp-server)** instead of the bundled `claude.ai_Slack` MCP, because korotovsky's server exposes `SLACK_MCP_ADD_MESSAGE_UNFURLING` — the env var that flips `chat.postMessage`'s `unfurl_links: true` flag so GitHub PR URLs render as preview cards.

Without this MCP, the skill still posts the message, but the URL will be plain text (no card).

## 1. Pick auth mode

Choose one of three. Recommended for personal use: **browser session (xoxc/xoxd)** — fastest setup, no Slack app install.

| Mode | Token | Pros | Cons |
|---|---|---|---|
| Browser session | `xoxc` + `xoxd` | No admin approval, no scopes, no app install. Works in any workspace you can log in to. | Tokens tied to your browser session; rotate when you log out / change password. |
| User OAuth | `xoxp` | Stable, scope-controlled. | Need workspace admin to install the Slack app. |
| Bot token | `xoxb` | Cleanest separation. | Must invite bot to every channel. Cannot use `search.messages`. |

Below covers browser session (most common case).

## 2. Extract `SLACK_MCP_XOXC_TOKEN`

1. Open Slack in browser: `https://app.slack.com/client/<TEAM_ID>/<CHANNEL_ID>` (e.g. `everfit.slack.com`).
2. Open DevTools:
   - Chrome: ⌘+Option+I (Mac) / Ctrl+Shift+I (Win) → **Console** tab
   - Firefox: Tools → Browser Tools → Web Developer Tools → Console
3. Type `allow pasting` and press Enter (Chrome safety check).
4. Paste this snippet and press Enter:
   ```js
   JSON.parse(localStorage.localConfig_v2).teams[document.location.pathname.match(/^\/client\/([A-Z0-9]+)/)[1]].token
   ```
5. Copy the printed value — starts with `xoxc-`. This is `SLACK_MCP_XOXC_TOKEN`.

## 3. Extract `SLACK_MCP_XOXD_TOKEN`

Still in DevTools on the Slack tab:

1. Switch to **Application** tab (Chrome) / **Storage** tab (Firefox).
2. Left sidebar → **Cookies** → `https://<workspace>.slack.com`.
3. Find the cookie with name **`d`** (just the single letter).
4. Double-click its Value cell → copy entire string (starts with `xoxd-`).
5. This is `SLACK_MCP_XOXD_TOKEN`.

## 4. Register the MCP server in Claude Code

Edit `~/.claude.json` (or project-level `.mcp.json` if you want it scoped per repo):

```jsonc
{
  "mcpServers": {
    "slack-mcp": {
      "command": "npx",
      "args": ["-y", "@korotovsky/slack-mcp-server"],
      "env": {
        "SLACK_MCP_XOXC_TOKEN": "xoxc-...",
        "SLACK_MCP_XOXD_TOKEN": "xoxd-...",
        "SLACK_MCP_ADD_MESSAGE_TOOL": "C05F65TBB9P",
        "SLACK_MCP_ADD_MESSAGE_UNFURLING": "github.com"
      }
    }
  }
}
```

**Key env explanations:**

| Var | Purpose |
|---|---|
| `SLACK_MCP_ADD_MESSAGE_TOOL` | Whitelist channel for `conversations_add_message`. `C05F65TBB9P` = `#backend-review-code`. Use `true` to enable for all channels (riskier). |
| `SLACK_MCP_ADD_MESSAGE_UNFURLING` | Domain whitelist for `unfurl_links`. `github.com` enables PR card preview. Use `*` for all domains (security: Slack disables unfurl if any non-whitelisted domain is in the same message). |

The MCP name `slack-mcp` becomes the tool prefix → `rk:ef-ship` calls `mcp__slack-mcp__conversations_add_message` and `mcp__slack-mcp__users_search`. If you name it differently, update the references in SKILL.md or the runtime resolution will fail.

## 5. Restart + verify

```bash
# Restart Claude Code to pick up the new MCP server
# Then list available tools:
/mcp
```

Look for `slack-mcp` server with these tools listed:
- `conversations_add_message`
- `users_search`
- `channels_list`

If you see them, you're set. Run a dry test:
```
/rk:ef-ship --dry-run --slack
```

## 6. Disable / remove the bundled `claude.ai_Slack` MCP (optional)

Both MCPs expose overlapping tool names if you keep them. To avoid ambiguity:

- In `~/.claude.json` or the Claude.ai integrations panel, disconnect the `claude.ai_Slack` integration; `rk:ef-ship` only references `slack-mcp` tool names.

## 7. Token rotation

Browser tokens (`xoxc`/`xoxd`) refresh when you log out of Slack. If you see `invalid_auth` errors:
1. Re-extract both tokens (steps 2–3).
2. Update `~/.claude.json`.
3. Restart Claude Code.

For longer stability, switch to `xoxp` (User OAuth) — see [korotovsky auth doc](https://github.com/korotovsky/slack-mcp-server/blob/master/docs/01-authentication-setup.md).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Tool not found `conversations_add_message` | MCP not registered or named differently | Check `~/.claude.json` server name = `slack-mcp` |
| `Channel restricted by SLACK_MCP_ADD_MESSAGE_TOOL` | Channel not in whitelist | Add channel ID to env or set to `true` |
| URL still doesn't unfurl | `SLACK_MCP_ADD_MESSAGE_UNFURLING` missing or domain not whitelisted | Add `github.com` to the env var |
| `invalid_auth` | Token expired | Re-extract `xoxc`/`xoxd` from browser |
| Unfurl shows but no preview | GitHub Slack app not subscribed | Run `/github subscribe everfit/<repo>` in `#backend-review-code` |
