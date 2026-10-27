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
| `tiers[].cmd` | shell command run from the repo root; exit 0 = pass. Output is captured to a log |
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

## Choosing tiers
- Mirror the repo's own mandatory gates (`CLAUDE.md`, pre-commit hooks, CI). `init-config.cjs` only drafts from the stack; the human confirms.
- A tier must be deterministic and runnable locally without secrets. Something that needs shared infra or credentials is runtime evidence for the PR, not a tier.
- Slow but valuable (e2e on containers) → `optional: true` with a `timeout_s`.
- Editing a tier invalidates existing receipts (the receipt stores a hash of the tier list).

## Where things go
- Receipts: `<git dir>/rk-trust/receipts/<fingerprint>.json` (+ `latest.json`). Per worktree, never committed.
- Tier logs: `<git dir>/rk-trust/evidence/<fingerprint>/<tier>.log`; baseline runs under `rk-trust/baseline/`.
- Find the git dir: `git rev-parse --git-path rk-trust`.
