<!-- /docs/FTP_AUDIT.md -->
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


## Triggering the audit from the live website

The root-level \`ftp.php\` endpoint is a minimal bridge to GitHub Actions. It does not perform FTP operations and does not return the audit report. It only dispatches the fixed \`ftp-audit.yml\` workflow on \`main\`.

Add these two entries to the server's existing \`.env\` (do not commit or upload \`.env\`):

- \`FTP_AUDIT_TRIGGER_TOKEN\`: a newly generated random secret, at least 40 characters.
- \`GITHUB_ACTIONS_TOKEN\`: a GitHub fine-grained personal access token restricted to this repository, with **Actions: Read and write** permission. Metadata read is implicit.

Call it over HTTPS as \`/clovece/ftp.php?key=YOUR_FTP_AUDIT_TRIGGER_TOKEN\`. The endpoint checks the token with a constant-time comparison, has a 120-second cooldown, and returns only whether GitHub accepted the workflow dispatch. It never returns secrets, FTP listings, or report contents.

**URL-token caveat:** because the available caller can make HTTPS GET requests but cannot set an Authorization header or POST body, the dedicated trigger token must be sent in the URL. HTTPS protects it in transit, but web-server access logs may record the query string. Use a token created only for this endpoint, do not reuse any password, and rotate it if access logs are exposed. The endpoint is deliberately limited to triggering this read-only audit.
