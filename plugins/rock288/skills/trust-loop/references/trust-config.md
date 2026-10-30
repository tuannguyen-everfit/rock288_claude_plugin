# `.claude/trust.json`

Per-repo verification gates for `/rk:trust-loop`. Committed with the repo, so every contributor's session runs the same tiers.

```json
{
  "version": 1,
  "stack": "go",
  "base_branch": "develop",
  "protected_branches": ["main", "master", "develop"],
  "tiers": [
    { "name": "fmt",  "cmd": "! gofmt -l . | grep ." },
    { "name": "vet",  "cmd": "go vet ./..." },
    { "name": "lint", "cmd": "make lint" },
    { "name": "unit", "cmd": "make test" },
    { "name": "e2e",  "cmd": "make e2e", "optional": true, "timeout_s": 900 }
  ]
}
```

| Field | Meaning |
|---|---|
| `tiers[].name` | kebab-case, unique; also the log file name |
| `tiers[].cmd` | shell command run from the repo root; exit 0 = pass. Output is captured to a log. May hold scope placeholders (below) |
| `tiers[].optional` | a failure is recorded but does not block the receipt; can be skipped with `--skip=<name>` |
| `tiers[].timeout_s` | kill the tier after N seconds (counts as a failure) |
| `base_branch`, `protected_branches`, `stack` | informational for the loop (branching, hand-off); not used by `verify-change` |

Tiers run in order, all of them, so one run shows every failure. Put the fast ones first.

## `deploy` (optional, for `/rk:pr-follow-up`)
How the merged PR reaches dev, so the follow-up can tell when dev runs it. Not used by `verify-change` and not part of the receipt.

```json
"deploy": {
  "channel": "C06HA7VQHNZ",
  "max_run_min": 15,
  "pipelines": {
    "apps/notification/": "challenger-notif-dev-ap-se-1-cicd-codepipeline",
    "apps/challenger/": "challenger-service-dev-ap-se-1-cicd-codepipeline",
    "*": ["challenger-service-dev-ap-se-1-cicd-codepipeline", "challenger-notif-dev-ap-se-1-cicd-codepipeline"]
  }
}
```

| Field | Meaning |
|---|---|
| `channel` | Slack channel the AWS CodePipeline bot posts to (default `#non-prod-ci-cd`, `C06HA7VQHNZ`) |
| `max_run_min` | longest a pipeline run takes, with margin; a success only proves the deploy when it lands this long after the merge (default 35) |
| `pipelines` | changed-file path prefix → pipeline name(s); the longest prefix wins, `"*"` covers every other file |

`node <pr-follow-up>/scripts/deploy-signal.cjs pick` prints the pipelines for the current branch.

Where `pick` looks: `deploy` here first, else the clone's own `<git common dir>/rk-trust/deploy.json` (same three fields, no `deploy` wrapper). Write that file with `deploy-signal.cjs save --pipelines '<json map>' [--channel <id>] [--max-run-min <n>]` when this file is tracked by the repo: adding `deploy` to a tracked `trust.json` would ride along in the PR. It is local to the clone (every worktree of it reads it); another clone of the same repo saves its own.

## Scoped tiers (run only what the change touches)
A full suite on every verify is slow. Placeholders in `cmd` expand to the change set (every path that differs from HEAD, plus untracked files), shell-quoted:

| Placeholder | Expands to |
|---|---|
| `{files}` | every changed file that still exists |
| `{files:ts,tsx}` | changed files with these extensions |
| `{go_packages}` | `./<dir>` of each package holding a changed `.go` file |

Nothing in scope (a docs-only change, or `--baseline` on a clean base) → the tier passes without running; the receipt records `scope: "empty"` and the expanded command as `ran`.

```json
{ "name": "unit", "cmd": "npx jest --findRelatedTests {files:ts,tsx} --maxWorkers=50% --passWithNoTests" },
{ "name": "unit", "cmd": "go test -race -count=1 {go_packages}" },
{ "name": "lint", "cmd": "npx eslint {files:ts,tsx}" }
```
- `jest --findRelatedTests` runs the changed spec files plus every spec that imports a changed source file, so a regression in an existing test still shows. Prefer it over "new tests only".
- `{go_packages}` runs the whole package of each changed file, not its importers. A change to a shared lib that other packages import → also list the importers, or keep a full-suite tier.
- The repo's CI still runs the full suite on the PR; a scoped tier is the local gate, not a replacement. When the repo's `CLAUDE.md` names a full-suite gate as mandatory before commit, keep that tier full (or ask the human).

## Machine load
Two sessions verifying at once used to run two full suites side by side and freeze the machine. `verify-change` guards against it:
- One run per machine: lock at `~/.claude/rk-trust/verify.lock` (override with `RK_TRUST_LOCK`). A second run prints `waiting: …` and starts when the first ends. A lock whose owner died is taken over, and the tier it left running is killed.
- Tier env: `NX_PARALLEL=1` and `GOFLAGS` gets `-p=<half the cores>`, unless the env already sets them.
- Each tier runs in its own process group; on timeout, on SIGINT/SIGTERM/SIGHUP, and when the tier exits, the whole group is killed, so no `go test`, jest worker or server outlives it.

Runners that pick their own worker count still need a cap in `cmd`: jest via nx → `npx nx affected -t test --maxWorkers=50%`, plain jest → `jest --maxWorkers=50%`, vitest → `--maxWorkers=50%`.

## Choosing tiers
- Mirror the repo's own mandatory gates (`CLAUDE.md`, pre-commit hooks, CI). `init-config.cjs` only drafts from the stack; the human confirms.
- A tier must be deterministic and runnable locally without secrets. Something that needs shared infra or credentials is runtime evidence for the PR, not a tier.
- Slow but valuable (e2e on containers) → `optional: true` with a `timeout_s`.
- Test runners that default to every core (jest, vitest) → cap them in `cmd` (see "Machine load").
- Editing a tier invalidates existing receipts (the receipt stores a hash of the tier list).

## Where things go
- Receipts: `<git dir>/rk-trust/receipts/<fingerprint>.json` (+ `latest.json`). Per worktree, never committed.
- Tier logs: `<git dir>/rk-trust/evidence/<fingerprint>/<tier>.log`; baseline runs under `rk-trust/baseline/`.
- Find the git dir: `git rev-parse --git-path rk-trust`.
