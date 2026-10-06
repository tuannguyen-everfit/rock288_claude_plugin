# Worklog format rules

Source: Confluence 3891494970 "Timesheet Logging Guideline — Core Team" §2, §4, §5, §10
(last updated 2026-09-30) + PC Slack thread C0AN2P9BFS9/p1790917312243399 (min 7h/day).

## Description format

```
[Activity] – [What specifically] – [Outcome/status if relevant]
```

- Separator is ` – ` — **en dash U+2013 with one space each side**. Never `-` or `—`.
  Normalize a user-typed ` - ` / ` — ` between segments to ` – `.
- Outcome is optional. A comma tail is fine (`QA – Execute regression for X, 2 bugs logged`).
- English, one line, no trailing period.

### Activity vocabulary (exact spelling, case-sensitive)

`Dev` · `QA` · `Review` · `Bug fix` · `Ceremony` · `Meeting` · `Support` · `Learning` · `Leave`

### Validation regex

```
^(Dev|QA|Review|Bug fix|Ceremony|Meeting|Support|Learning|Leave) – \S.{2,}?( – \S.*)?(?<!\.)$
```

(`(?<!\.)` rejects the trailing period.)

### Generic-What blocklist

The What segment (between the 1st and 2nd ` – `), trimmed, compared case-insensitively against
the whole list — a match fails validation even when the regex passes:

`coding, code, dev, meeting, test, testing, review, fix, fix bug, bug, support, work, task, learning`

## Picking the Activity + card

### Free-text keywords → shared card

When the user's item has **no card ID**, map by keyword and log on `shared_card`. Keywords
match **whole words** only (`cs` must not hit "metrics", `off` must not hit "kickoff"):

| Keywords (case-insensitive) | Activity | Default What |
|---|---|---|
| standup, daily | Ceremony | Daily standup |
| planning, refinement, grooming, retro, demo, review sprint | Ceremony | Sprint `<n>` `<keyword>` (`n` from the shared epic summary, e.g. `18-26`) |
| sync, 1:1, họp, meeting | Meeting | `<user text>` |
| support, CS, hỗ trợ | Support | `<user text>` |
| learn, training, onboarding, đọc tài liệu | Learning | `<user text>` |
| off, nghỉ, leave, phép | Leave | Annual leave (approved) |

No keyword and no card → ask which card; never guess.

### Card-based items

| Situation | Activity |
|---|---|
| Card `issuetype` = Bug | `Bug fix` |
| Any other issuetype | `Dev` |
| PR review (from `reviews[]`) | `Review` — logged on the **PR's card**, not the shared card. `card` null (PR title has no key) → ask which card |
| Meeting/discussion about a card (`1h sync UP-123`) | `Meeting` on **that card** (guideline §4 rule of thumb, §10 anti-pattern 3) |
| User typed an Activity word explicitly (`QA UP-123 …`) | keep the user's Activity |

## What + Outcome from git

- **What** = the card's first 1–2 `subjects` (already stripped of `type(scope):`, card ID,
  `(#N)`) joined with `; `, capitalized, cut to ≤ 90 chars on a word boundary.
- **No commits for the card that day** (user typed the card, or work was investigation) →
  What = card `summary` minus its leading `[Tag]` groups (`[API][TrueCoach][Workout] Migrated
  4 km distance is shown as 5 km` → `Migrated 4 km distance is shown as 5 km`); mark the row
  `(từ summary)` in the draft so the user can make it specific.
- **Outcome**:
  - `mergedPrs` non-empty → `PR #<n> merged` (several → `PRs #120, #121 merged`)
  - review `state`: `APPROVED` → `approved` · `CHANGES_REQUESTED` → `changes requested` ·
    `COMMENTED` → `commented`
  - otherwise omitted.
- Review entry: `Review – Code review PR #<n> (<repo name without owner>) – <outcome>`.

## Durations

Accept: `1h30m`, `1h 30m`, `1.5h`, `1,5h`, `90m`, `0.25h`, `45p` (VN "phút").

1. Convert to minutes.
2. Round to the nearest 15 (ties round up), minimum 15.
3. Emit Jira format `Xh Ym` — `1h 30m`, `45m`, `2h` (drop zero parts).
4. When rounding changed the value, show it in the draft: `50m→45m`.

Ambiguous items (`1h UP-1 UP-2`, two durations for one card) → ask, never split on a guess.

## Examples (guideline §5)

| ✅ Good | ❌ Not acceptable |
|---|---|
| `Dev – Implement API validation for meal plan import – PR opened` | `coding` |
| `QA – Execute regression for Autoflow Interval, 2 bugs logged` | `test` |
| `Review – Code review PR #482 (workout builder)` | `review` |
| `Bug fix – Investigate & fix calendar sync timezone issue` | `fix bug` |
| `Ceremony – Sprint 42 planning` | `meeting` |
| `Support – Answer CS question on client app login, no bug found` | `support` |
| `Leave – Annual leave (approved)` | *(empty)* |

Real rewrites seen in this team's worklogs:

| Logged | Rewrite |
|---|---|
| `daily meeting` | `Ceremony – Daily standup` |
| `dev - meeting feature friend and noti - done` | `Meeting – Walkthrough invite-friends + notification feature – done` (on the feature card if one exists) |

## Anti-patterns the validator warns on (guideline §10)

- One card ≥ `max_card_hours_per_day` (8h) in one VN day → "perfect 8h on one card".
- Meeting about a specific card logged to the shared card → suggest moving it to that card.
- Logging on a card whose status category is Done → "closed card open in a tab?".
- Hours that were not typed by the user — the skill never fills a day up to 7h by itself.
