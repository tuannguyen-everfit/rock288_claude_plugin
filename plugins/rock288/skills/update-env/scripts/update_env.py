#!/usr/bin/env python3
"""Sync default.env with env vars actually used in code.

Pattern: everfit-style Node.js repos (everfit-api, metric-service, file-service)
- Joi schemas in common/config/*.js declare typed env vars with optional defaults
- Direct process.env.X usages scattered across the codebase

Usage:
  python3 update_env.py --source <repo> [--env-file <path>] [--write] [--report <path>]
"""

import argparse
import os
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

KEY_RE = re.compile(r"^\s*([A-Z][A-Z0-9_]+)\s*:\s*joi\.", re.MULTILINE)
PROCESS_ENV_RE = re.compile(r"process\.env\.([A-Z][A-Z0-9_]+)")
ENV_LINE_RE = re.compile(r"^\s*(#\s*)?([A-Z][A-Z0-9_]+)\s*=")
EXTENSIONS = {".js", ".cjs", ".mjs"}
SCAN_EXCLUDE_DIRS = {
    "node_modules", "coverage", "data", "_templates", ".git",
    "common/config", "conf", "dist", "build", "tmp", ".next",
}


def find_default(line_block: str) -> str:
    """Extract the literal inside .default(...) for a Joi key block.

    line_block is the slice from the key declaration up to the next key or `}`.
    Returns a normalized env-file value, or '' if not extractable.
    """
    idx = line_block.find(".default(")
    if idx < 0:
        return ""
    start = idx + len(".default(")
    depth = 1
    i = start
    while i < len(line_block) and depth > 0:
        ch = line_block[i]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                break
        i += 1
    raw = line_block[start:i].strip()
    # Strip trailing comma/whitespace
    raw = raw.rstrip(", \t\n")
    # String literal
    if (raw.startswith("'") and raw.endswith("'")) or (raw.startswith('"') and raw.endswith('"')):
        return raw[1:-1]
    # Boolean / number
    if raw in ("true", "false") or re.fullmatch(r"-?\d+(\.\d+)?", raw):
        return raw
    # Complex (new Date(...), [], {}, function ref) — skip
    return ""


def parse_joi_file(path: Path):
    """Return list of (KEY, default_value, has_complex_default) for one config file."""
    text = path.read_text(encoding="utf-8", errors="replace")
    results = []
    matches = list(KEY_RE.finditer(text))
    for i, m in enumerate(matches):
        key = m.group(1)
        # Slice from end of this key match to start of next key (or +500 chars)
        end = matches[i + 1].start() if i + 1 < len(matches) else min(m.end() + 800, len(text))
        block = text[m.end():end]
        # Stop at `})` (end of joi.object) if present in the block
        obj_end = block.find("})")
        if obj_end >= 0:
            block = block[:obj_end]
        default_val = find_default(block)
        has_complex = ".default(" in block and not default_val
        results.append((key, default_val, has_complex))
    return results


def scan_joi_configs(source: Path):
    """Map: KEY -> {file, default_value, has_complex_default}."""
    config_dir = source / "common" / "config"
    out = {}
    if not config_dir.is_dir():
        return out
    for js in sorted(config_dir.glob("*.js")):
        if js.name == "index.js":
            continue
        for key, default, complex_ in parse_joi_file(js):
            if key not in out:
                rel = js.relative_to(source).as_posix()
                out[key] = {"file": rel, "default": default, "complex": complex_}
    return out


def scan_process_env(source: Path):
    """Map: KEY -> set of relative file paths."""
    keys = defaultdict(set)
    for root, dirs, files in os.walk(source):
        rel_root = Path(root).relative_to(source).as_posix()
        # Prune excluded dirs (match by suffix path so common/config matches)
        dirs[:] = [
            d for d in dirs
            if d not in SCAN_EXCLUDE_DIRS
            and (rel_root + "/" + d).lstrip("/") not in SCAN_EXCLUDE_DIRS
        ]
        for f in files:
            if Path(f).suffix not in EXTENSIONS:
                continue
            full = Path(root) / f
            try:
                text = full.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            for m in PROCESS_ENV_RE.finditer(text):
                keys[m.group(1)].add(full.relative_to(source).as_posix())
    return keys


def parse_env_file(path: Path):
    """Return (active_keys, commented_keys, raw_lines)."""
    if not path.exists():
        return set(), set(), []
    raw = path.read_text(encoding="utf-8", errors="replace").splitlines()
    active, commented = set(), set()
    for line in raw:
        m = ENV_LINE_RE.match(line)
        if not m:
            continue
        if m.group(1):
            commented.add(m.group(2))
        else:
            active.add(m.group(2))
    return active, commented, raw


def build_append_block(missing_by_file, joi_map):
    """Build the text block to append to default.env."""
    lines = ["", f"# === Added by rk:update-env on {datetime.now():%Y-%m-%d %H:%M} ==="]
    # Stable order: config files alphabetical, then ungrouped
    grouped_files = sorted(f for f in missing_by_file if f != "__ungrouped__")
    for f in grouped_files:
        lines.append(f"# --- {f} ---")
        for key in sorted(missing_by_file[f]):
            info = joi_map.get(key, {})
            if info.get("complex"):
                lines.append(f"# complex default — see {info['file']}")
            lines.append(f"{key}={info.get('default', '')}")
        lines.append("")
    if "__ungrouped__" in missing_by_file:
        lines.append("# --- process.env (ungrouped) ---")
        for key in sorted(missing_by_file["__ungrouped__"]):
            lines.append(f"{key}=")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_report(source, joi_map, grep_map, env_active, env_commented,
                  missing_by_file, orphans):
    total_joi = len(joi_map)
    total_grep = len(grep_map)
    overlap = len(set(joi_map) & set(grep_map))
    total_missing = sum(len(v) for v in missing_by_file.values())
    out = []
    out.append(f"# Env Sync Report — {source.name}")
    out.append(f"_Generated: {datetime.now():%Y-%m-%d %H:%M:%S}_")
    out.append("")
    out.append("## Summary")
    out.append(f"- Joi schema keys: **{total_joi}**")
    out.append(f"- process.env grep keys: **{total_grep}** ({overlap} also in Joi)")
    out.append(f"- default.env keys: active={len(env_active)}, commented={len(env_commented)}")
    out.append(f"- **Missing in default.env: {total_missing}**")
    out.append(f"- **Orphans in default.env: {len(orphans)}**")
    out.append("")
    if missing_by_file:
        out.append("## Missing keys (will be appended)")
        for f in sorted(missing_by_file):
            label = f if f != "__ungrouped__" else "process.env (ungrouped)"
            out.append(f"### {label}")
            for key in sorted(missing_by_file[f]):
                info = joi_map.get(key, {})
                default = info.get("default", "")
                tag = " _(complex default)_" if info.get("complex") else ""
                out.append(f"- `{key}={default}`{tag}")
            out.append("")
    if orphans:
        out.append("## Orphans (in default.env, not referenced in code)")
        for key in sorted(orphans):
            out.append(f"- `{key}`")
        out.append("")
        out.append("_Not auto-removed. Verify manually before deleting._")
    return "\n".join(out)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--source", default=os.getcwd(), help="Repo root (default: cwd)")
    p.add_argument("--env-file", default=None, help="Env file (default: <source>/default.env)")
    p.add_argument("--write", action="store_true", help="Append missing keys (default: dry-run)")
    p.add_argument("--report", default=None, help="Path to write markdown report")
    args = p.parse_args()

    source = Path(args.source).resolve()
    if not source.is_dir():
        sys.exit(f"Source not found: {source}")
    env_file = Path(args.env_file) if args.env_file else source / "default.env"

    joi_map = scan_joi_configs(source)
    grep_map = scan_process_env(source)
    env_active, env_commented, _ = parse_env_file(env_file)
    env_keys = env_active | env_commented

    declared = set(joi_map) | set(grep_map)
    missing = declared - env_keys
    orphans = env_keys - declared

    # Group missing by source file (Joi config first, else ungrouped)
    missing_by_file = defaultdict(set)
    for key in missing:
        if key in joi_map:
            missing_by_file[joi_map[key]["file"]].add(key)
        else:
            missing_by_file["__ungrouped__"].add(key)

    report = render_report(source, joi_map, grep_map, env_active, env_commented,
                           missing_by_file, orphans)
    print(report)

    if args.report:
        Path(args.report).parent.mkdir(parents=True, exist_ok=True)
        Path(args.report).write_text(report, encoding="utf-8")
        print(f"\nReport written: {args.report}")

    if missing and args.write:
        block = build_append_block(missing_by_file, joi_map)
        with env_file.open("a", encoding="utf-8") as fh:
            fh.write(block)
        print(f"\nAppended {sum(len(v) for v in missing_by_file.values())} keys to {env_file}")
    elif missing:
        print("\n[dry-run] Use --write to append missing keys.")
    else:
        print("\nNo missing keys. default.env is in sync.")


if __name__ == "__main__":
    main()
