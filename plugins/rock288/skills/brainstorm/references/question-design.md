# Question Design Standard

How to write `AskUserQuestion` calls the user can actually answer without asking "what do you mean?".

**Problem this solves:** terse questions ("Auth method?" → "JWT" / "Session") force the user to reconstruct the context, the trade-off, and the consequences in their head. They then guess, or stall. Every question must carry enough context to be decided **standalone**.

---

## Rule 0 — Context block BEFORE the picker

The `AskUserQuestion` UI is cramped (chip header, short labels). Do **not** put the reasoning inside it. Emit a short markdown brief in the chat message *immediately before* the tool call:

```markdown
**Decision 1/3 — Where notification state lives**

Found: `services/notify.ts` writes straight to Postgres `notifications`; no queue exists yet.
Matters because: it decides whether the send path can be retried after a crash, and whether we need a new infra component.
Blocks: the fan-out design (decision 2) depends on this answer.
```

3–6 lines max: **what was found → why this is being decided → what it blocks**. Then call the tool.

## Rule 1 — Question text states the decision AND its consequence

One sentence naming the concrete thing being decided plus what changes downstream. Not a topic label.

| ❌ Terse | ✅ Detailed |
|---|---|
| "Auth method?" | "Which auth should third-party integrators use — this decides whether we store and rotate tokens ourselves or hand that to the IdP?" |
| "Sync or async?" | "Should the export run inside the request (user waits, max ~30s) or as a background job (user polls, needs a job table + worker)?" |
| "Which DB?" | "Should leaderboard reads hit Postgres directly or a Redis sorted-set — i.e. do we accept ~200ms p99 to avoid a second datastore?" |

Length is fine — the question field is not a chip. Make it readable, not clever.

## Rule 2 — Every option description answers 4 things

1. **What it means concretely here** — name real files, tables, services, endpoints from the scout phase. Not generic textbook description.
2. **Main win** — quantified when possible (ms, $, LOC, days, # of moving parts).
3. **Main cost / risk** — what you now have to maintain, migrate, or get wrong.
4. **Effort** — rough size (`~2h`, `~1 sprint`, `touches 4 files`).

| ❌ Terse | ✅ Detailed |
|---|---|
| "Faster" | "Reads from a Redis sorted-set warmed by the existing worker; ~5ms p99 vs ~180ms now. Cost: a third invalidation path (write, delete, TTL) to keep correct. ~1.5 days." |
| "Simpler" | "Keeps the current `notify.ts` direct-write; nothing new to deploy. Cost: a crash mid-send loses the notification silently — no retry. ~0 effort, revisit if send volume >10k/day." |

Aim 1–3 sentences, roughly ≤300 chars — long enough to decide, short enough to read in a terminal.

## Rule 3 — Recommend, don't survey

Put the recommended option **first** and suffix its label with `(Recommended)`. Then say why in its description — the recommendation is your job as advisor; a neutral menu pushes the analysis work back onto the user.

## Rule 4 — Show the artifact with `preview`

When the choice is a concrete shape — schema, API payload, folder layout, UI arrangement, config — put it in the option's `preview` field so the user compares real artifacts instead of adjectives. Single-select only; markdown/monospace.

## Rule 5 — Batching and ordering

- Max 4 questions per call; **one decision per question**.
- Order by dependency: decisions that constrain later ones go first. If Q2's sensible options depend on Q1's answer, split into two calls.
- Group only genuinely independent decisions into one call.
- `multiSelect: true` only when options really can coexist (e.g. "which platforms to support").

## Rule 6 — Mirror the user's language

Ask in whatever language the user is writing in. Vietnamese prompt → Vietnamese question, labels, and descriptions. Keep technical terms in English (JWT, worker, sorted-set) — don't translate them awkwardly.

```
❌ "Auth method?" → JWT / Session
✅ "Integrator bên thứ 3 nên auth bằng cách nào — quyết định này ảnh hưởng việc mình có phải tự lưu và rotate token hay đẩy sang IdP?"
   • "JWT tự phát hành (Recommended)" — Dùng lại `auth/jwt.ts` sẵn có, không thêm service. Đổi lại: phải tự làm refresh + revoke list. ~2 ngày.
   • "OAuth qua Auth0" — Auth0 lo token lifecycle, revoke sẵn. Đổi lại: thêm vendor, ~$70/tháng, migrate 3 endpoint hiện tại. ~1 tuần.
```

## Rule 7 — Don't ask what you can find out

Before asking, check: is this answerable by reading the code, the docs, or git history? If yes, go read it. Never spend a question on:

- facts in the repo (current stack, existing table, how X is wired)
- yes/no with an obvious default (pick it, state the assumption, move on)
- permission to proceed ("shall I continue?")
- preferences that don't change the design

## Self-check before every `AskUserQuestion` call

- [ ] Context block emitted above the call (found / matters / blocks)
- [ ] Question text names the decision **and** its downstream consequence
- [ ] Every option description has: concrete meaning here, win, cost, effort
- [ ] Recommended option is first and labelled
- [ ] `preview` used if the choice is a concrete artifact
- [ ] One decision per question; dependent decisions split across calls
- [ ] Language matches the user's
- [ ] Nothing here could have been answered by reading the code
