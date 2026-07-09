# `rk:ef-ship` — Quickstart cho team

Skill này biến branch feature → PR + post Slack notification chỉ với 1 câu lệnh. Đọc 5 phút là dùng được ngay.

## Skill này làm gì?

```
Branch feature (sẵn có changes)
        ↓
  /rk:ef-ship --slack
        ↓
Stage all → Commit → Push (set upstream) → Create PR (assign @me)
        ↓
Auto fill PR body (chain rk:ef-pr-description)
        ↓
Post Slack: <@backend> <mentor> <PR-URL> vào #backend-review-code
```

**Format commit subject** (parse từ branch name + feature scope user nhập):
```
<type>(<feature>): <CARD-ID> <slug>
```
VD: `feat(auth): UP-70961 auth-refresh`

## Prerequisites (1 lần)

| # | Yêu cầu | Verify |
|---|---|---|
| 1 | GitHub CLI cài + logged in | `gh auth status` → phải show "Logged in to github.com as ..." |
| 2 | Branch tạo theo format `dev_<sprint>.<type>/<CARD-ID>-<slug>` | Dùng `/rk:ef-branch-name <jira-link>` để generate |
| 3 | Repo có branch `develop` trên remote | `git ls-remote --heads origin develop` → phải có output |
| 4 | (Optional) Slack MCP korotovsky cho URL unfurl | `/mcp` → thấy `slack-mcp` connected |

Nếu thiếu #4 thì skill vẫn chạy được bằng bundled `claude.ai_Slack` MCP — chỉ là URL không tự render card preview, skill in URL ra terminal để bạn paste tay.

## First-time setup

### Bước 1 — Set default mentor (1 lần)

Mentor sẽ được tag ở mọi lần ship. Format: Slack **display name** (như hiện trong chat, vd `Long (BE)`).

```
/rk:ef-ship --slack-set-default-mentors="Long (BE)"
```

Skill resolve `Long (BE)` → User ID + email, lưu vào `memory/ef_ship_slack.md` của repo. Lần sau không phải nhập lại.

Đổi default sau này:
```
/rk:ef-ship --slack-set-default-mentors="Duy Le (BE),Trung Huynh (BE)"   # max 3 người
/rk:ef-ship --slack-clear-default-mentors                                  # xóa default
```

### Bước 2 — (Optional) Cài Slack MCP để có unfurl

Nếu muốn URL render thành card preview trong Slack: làm theo [slack-mcp-setup.md](slack-mcp-setup.md). 

**TL;DR:**
1. Mở Slack web → DevTools → Console → paste JS lấy `xoxc-...` token
2. DevTools → Application → Cookies → copy cookie `d` (`xoxd-...`)
3. Thêm vào `~/.claude.json` block `mcpServers.slack-mcp` với 2 token + `SLACK_MCP_ADD_MESSAGE_TOOL=C05F65TBB9P` + `SLACK_MCP_ADD_MESSAGE_UNFURLING=github.com`
4. Restart Claude Code → `/mcp` verify

## Daily workflow

### Scenario 1 — Ship feature mới (default flow)

```bash
# Trên branch feature, có working-tree changes
/rk:ef-ship --slack
```

Skill sẽ:
1. Parse branch → extract type/card/slug
2. Hỏi `feature` (vd: `auth`)
3. Show plan + files staged → confirm
4. Commit + push + tạo PR (assign bạn) — body có sẵn 1 dòng summary ngắn (`<CARD-ID> — <slug>`)
5. Chain `rk:ef-pr-description` expand dòng summary thành full body
6. Post Slack `<@backend> <@Long (BE)> <PR-URL>` vào `#backend-review-code`
7. Print summary block

### Scenario 2 — Ship draft PR (chưa ready review)

```bash
/rk:ef-ship --slack --draft
```

PR tạo ở chế độ draft → reviewer biết chưa ready. Vẫn post Slack.

### Scenario 3 — Ship + override mentor cho ship này

```bash
/rk:ef-ship --slack-mentors="Duy Le (BE),Trung Huynh (BE)"
```

Default mentor bị override **chỉ ship này**, memory không đổi.

`--slack-mentors` đã imply `--slack` → không cần pass cả 2.

### Scenario 4 — Ship nhanh không hỏi confirm

```bash
/rk:ef-ship --slack --yes
```

Bypass gate "Proceed?". Dùng khi bạn chắc chắn changes đã sẵn sàng.

### Scenario 5 — Ship không post Slack

```bash
/rk:ef-ship                # không pass --slack
```

Chỉ commit + push + PR + fill body. Không động Slack.

### Scenario 6 — Re-ship cùng branch (commit thứ 2)

Cứ chạy `/rk:ef-ship --slack` lại. Skill detect:
- Branch đã có upstream → push thêm commit mới
- PR đã exist → skip `gh pr create`, vẫn chain `rk:ef-pr-description` + post Slack lại

Feature scope được nhớ trong memory per-branch — không hỏi lại lần 2.

### Scenario 7 — Dry-run xem plan trước

```bash
/rk:ef-ship --slack --dry-run
```

In plan + planned commands, không chạy gì. An toàn để preview.

## Flags cheatsheet

| Flag | Tác dụng |
|---|---|
| `--feature=<scope>` | Skip prompt scope, set thẳng |
| `--pr-summary=<text>` | 1 dòng mô tả PR (body lúc tạo). Bỏ qua → auto từ branch: `<CARD-ID> — <slug>` |
| `--draft` | Tạo PR ở draft mode |
| `--no-desc` | Không chain `rk:ef-pr-description` (body chỉ còn 1 dòng summary ngắn) |
| `--assignee=<user>` | Assign GitHub user khác (default `@me`) |
| `--no-assign` | Không assign ai |
| `--slack` | Bật Slack post |
| `--slack-channel=<name>` | Override channel (default `#backend-review-code`) |
| `--slack-group=<group>` | Override group ping (default `@backend`) |
| `--slack-mentors=<n1,n2,n3>` | Mentors cho ship này (1-3 display names) |
| `--slack-set-default-mentors=<list>` | Lưu default mentor, không hỏi lần sau |
| `--slack-clear-default-mentors` | Xóa default mentor |
| `--yes` | Skip confirmation gate |
| `--dry-run` | Print plan, không chạy |

Bất kỳ flag `--slack-*` nào cũng auto-enable Slack post → không cần `--slack` riêng.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `refuse on protected branch develop` | Đang ở `develop`/`main`/`staging`/`release/*` | Tạo branch mới: `/rk:ef-branch-name <jira-link>` |
| `nothing to ship` | Không có changes + không có unpushed commits | Code gì đi rồi quay lại |
| `gh: command not found` | GitHub CLI chưa cài | `brew install gh` rồi `gh auth login` |
| `Push rejected: non-fast-forward` | Branch behind remote | `git pull --rebase origin <branch>` rồi re-ship |
| `User '<name>' not found in workspace` | Display name sai/typo | Check chính xác display name trên Slack profile |
| Slack post fail nhưng PR đã tạo | Slack lỗi không fail toàn ship | OK — PR đã có, paste link Slack tay nếu cần |
| URL không unfurl thành card | Đang dùng bundled MCP (chưa cài korotovsky) | Cài Slack MCP theo `slack-mcp-setup.md` để có unfurl native, hoặc paste URL tay |
| Token `xoxc`/`xoxd` expired | Logout Slack | Re-extract token (xem `slack-mcp-setup.md`) |

## Related skills

- [[rk:ef-branch-name]] — tạo branch feature từ Jira card link
- [[rk:ef-pr-description]] — auto chain sau ship, fill body từ code + Jira
- [[rk:ef-pr-comment]] — post inline review comment lên PR
- [[rk:git]] — fallback cho smart-split commits (nếu 1 commit không đủ)

## Memory files

Skill lưu state tại:

| File | Per | Nội dung |
|---|---|---|
| `memory/last_feature_<branch>.md` | branch | `<feature>` đã dùng — re-ship cùng branch không hỏi lại |
| `memory/ef_ship_slack.md` | repo | `group` + `default_mentors` + `mentor_roster` cache |

Xóa file = reset state, lần sau skill hỏi lại.

## Cần thêm support?

- Bug/feature request: PR vào repo `tuannguyen-everfit/rock288_claude_plugin`
- Slack: ping `@Tuan Nguyen` (#backend-review-code)
