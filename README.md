# rk-kit

Claude Code plugin marketplace cá nhân của `rk` — đóng gói skills, agents, hooks, output-styles và statusline thành một plugin tên `rk`.

- Marketplace manifest: [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json)
- Plugin source: [`plugins/rock288/`](plugins/rock288/) (plugin name = `rk`)
- Repo: https://github.com/tuannguyen-everfit/rock288_claude_plugin

## Cài đặt lần đầu

Trong Claude Code chạy:

```
/plugin marketplace add tuannguyen-everfit/rock288_claude_plugin
/plugin install rk@rk-kit
```

Sau khi cài, restart Claude Code (hoặc mở session mới) để các skill/hook được nạp.

## Cập nhật plugin

Mỗi khi repo này có commit mới (skill mới, fix hook, v.v.), làm theo các bước sau để kéo bản mới nhất về máy:

### Cách 1 — Dùng UI `/plugin` (khuyến nghị)

1. Trong Claude Code gõ `/plugin`.
2. Chọn **Marketplaces** → `rk-kit` → **Update** (hoặc **Refresh**).
3. Chọn **Installed plugins** → `rk` → **Update**.
4. Restart Claude Code (đóng/mở lại session) để skill mới hiển thị.

### Cách 2 — Lệnh nhanh

```
/plugin marketplace update rk-kit
/plugin update rk@rk-kit
```

Sau đó restart session.

### Cách 3 — Cài lại từ đầu (khi update bị kẹt)

```
/plugin uninstall rk@rk-kit
/plugin marketplace remove rk-kit
/plugin marketplace add tuannguyen-everfit/rock288_claude_plugin
/plugin install rk@rk-kit
```

### Kiểm tra đã update thành công

- Gõ `/plugin` → mục `rk` hiển thị commit hash mới nhất khớp với `git log -1 --oneline` ở repo này.
- Skill mới phải xuất hiện trong danh sách `Available skills` ở session mới.

## Phát triển local

Khi đang sửa skill/hook và muốn thử trước khi commit:

```bash
# Clone repo (nếu chưa có)
git clone git@github.com:tuannguyen-everfit/rock288_claude_plugin.git

# Add marketplace từ đường dẫn local
/plugin marketplace add /absolute/path/to/rock288_claude_plugin
/plugin install rk@rk-kit
```

Mỗi lần sửa file dưới `plugins/rock288/`, chạy `/plugin marketplace update rk-kit` rồi restart session để Claude Code nạp lại.

## Cấu trúc

Toàn bộ nội dung ship dưới `plugins/rock288/`:

| Thư mục | Nội dung |
|---|---|
| `skills/` | Mỗi thư mục con là 1 skill (`SKILL.md` + tuỳ chọn `references/`, `scripts/`, `assets/`) |
| `agents/` | Subagent definitions (`*.md` có frontmatter) |
| `hooks/` | Node `.cjs` hooks, wired qua `hooks.json` |
| `output-styles/` | Coding-level personas (eli5 → god) |
| `scripts/` | Python/Node utilities dùng chung |
| `statusline.cjs` | Custom statusline |

Chi tiết kiến trúc & convention xem [`CLAUDE.md`](CLAUDE.md).
