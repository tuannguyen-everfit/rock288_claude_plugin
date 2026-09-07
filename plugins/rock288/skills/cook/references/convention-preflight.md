# Convention Pre-flight

Run BEFORE writing the first line of implementation code (Step 3), and re-run before requesting review (Step 5). Every row below is a real lead-review finding that landed AFTER merge and cost a follow-up fix branch. Resolve each from the project's `CLAUDE.md`, `docs/code-standards*`, and — above all — the **precedent of the nearest sibling feature/module**.

## Why a pre-flight

Plans decide *what* to build. Conventions decide *where it lives, what it reuses, and what it may touch*. A plan that is correct on behaviour still gets `changes_requested` when it puts a Redis read in `services/`, appends six fields to the hottest document in the database, or hand-rolls a check the project's validator library already does.

## The checklist

| # | Question | Resolve from | Wrong (real finding) | Right |
|---|----------|--------------|----------------------|-------|
| 1 | **Layer placement** — which folder does the module reserve for this dependency? | Module tree (`cache/`, `caches/`, `helpers/`, `repositories/`…) + `CLAUDE.md` layer table | Redis key builder + read probe written as `services/check-step-up-ticket` (+ a `helpers/` key builder) | `caches/step-up-ticket/` with the key builder co-located — exactly like the sibling `caches/token-blacklist` |
| 2 | **Validation** — what does the project validate input with? | Existing `validators/` (Joi / Zod / Pydantic…) | `_.isPlainObject(body)` + `Object.keys(body).forEach(k => k.startsWith('$') && delete …)` inside a controller | A schema in `validators/<action>/` wired as middleware — even for a "tiny" guard |
| 3 | **Where does feature state live?** — own collection, or fields on a core model? | Sibling feature precedent (e.g. `coach_email_verification` is its own table) + who reads the core model unprojected | 6 mirror fields appended to `profile`: every legacy full-profile API grew, inconsistent with email verify, far harder to move once downstream consumers ship | Own collection owned by the feature module (`coach_phone_verification`, keyed by the identity it belongs to) |
| 4 | **Auth middleware tier** — what does the handler actually read from `req.user`? | Middleware inventory (`isAuthenticated` vs `isAuthenticatedLite`, `authRequired` vs `authOptional`…) + how the sibling read-only route is mounted | Read-only status GET mounted on the full `isAuthenticated` | Lightest tier that provides the props used (`isAuthenticatedLite`, same as `/api/profile/v2`) |
| 5 | **Server-side enforcement** — if the API returns an allow-list / capability / flag, WHERE is it enforced? | Design doc: name the endpoint that rejects | `supported_countries` returned; FE hides the picker; nothing rejects server-side | FE hiding = UX only. The write endpoint validates against the same list, and the design names it |
| 6 | **Error envelope** — what MUST every error response carry? | `CLAUDE.md` / error helper (e.g. `localization_code`, error enum, `request_id`) | New 400 `Invalid payload` without `localization_code` | Reuse an existing generic key or mint one — now, not "later" |
| 7 | **API documentation** — where do endpoint docs live, and when must they change? | Sibling PRs; separate doc repo (e.g. an OpenAPI repo) | Endpoint merged with no doc change | Doc change ships in the SAME changeset (paired PR / same commit; a doc-only repo may allow self-merge — check the team rule) |
| 8 | **Module isolation** — does the repository touch only its own model? | `CLAUDE.md` module-isolation rule | Feature repository reading another module's model (`everfit/model/profile`) | Own model in own repository; cross-module data via the other module's *service* |

## How to run it

1. `ls` the target module and ONE mature sibling module side by side. Note every folder the sibling has that you are not using — each is a placement decision you have not made yet.
2. For each new file, write its path in the plan **with the layer justified in one clause** ("Redis read → `caches/`").
3. For each new persisted field, name the collection and say why it is not a core model.
4. For each new endpoint, fill four cells in the plan table: middleware tier · validator file · error keys · doc location.
5. Anything you cannot resolve from the repo → ask at the plan review gate, not after merge.

Output line: `✓ Pre-flight: [N] conventions resolved - [placement|validation|state|auth|enforcement|envelope|docs|isolation]`

## Anti-rationalization

| Thought | Reality |
|---------|---------|
| "It's a 20-line service, the folder doesn't matter" | The lead's first comment was the folder. Placement is the cheapest thing to get right and the most visible thing to get wrong. |
| "A Joi schema for one guard is overkill" | Hand-rolled checks are what reviewers trust least. The schema is three lines. |
| "Adding fields to the user model is what everyone does" | Check who reads that model unprojected. Hot documents pay for every field on every read, forever. |
| "The FE hides it, so it's fine" | Client-side hiding is not a control. Name the server check, or write down why there is none. |
| "I'll add the doc / localization key in a follow-up" | Follow-ups after merge are exactly what this checklist exists to prevent. |
