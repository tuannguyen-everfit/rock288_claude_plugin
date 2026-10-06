# `--audit` — read-only compliance report

Finds what the PC dashboard will flag — empty days, short days, one-card days, tz-shifted
weekend entries, bad descriptions — before the dashboard does. **Never writes**: no
`addWorklogToJiraIssue` / `addOrEditJiraIssueWorklog` call exists on this path, and no config
write either.

## Range

| Flag | Range |
|---|---|
| `--audit` | last 10 VN working days (Mon–Fri) **before today** — today is still in progress |

"Today" = SKILL.md step 0 (`TZ=Asia/Ho_Chi_Minh date +%F`), never the conversation's date.
| `--audit=YYYY-MM-DD..YYYY-MM-DD` | explicit, inclusive, VN dates; `from ≤ to`; max 31 calendar days → else ask to narrow |

No holiday calendar: a public holiday shows as an empty working day — the hint below covers it.
An explicit range that includes today shows today as `⏳` (in progress): no ❌/⚠, and it is left
out of the totals and the expected hours.

## Steps

1. Build the ledger once for the whole range — [`worklog-ledger.md`](worklog-ledger.md)
   (single JQL + one `listJiraIssueWorklogs` per candidate card, window = whole range).
2. Bucket entries by VN `date`. For every calendar day in the range compute: day total,
   per-card totals, bad-format entries (regex + generic-What blocklist from
   [`format-rules.md`](format-rules.md)).
3. Status per day:

   | Status | When |
   |---|---|
   | ❌ | working day (Mon–Fri) with 0h |
   | ⚠ | working day under `daily_min_hours` · any card ≥ `max_card_hours_per_day` · weekend day with entries |
   | ✅ | working day ≥ `daily_min_hours` and none of the ⚠ conditions |

   Weekend days with no entries are omitted from the table.
4. Totals: `logged / (working days × daily_min_hours)` and the guideline view
   `working days × 8h × 80%`.

## Output (rendered markdown, not a code block)

```
| Ngày | Thứ | Logged | /7h | Ghi chú |
|---|---|---|---|---|
| 2026-09-29 | Mon | 0h | ❌ | ngày làm việc trống |
| 2026-09-30 | Tue | 7h 15m | ✅ | |
| 2026-10-02 | Thu | 5h | ⚠ | thiếu 2h |
| 2026-10-03 | Fri | 8h | ⚠ | UP-79399 = 8h (≥8h/card) |
| 2026-10-04 | Sat | 2h | ⚠ | weekend entry — lệch tz? |
Tổng: 54h / 70h (77%) — target ≥80% của 8h/ngày = 64h
```

`/7h` header uses the configured `daily_min_hours`. Several notes on one day → join with `; `.

Then **Sai format** — one row per bad entry:

| Ngày | Card | Time | Hiện tại | Gợi ý |
|---|---|---|---|---|
| 2026-10-06 | UP-80126 | 45m | `daily meeting` | `Ceremony – Daily standup` |

The suggestion is text only — editing is the user's call (`addWorklogToJiraIssue` with the
`worklogId`, or the Jira UI). Then one **next actions** line:

- each ❌ / short day → `/rk:ef-logwork --date=<date>`
- a 0h working day may be leave or a public holiday → log `Leave – Annual leave (approved)` /
  `Leave – Public holiday` on the shared card
- weekend entries → check the worklog's real day; a tz-shifted entry belongs to Friday/Monday

## Cross-check

Compare with the PC dashboard (Core Delivery Radar → History Table) per day; expect ≤ 15m/day
drift (dashboard refresh lag, entries logged after the audit ran).
