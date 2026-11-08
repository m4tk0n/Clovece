#!/usr/bin/env python3
"""Read-only FTP inventory. Never changes, deletes, or downloads remote files."""
from __future__ import annotations
import argparse, json, os, re, subprocess, sys
from datetime import datetime, timezone
from ftplib import FTP, all_errors
from pathlib import Path

SENSITIVE_DIRS = {".git", ".github", "storage", "sessions", "cache", "logs", "log", "backup", "backups", "uploads", "private", "data", "database", "db", "node_modules", "vendor"}
SKIP_PREFIXES = (".github/", "docs/", "tests/", "scripts/", "storage/", "sessions/", "cache/", "logs/", "backup/", "backups/", "uploads/", "private/", "data/", "database/", "db/", "node_modules/", "playwright-report/", "test-results/", "vendor/")
SKIP_FILES = {".env", "README.md", "package.json", "package-lock.json", "playwright.config.js"}

def safe_name(name):
    return bool(name) and name not in {".", ".."} and "/" not in name and "\\" not in name and not any(ord(c) < 32 for c in name)

def sensitive_file(name):
    return name == ".env" or (name.startswith(".env.") and name != ".env.dist")

def deployable(path):
    path = path.replace("\\", "/")
    if path.startswith("./"):
        path = path[2:]
    if not path or path.startswith(SKIP_PREFIXES):
        return False
    name = path.rsplit("/", 1)[-1]
    return name not in SKIP_FILES and not sensitive_file(name) and not any(p == ".git" or p.startswith(".git") for p in path.split("/"))

def manifest(root):
    raw = subprocess.check_output(["git", "ls-files", "-z"], cwd=root)
    result = {}
    for item in raw.split(b"\0"):
        if not item:
            continue
        path = item.decode("utf-8", "surrogateescape").replace("\\", "/")
        full = root / path
        if deployable(path) and full.is_file():
            result[path] = full.stat().st_size
    return result

def parse_list(line):
    m = re.match(r"^([bcdlps-][rwxstST-]{9})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+.{12}\s(.+)$", line)
    if m:
        mode, size, name = m.groups()
        if mode.startswith("l"):
            return None
        return ("dir" if mode.startswith("d") else "file", int(size), name)
    m = re.match(r"^\s*\d{2}-\d{2}-\d{2,4}\s+\d{1,2}:\d{2}(?:AM|PM)?\s+(<DIR>|\d+)\s+(.+)$", line, re.I)
    if m:
        value, name = m.groups()
        return ("dir", None, name) if value.upper() == "<DIR>" else ("file", int(value), name)
    return None

def connect():
    # Match .github/workflows/deploy.yml exactly:
    # same three secrets, unmodified values, plain FTP, default port 21.
    # The deploy action receives FTP_SERVER as a hostname, not a URL.
    server = os.environ["FTP_SERVER"]
    username = os.environ["FTP_USERNAME"]
    password = os.environ["FTP_PASSWORD"]

    if not server or not username or not password:
        raise RuntimeError("FTP_SERVER, FTP_USERNAME nebo FTP_PASSWORD je prázdný.")

    ftp = FTP(timeout=30, encoding="utf-8")
    try:
        ftp.connect(server, 21)
        ftp.login(username, password)
        ftp.set_pasv(True)
    except Exception:
        try:
            ftp.close()
        except Exception:
            pass
        raise
    return ftp

def inventory(ftp, root):
    ftp.cwd(root)
    files, dirs, skipped, warnings = {}, [], [], []
    def walk(rel=""):
        try:
            rows = list(ftp.mlsd())
            entries = [(f.get("type", "").lower(), f.get("size"), f.get("modify"), n) for n, f in rows]
        except all_errors:
            lines = []
            try:
                ftp.dir(lines.append)
            except all_errors as exc:
                warnings.append(f"Nelze vypsat {rel or '.'}: {type(exc).__name__}")
                return
            entries = []
            for line in lines:
                parsed = parse_list(line)
                if parsed:
                    kind, size, name = parsed
                    entries.append((kind, str(size) if size is not None else None, None, name))
        for kind, size_raw, modified, name in entries:
            if not safe_name(name) or kind in {"cdir", "pdir"}:
                continue
            path = f"{rel}/{name}" if rel else name
            if kind == "dir":
                if name.lower() in SENSITIVE_DIRS:
                    skipped.append(path + "/")
                    continue
                dirs.append(path + "/")
                try:
                    ftp.cwd(name)
                except all_errors as exc:
                    warnings.append(f"Adresář {path} nelze otevřít ({type(exc).__name__}).")
                    continue
                try:
                    walk(path)
                finally:
                    try:
                        ftp.cwd("..")
                    except all_errors:
                        raise RuntimeError("FTP nelze vrátit do nadřazeného adresáře.")
            elif kind == "file":
                if sensitive_file(name):
                    continue
                try:
                    size = int(size_raw) if size_raw not in (None, "") else None
                except (ValueError, TypeError):
                    size = None
                files[path] = {"size": size, "modified": modified or None}
            # Symlinks and unknown types are ignored and never followed.
    walk()
    return files, dirs, skipped, warnings

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-root", default=".")
    ap.add_argument("--remote-root", default="/clovece/")
    ap.add_argument("--output-dir", default="audit-output")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        assert deployable("index.php") and deployable(".env.dist")
        assert not deployable(".env") and not deployable("docs/README.md")
        assert not deployable("storage/private.json") and not deployable("scripts/ftp-audit.py")
        assert parse_list("drwxr-xr-x 2 user group 4096 Jan 01 12:00 assets")[0] == "dir"
        assert parse_list("lrwxrwxrwx 1 user group 12 Jan 01 12:00 link -> /tmp") is None
        print("PASS: FTP audit self-test")
        return
    for key in ("FTP_SERVER", "FTP_USERNAME", "FTP_PASSWORD"):
        if not os.environ.get(key):
            raise RuntimeError(f"Chybí GitHub Actions secret {key}.")
    expected = manifest(Path(args.repo_root).resolve())
    ftp = connect()
    try:
        remote, dirs, skipped, warnings = inventory(ftp, args.remote_root)
    finally:
        try: ftp.quit()
        except all_errors: ftp.close()
    expected_set, remote_set = set(expected), set(remote)
    missing, only_ftp = sorted(expected_set - remote_set), sorted(remote_set - expected_set)
    mismatch, matched = [], 0
    for path in sorted(expected_set & remote_set):
        size = remote[path]["size"]
        if size is None:
            warnings.append(f"FTP neposkytlo velikost: {path}")
        elif size != expected[path]:
            mismatch.append({"path": path, "github_size": expected[path], "ftp_size": size, "ftp_modified": remote[path]["modified"]})
        else:
            matched += 1
    report = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "mode": "read-only metadata inventory; no remote contents downloaded",
        "remote_root": args.remote_root,
        "summary": {
            "github_deploy_files": len(expected), "ftp_files_scanned": len(remote),
            "matching_size": matched, "missing_on_ftp": len(missing),
            "ftp_only": len(only_ftp), "size_mismatch": len(mismatch),
            "directories_scanned": len(dirs), "sensitive_directories_skipped": len(skipped),
            "warnings": len(warnings)
        },
        "missing_on_ftp": missing,
        "ftp_only": [{"path": p, **remote[p]} for p in only_ftp],
        "size_mismatch": mismatch,
        "ftp_files": [{"path": p, **remote[p]} for p in sorted(remote)],
        "directories": sorted(dirs), "skipped_sensitive_paths": sorted(skipped),
        "warnings": warnings
    }
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / "ftp-audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    labels = [
        ("github_deploy_files", "Soubory očekávané podle GitHubu"), ("ftp_files_scanned", "Soubory nalezené na FTP"),
        ("matching_size", "Shodná velikost"), ("missing_on_ftp", "Chybí na FTP"),
        ("ftp_only", "Pouze na FTP"), ("size_mismatch", "Odlišná velikost"),
        ("directories_scanned", "Prohledané adresáře"), ("sensitive_directories_skipped", "Citlivé adresáře přeskočeny"),
        ("warnings", "Upozornění")
    ]
    lines = ["# FTP audit Člověče, nezlob se!", "", f"- Čas UTC: {report['created_utc']}",
             f"- Kořen: {args.remote_root}", "- Režim: pouze metadata; žádný vzdálený soubor nebyl stažen, změněn ani smazán.", "", "## Souhrn", ""]
    lines += [f"- {label}: **{report['summary'][key]}**" for key, label in labels]
    sections = [
        ("Chybí na FTP", missing),
        ("Pouze na FTP – kandidáti ke kontrole, ne automaticky ke smazání", only_ftp),
        ("Odlišná velikost", [f"{x['path']} (GitHub {x['github_size']} B / FTP {x['ftp_size']} B)" for x in mismatch]),
        ("Přeskočené citlivé cesty", skipped), ("Upozornění", warnings)
    ]
    for title, values in sections:
        lines += ["", f"## {title}", ""] + ([f"- {v}" for v in values] if values else ["- Žádné"])
    (out / "ftp-audit.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False))
    print("Audit dokončen.")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"::error::FTP audit selhal: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
