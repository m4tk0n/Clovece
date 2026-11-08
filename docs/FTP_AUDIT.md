# Read-only FTP audit

Workflow: Actions → Read-only FTP audit → Run workflow.

## What it does

- Connects with the existing GitHub Actions secrets FTP_SERVER, FTP_USERNAME and FTP_PASSWORD.
- Reads directory listings and file metadata only (relative path, size and FTP modification timestamp).
- Compares the FTP inventory in /clovece/ with files configured for deployment from main.
- Produces ftp-audit.md and ftp-audit.json as artifact clovece-ftp-audit, retained for 14 days.

## Strict safety limits

- Read-only: no upload, delete, rename, chmod, mkdir, or remote file-content download.
- Never reads or reports .env or .env.* other than the tracked template .env.dist.
- Does not enter runtime/private directories: .git, .github, storage, sessions, cache, logs, backup(s), uploads, private, data, database, db, node_modules, or vendor.
- Does not follow FTP symlinks.
- FTP-only files are candidates for manual review. They are never deleted automatically.
- The workflow does not print FTP credentials or the server hostname.

## FTP connection settings

It reuses the existing deploy secrets. Optional repository Actions secrets:
- FTP_PORT — defaults to 21.
- FTP_TLS — set to 1 only if the hosting account supports explicit FTPS; otherwise leave unset.

The audit currently runs manually, so it cannot connect unexpectedly on every push. A schedule can be added after the first successful report.

## Interpreting the report

- Chybí na FTP: GitHub expects the file to be deployed, but it was not found.
- Pouze na FTP: the file exists on the server but is not part of the current deploy manifest. Inspect its purpose before any removal.
- Odlišná velikost: the file exists in both places but has a different byte size. This is a warning, not proof of tampering.
- Shodná velikost: only sizes match. This audit deliberately does not download files or compare hashes, so it does not claim byte-for-byte equality.

The audit is metadata-only. It cannot detect content changes that preserve file size. Stronger integrity checking would need a narrowly scoped checksum mechanism.
