#!/usr/bin/env python3
"""Find everfit-api commits that a fork repo (e.g. metric-service) hasn't picked up yet.

Two-channel discovery:

  A. Blame channel — diff shared files, blame lines that appear in everfit-api but
     not in the fork. Precise but blind to commits that only add new files, and
     hides older commits when a newer commit re-touched the same line.

  B. Dir-scan channel — enumerate non-merge commits in everfit-api within --since
     that touched any directory present in the target work-tree. Catches new-file
     features and blame-shadowed commits.

Candidates from both channels feed the same filter pipeline: drop merges, drop
commits already in target HEAD, dedupe by `git patch-id`, then run `git apply
--check` per remaining commit to label it `clean` or `manual check`. Output is a
Markdown table sorted newest-first.
"""

import argparse
import hashlib
import os
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> Optional[str]:
    try:
        return sha256_bytes(path.read_bytes())
    except OSError:
        return None


def read_at_ref(repo: Path, ref: str, relpath: str) -> Optional[bytes]:
    """Return file bytes at <ref>:<relpath>, or None if absent."""
    code, out, _ = git(["show", f"{ref}:{relpath}"], repo)
    return out if code == 0 else None


def git(
    args: List[str],
    cwd: Path,
    check: bool = False,
    input_: Optional[bytes] = None,
) -> Tuple[int, bytes, bytes]:
    proc = subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        input=input_,
        capture_output=True,
        check=False,
    )
    if check and proc.returncode != 0:
        sys.stderr.write(
            f"git {' '.join(args)} (cwd={cwd}) failed: "
            f"{proc.stderr.decode(errors='replace')}\n"
        )
    return proc.returncode, proc.stdout, proc.stderr


def list_target_files(repo: Path, scope: Optional[List[str]]) -> Set[str]:
    """Files tracked in the target work tree (whatever branch is checked out)."""
    args = ["ls-files"]
    if scope:
        args.append("--")
        args.extend(scope)
    code, out, _ = git(args, repo)
    if code != 0:
        return set()
    return {line for line in out.decode(errors="replace").splitlines() if line}


def list_files_at_ref(repo: Path, scope: Optional[List[str]], ref: str) -> Set[str]:
    """Files committed at the given ref. Used for everfit-api so caller can pin
    a branch (master / staging / develop) without touching its work tree."""
    args = ["ls-tree", "-r", "--name-only", ref]
    if scope:
        args.append("--")
        args.extend(scope)
    code, out, _ = git(args, repo)
    if code != 0:
        return set()
    return {line for line in out.decode(errors="replace").splitlines() if line}


def changed_source_lines(everfit_content: bytes, target_path: Path) -> List[int]:
    """Line numbers in the everfit version that are missing/different in target.

    Writes everfit content to a temp file then runs `git diff --no-index` against
    the target's on-disk file. `--no-index` doesn't require a repo, so cwd is irrelevant.
    """
    with tempfile.NamedTemporaryFile(suffix=target_path.suffix, delete=False) as tmp:
        tmp.write(everfit_content)
        tmp_path = Path(tmp.name)
    try:
        code, out, _ = git(
            [
                "diff",
                "--no-index",
                "--unified=0",
                "--no-color",
                "--",
                str(target_path),
                str(tmp_path),
            ],
            cwd=target_path.parent,
        )
    finally:
        try:
            tmp_path.unlink()
        except OSError:
            pass
    if code not in (0, 1) or code == 0:
        return []
    lines: List[int] = []
    cur_new = 0
    for line in out.decode(errors="replace").splitlines():
        if line.startswith("@@"):
            try:
                new_part = line.split("+", 1)[1].split(" ", 1)[0]
                cur_new = int(new_part.split(",", 1)[0]) if "," in new_part else int(new_part)
            except (IndexError, ValueError):
                cur_new = 0
            continue
        if line.startswith("+++") or line.startswith("---"):
            continue
        if line.startswith("+"):
            lines.append(cur_new)
            cur_new += 1
        elif line.startswith("-"):
            pass
        else:
            cur_new += 1
    return lines


def blame_commits(repo: Path, relpath: str, line_numbers: List[int], ref: str = "HEAD") -> Set[str]:
    """Set of commit SHAs that introduced the given line numbers in repo:relpath at ref."""
    if not line_numbers:
        return set()
    args = ["blame", "--porcelain"]
    for ln in line_numbers:
        args.extend(["-L", f"{ln},{ln}"])
    args.append(ref)
    args.extend(["--", relpath])
    code, out, _ = git(args, repo)
    if code != 0:
        return set()
    shas: Set[str] = set()
    for line in out.decode(errors="replace").splitlines():
        if not line or line.startswith("\t") or line.startswith(" "):
            continue
        parts = line.split(" ", 1)
        sha = parts[0]
        if len(sha) == 40 and all(c in "0123456789abcdef" for c in sha):
            shas.add(sha)
    return shas


def discover_commits_touching_dirs(
    repo: Path,
    ref: str,
    dirs: List[str],
    since: str,
) -> Set[str]:
    """Non-merge commits in `repo@ref` since `since` that touched any of `dirs`.

    Channel B: catches feature commits whose changes live mostly in NEW files
    under a shared module (invisible to blame on shared files) and old commits
    hidden by blame's last-touch-only behavior.

    Args are batched to keep the command line under ARG_MAX on large repos.
    """
    if not dirs:
        return set()
    shas: Set[str] = set()
    batch_size = 400
    for start in range(0, len(dirs), batch_size):
        batch = dirs[start:start + batch_size]
        args = [
            "log", "--no-merges", f"--since={since}",
            "--pretty=%H", ref, "--", *batch,
        ]
        code, out, _ = git(args, repo)
        if code != 0:
            continue
        for line in out.decode(errors="replace").splitlines():
            sha = line.strip()
            if len(sha) == 40 and all(c in "0123456789abcdef" for c in sha):
                shas.add(sha)
    return shas


def shared_dirs_from_files(shared_files: List[str]) -> List[str]:
    """Every directory (and every ancestor directory) that contains a shared file."""
    dirs: Set[str] = set()
    for rel in shared_files:
        d = os.path.dirname(rel)
        while d:
            dirs.add(d)
            d = os.path.dirname(d)
    return sorted(dirs)


def is_merge_commit(repo: Path, sha: str) -> bool:
    code, out, _ = git(["log", "-1", "--format=%P", sha], repo)
    if code != 0:
        return False
    return len(out.decode().strip().split()) > 1


def commit_in_target_history(repo: Path, sha: str) -> bool:
    """True iff `sha` is an ancestor of HEAD in `repo`.

    `cat-file -e` is too loose for forks: a forked repo still has the parent's
    objects in its DB even when the commit was never applied to a branch.
    `merge-base --is-ancestor` is the real test for "this commit is in the
    target's history".
    """
    code, _, _ = git(["merge-base", "--is-ancestor", sha, "HEAD"], repo)
    return code == 0


def commit_info(repo: Path, sha: str) -> Dict[str, str]:
    code, out, _ = git(
        ["log", "-1", "--format=%H%x1f%an%x1f%ad%x1f%s", "--date=short", sha],
        repo,
    )
    if code != 0:
        return {"sha": sha, "author": "?", "date": "?", "subject": "?"}
    parts = out.decode(errors="replace").rstrip("\n").split("\x1f")
    if len(parts) < 4:
        return {"sha": sha, "author": "?", "date": "?", "subject": "?"}
    return {"sha": parts[0], "author": parts[1], "date": parts[2], "subject": parts[3]}


def commit_files(repo: Path, sha: str) -> Set[str]:
    code, out, _ = git(["show", "--name-only", "--format=", sha], repo)
    if code != 0:
        return set()
    return {l for l in out.decode(errors="replace").splitlines() if l}


def patch_id(repo: Path, sha: str) -> Optional[str]:
    code, show_out, _ = git(["show", sha], repo)
    if code != 0:
        return None
    proc = subprocess.run(
        ["git", "patch-id"],
        cwd=str(repo),
        input=show_out,
        capture_output=True,
    )
    if proc.returncode != 0:
        return None
    parts = proc.stdout.decode().strip().split()
    return parts[0] if parts else None


def filtered_patch(repo: Path, sha: str, allowed_files: Set[str]) -> bytes:
    args = ["show", "--format=", sha, "--", *sorted(allowed_files)]
    code, out, _ = git(args, repo)
    return out if code == 0 else b""


def applies_clean(target: Path, patch: bytes) -> Tuple[bool, str]:
    if not patch.strip():
        return False, "empty patch after filtering to shared files"
    code, _, err = git(["apply", "--check"], target, input_=patch)
    if code == 0:
        return True, ""
    first_line = err.decode(errors="replace").strip().splitlines()[0:1]
    return False, first_line[0] if first_line else "apply check failed"


def default_report_path(cwd: Path, target_name: str) -> Optional[Path]:
    reports_dir = cwd / "plans" / "reports"
    if not reports_dir.is_dir():
        return None
    stamp = datetime.now().strftime("%y%m%d-%H%M")
    return reports_dir / f"sync-from-everfit-{target_name}-{stamp}.md"


def render_report(
    everfit: Path,
    target: Path,
    scope: List[str],
    shared_count: int,
    diff_count: int,
    results: List[Dict],
    everfit_ref: str = "HEAD",
) -> str:
    clean_count = sum(1 for r in results if r["clean"])
    manual_count = len(results) - clean_count
    lines: List[str] = []
    lines.append(f"# Sync Check Report — everfit-api → {target.name}")
    lines.append("")
    lines.append(f"- Source: `{everfit}` @ `{everfit_ref}`")
    lines.append(f"- Target: `{target}` @ work-tree")
    lines.append(f"- Scope: {scope or 'all'}")
    lines.append(f"- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("")
    lines.append(
        f"**Shared files:** {shared_count}  |  **Differing:** {diff_count}  |  "
        f"**Candidate commits:** {len(results)} (after dropping merges, already-applied, patch-id duplicates)"
    )
    lines.append("")
    lines.append(f"- Clean (should cherry-pick without conflict): **{clean_count}**")
    lines.append(f"- Manual check (needs adaptation): **{manual_count}**")
    lines.append("")
    lines.append("## Commits to consider (newest first)")
    lines.append("")
    lines.append("Source legend: `blame` = found via line-blame; `dir` = found via directory scan (new files / blame-shadowed); `blame+dir` = both.")
    lines.append("")
    lines.append("| Commit | Date | Author | Source | Message | Note |")
    lines.append("|---|---|---|---|---|---|")
    for r in results:
        short = r["sha"][:10]
        msg = r["subject"].replace("|", "\\|")
        note = r["note"].replace("|", "\\|")
        src = r.get("source", "blame")
        lines.append(f"| `{short}` | {r['date']} | {r['author']} | {src} | {msg} | {note} |")
    lines.append("")
    lines.append("## Per-commit detail")
    lines.append("")
    for r in results:
        lines.append(f"### `{r['sha'][:10]}` — {r['subject']}")
        lines.append(f"- Author: {r['author']}, Date: {r['date']}, Source: {r.get('source', 'blame')}")
        lines.append(f"- Note: {r['note']}")
        lines.append("- Files in target also touched by this commit:")
        for f in r["files_touched_in_target"]:
            lines.append(f"  - `{f}`")
        lines.append(f"- Cherry-pick: `cd {target} && git cherry-pick {r['sha']}`")
        lines.append("")
    return "\n".join(lines) + "\n"


def main(argv: List[str]) -> int:
    ap = argparse.ArgumentParser(description="Find everfit-api commits to cherry-pick into a fork.")
    ap.add_argument("--everfit", default="/Users/tuannguyen/Source/everfit-api")
    ap.add_argument("--target", default="/Users/tuannguyen/Source/metric-service")
    ap.add_argument("--everfit-ref", default="HEAD",
                    help="Branch/tag/commit of everfit-api to compare against (e.g. master, staging, develop). "
                         "Default: HEAD. Target side always uses the checked-out work tree.")
    ap.add_argument("--scope", action="append", default=[],
                    help="Limit comparison to a subdir (repeatable).")
    ap.add_argument("--since", default="1 year ago",
                    help="Time bound for the directory-scan channel (passed to git log --since). "
                         "Default: '1 year ago'. Set to '10 years ago' for a full sweep.")
    ap.add_argument("--no-dir-scan", action="store_true",
                    help="Disable directory-scan channel. Falls back to blame-only (v1.1 behavior).")
    ap.add_argument("--report", default=None,
                    help="Write Markdown report to this path. Default: plans/reports/... if exists, else stdout.")
    args = ap.parse_args(argv)

    everfit = Path(args.everfit).resolve()
    target = Path(args.target).resolve()
    if not (everfit / ".git").exists():
        sys.stderr.write(f"Not a git repo: {everfit}\n")
        return 2
    if not (target / ".git").exists():
        sys.stderr.write(f"Not a git repo: {target}\n")
        return 2

    scope = args.scope or None
    everfit_ref = args.everfit_ref
    sys.stderr.write(
        f"Scanning shared files between {everfit}@{everfit_ref} and {target}@work-tree...\n"
    )
    everfit_files = list_files_at_ref(everfit, scope, everfit_ref)
    target_files = list_target_files(target, scope)
    shared = sorted(everfit_files & target_files)
    sys.stderr.write(
        f"  everfit@{everfit_ref}: {len(everfit_files)} files | "
        f"target: {len(target_files)} files | shared: {len(shared)}\n"
    )

    # Diff each shared file. Keep everfit content in memory keyed by relpath so
    # we can reuse it for both the SHA comparison and the line-number extraction.
    differs: List[Tuple[str, bytes]] = []
    for rel in shared:
        t_path = target / rel
        if not t_path.is_file():
            continue
        e_content = read_at_ref(everfit, everfit_ref, rel)
        if e_content is None:
            continue
        if sha256_bytes(e_content) != sha256_file(t_path):
            differs.append((rel, e_content))
    sys.stderr.write(f"  differing: {len(differs)} files\n")

    # Channel A — blame on shared files.
    candidate_commits: Dict[str, Set[str]] = {}
    blame_sources: Set[str] = set()
    for i, (rel, e_content) in enumerate(differs, 1):
        if i % 25 == 0 or i == len(differs):
            sys.stderr.write(f"  blame {i}/{len(differs)}: {rel}\n")
        line_nums = changed_source_lines(e_content, target / rel)
        if not line_nums:
            continue
        for sha in blame_commits(everfit, rel, line_nums, everfit_ref):
            candidate_commits.setdefault(sha, set()).add(rel)
            blame_sources.add(sha)
    sys.stderr.write(f"  blame candidates: {len(candidate_commits)} commits\n")

    # Channel B — directory scan. Catches new-file commits and blame-shadowed commits.
    shared_dirs: List[str] = shared_dirs_from_files(shared) if not args.no_dir_scan else []
    dir_sources: Set[str] = set()
    if not args.no_dir_scan:
        sys.stderr.write(
            f"  dir-scan: {len(shared_dirs)} shared dirs, since='{args.since}'...\n"
        )
        extra = discover_commits_touching_dirs(everfit, everfit_ref, shared_dirs, args.since)
        new_from_dir = extra - set(candidate_commits)
        for sha in extra:
            candidate_commits.setdefault(sha, set())
            dir_sources.add(sha)
        sys.stderr.write(
            f"  dir-scan candidates: {len(extra)} (new: {len(new_from_dir)})\n"
        )

    seen_pids: Dict[str, str] = {}
    results: List[Dict] = []
    skipped_merge = 0
    skipped_already = 0
    skipped_dup = 0

    for sha, touched_files in candidate_commits.items():
        if is_merge_commit(everfit, sha):
            skipped_merge += 1
            continue
        if commit_in_target_history(target, sha):
            skipped_already += 1
            continue
        pid = patch_id(everfit, sha)
        if pid and pid in seen_pids:
            skipped_dup += 1
            continue
        if pid:
            seen_pids[pid] = sha

        info = commit_info(everfit, sha)
        cfiles = commit_files(everfit, sha)
        allowed = cfiles & set(target_files)
        if not allowed:
            # Commit only touches files that don't exist in target — likely all-new
            # files under a shared directory (channel B catches these). Surface as
            # manual check so the user can decide whether to port the new files.
            new_under_shared = sorted(
                f for f in cfiles
                if any(f.startswith(d + "/") for d in shared_dirs)
            )
            if new_under_shared:
                note = f"manual check — introduces new files under shared dirs ({len(new_under_shared)})"
            else:
                note = "manual check — commit touches no files present in target"
            clean = False
        else:
            patch = filtered_patch(everfit, sha, allowed)
            clean, err = applies_clean(target, patch)
            note = "clean" if clean else f"manual check — {err}"

        if sha in blame_sources and sha in dir_sources:
            source = "blame+dir"
        elif sha in blame_sources:
            source = "blame"
        else:
            source = "dir"

        results.append({
            **info,
            "files_touched_in_target": sorted(touched_files or allowed),
            "clean": clean,
            "note": note,
            "source": source,
        })

    sys.stderr.write(
        f"  filtered: -{skipped_merge} merge, -{skipped_already} already in target, "
        f"-{skipped_dup} patch-id duplicate → {len(results)} candidates\n"
    )

    results.sort(key=lambda r: r["date"], reverse=True)

    report = render_report(
        everfit, target, args.scope, len(shared), len(differs), results, everfit_ref
    )

    if args.report:
        report_path = Path(args.report)
    else:
        report_path = default_report_path(Path.cwd(), target.name)
    if report_path:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(report)
        sys.stderr.write(f"Report written to {report_path}\n")
    else:
        sys.stdout.write(report)

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
