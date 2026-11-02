# QA Report: ef-logwork Git Activity Collector

**Date:** 2026-10-06  
**Test Run Duration:** 2.827s (real-data smoke)  
**Environment:** macOS darwin, Node v22, zsh, gh CLI auth'd, Asia/Saigon TZ

---

## Test Execution Results

### Unit & Integration Tests
- **git-activity.test.cjs:** 23 passed, 0 failed ✅
- **worktree.test.cjs (regression):** 82 passed, 0 failed ✅

All tests completed successfully with no failures.

---

## Phase-01 Spec Coverage

**Spec Step 8 requirements checklist:**

| Requirement | Test Name | Status |
|-------------|-----------|--------|
| 2026-10-06T08:00 +07:00 included | "2026-10-06T08:00 +07:00 included" | ✅ |
| 2026-10-05T23:30 and 2026-10-07T00:10 +07:00 excluded | "2026-10-05T23:30 and 2026-10-07T00:10 +07:00 excluded" | ✅ |
| TZ conversion (-07:00 bucket to +07:00) | "2026-10-05T18:00-07:00 (= 10-06 08:00 VN) included and shown in +07:00" | ✅ |
| Author date bucketing, committer date after | "author 10-06, committer 10-08 (rebased) included" | ✅ |
| Card from subject | "card from subject" | ✅ |
| Card from branch ref only | "card from branch ref only" | ✅ |
| No card → unmatched | "no card → unmatched (UTF-8 is not a card)" | ✅ |
| Other author excluded | "other author's commit excluded" | ✅ |
| Merge commits excluded | "merge commit excluded" | ✅ |
| Same subject in 2 repos → 1 subject, 2 repos | "same subject in 2 repos → 1 subject, 2 repos" | ✅ |
| Cards sorted by firstAt | "cards sorted by firstAt" | ✅ |
| Missing root → errors[], exit 0 | "missing root → errors[], exit 0" | ✅ |
| Bad --date → exit 2 | "--date=2026-13-01 → exit 2" | ✅ |
| bucketReviews filtering | "bucketReviews: other login, out of window, own PR dropped; latest per PR kept" | ✅ |
| stripSubject cleanup | "stripSubject('fix(truecoach): UP-79399 key cache (#121)') → 'key cache'" | ✅ |

**Result:** All 14 spec requirements verified; test coverage complete.

---

## Exploratory Edge Case Testing

Run ad-hoc in isolated temp directory under scratchpad. Findings:

### Edge Case 1: Worktree Repo (.git is a file)
- **Scenario:** Repo within a main checkout, accessed via worktree link
- **Result:** ✅ Both commits collected (UP-100 main, UP-101 worktree)
- **Finding:** `.git` file detection works correctly; worktree structure fully supported

### Edge Case 2: Root is itself a repo
- **Scenario:** Pass repo directory as --roots (not just its parent)
- **Result:** ✅ Commits collected (UP-102)
- **Finding:** Self-repo detection in `discoverRepos` works; behavior matches spec

### Edge Case 3: Repo with no user.email, no --author
- **Scenario:** Git repo has no user.email configured and no --author override
- **Result:** ✅ Gracefully reported in errors[] with message "no user.email (pass --author)"
- **Finding:** Error handling matches spec; doesn't throw

### Edge Case 4: Different timezone (-07:00)
- **Scenario:** Commit at 2026-10-06T23:00:00-07:00 (midnight UTC 2026-10-07)
- **Result:** ✅ Commit collected (UP-103)
- **Finding:** TZ bucketing works for non-default zones; conversion correct

### Edge Case 5: Subject with two card IDs
- **Scenario:** "fix: UP-104 merges UP-105 functionality"
- **Result:** ✅ First card (UP-104) extracted; UP-105 ignored
- **Finding:** `extractCard` correctly prefers first match; expected behavior per spec

### Edge Case 6: Card in merged non-tip commit
- **Scenario:** Create branch `dev_s18_26.feat/UP-106`, merge back with generic message
- **Result:** ✅ Card collected (UP-106) from the branch commit (not merge commit)
- **Finding:** `--no-merges` correctly filters merge commits; branch card found

### Edge Case 7: --author override
- **Scenario:** Repo has `globalme@everfit.io`, pass `--author=override@everfit.io`
- **Result:** ✅ No cards collected (0 commits matched the override email)
- **Finding:** Author filtering correctly uses --author flag when provided

### Edge Case 8: Empty root (no repos)
- **Scenario:** Pass a directory with no repos inside
- **Result:** ✅ Returns valid JSON: cards=[], reviews=[], unmatched=[], errors=[]
- **Finding:** Graceful handling of empty roots; no errors recorded

**Summary:** All 8 edge cases passed without errors or unexpected behavior.

---

## Real-Data Smoke Test

**Command:** `node git-activity.cjs --date=2026-10-05`  
**Budget:** < 5s  
**Actual Time:** 2.827s ✅

### Expected Findings
- UP-79399 present
- UP-79336 present
- Zero commits from other authors

### Actual Results
```
Cards collected:    2 (UP-79399, UP-79336)
Commits on day:     4 total
  - UP-79399:       2 commits (trainerize-migration-tool)
  - UP-79336:       2 commits (trainerize-migration-tool)
Unmatched:          0
Errors:             0
Other-authored:     0 ✅
```

**Finding:** ✅ Real data smoke test passed; both expected cards found with no cross-authored commits.

---

## Performance Analysis

| Test Suite | Pass/Fail | Exec Time |
|------------|-----------|-----------|
| git-activity.test.cjs | 23/0 | ~1s |
| worktree.test.cjs | 82/0 | ~2s |
| Smoke test (real data, 2026-10-05) | 2 cards ✅ | 2.827s |

**Performance Budget Assessment:** ✅ All under budget. Real-data smoke at 2.827s < 5s requirement.

---

## Code Coverage Assessment

**Unit functions tested:**
- parseArgs (date validation, tz validation, defaults)
- vnDayWindow (half-open window, tz handling)
- extractCard (subject first, branch refs, non-card filters)
- stripSubject (prefix removal, card stripping, PR suffix removal)
- groupCommits (windowing, dedup, sorting)
- bucketReviews (login/window filtering, latest-per-PR logic)

**Integration paths tested:**
- CLI exit codes (0, 2)
- JSON output shape
- Day bucketing with author/committer date split
- Worktree discovery (.git file support)
- PR review collection via stub gh
- Error collection (missing root, gh auth fail, no email)
- Multi-repo dedup by subject
- Merge commit exclusion

**Coverage Gap Analysis:** No significant gaps. Tested:
- Happy path (cards found, repos scanned, reviews collected)
- Error cases (missing roots, auth failures, invalid dates)
- Boundary conditions (day window edges, tz conversions)
- Deduplication logic
- Field extraction and filtering

---

## Critical Issues Found

**None.** All tests pass; no bugs identified.

---

## Recommendations

1. **Commit when ready:** Implementation is production-ready based on test results.
2. **Monitor in Phase 2:** Real-data performance on larger repo sets (>25) should be tracked.
3. **gh rate limits:** Consider caching gh login result if script runs multiple times in one session.

---

## Unresolved Questions

None.

