#!/usr/bin/env node
/**
 * Read-only FTP inventory using the same basic-ftp library as FTP-Deploy-Action.
 * Never uploads, deletes, renames, or downloads remote file contents.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Client, FileType } from "basic-ftp";

const ROOT = process.env.FTP_AUDIT_REMOTE_ROOT || "/clovece/";
const OUTPUT = process.env.FTP_AUDIT_OUTPUT_DIR || "audit-output";
const SENSITIVE_DIRS = new Set([".git", ".github", "storage", "sessions", "cache", "logs", "log", "backup", "backups", "uploads", "private", "data", "database", "db", "node_modules", "vendor"]);
const SKIP_PREFIXES = [".github/", "docs/", "tests/", "scripts/", "storage/", "sessions/", "cache/", "logs/", "backup/", "backups/", "uploads/", "private/", "data/", "database/", "db/", "node_modules/", "playwright-report/", "test-results/", "vendor/"];
const SKIP_FILES = new Set([".env", "README.md", "package.json", "package-lock.json", "playwright.config.js"]);

function sensitiveFile(name) {
  return name === ".env" || (name.startsWith(".env.") && name !== ".env.dist");
}
function deployable(file) {
  const p = file.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!p || SKIP_PREFIXES.some(prefix => p.startsWith(prefix))) return false;
  const name = p.split("/").at(-1);
  return !SKIP_FILES.has(name) && !sensitiveFile(name) && !p.split("/").some(part => part === ".git" || part.startsWith(".git"));
}
function localManifest(root) {
  const raw = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "buffer" });
  const result = new Map();
  for (const item of raw.toString("utf8").split("\0")) {
    if (!item) continue;
    const full = path.join(root, item);
    if (deployable(item) && fs.existsSync(full) && fs.statSync(full).isFile()) result.set(item.replaceAll("\\", "/"), fs.statSync(full).size);
  }
  return result;
}
function safeName(name) {
  return !!name && name !== "." && name !== ".." && !name.includes("/") && !name.includes("\\") && !/[\x00-\x1f]/.test(name);
}
function writeError(error) {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const report = {
    created_utc: new Date().toISOString(),
    mode: "read-only metadata inventory; no remote contents downloaded",
    remote_root: ROOT,
    status: "failed",
    error: { name: error?.name || "Error", message: String(error?.message || error).slice(0, 500) }
  };
  fs.writeFileSync(path.join(OUTPUT, "ftp-audit-error.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
}
async function inventory(client, root) {
  await client.cd(root);
  const files = {}, dirs = [], skipped = [], warnings = [];
  async function walk(rel = "") {
    let entries;
    try {
      entries = await client.list();
    } catch (error) {
      warnings.push(`Nelze vypsat ${rel || "."}: ${error?.name || "FTPError"}`);
      return;
    }
    for (const entry of entries) {
      const name = entry.name;
      if (!safeName(name)) continue;
      const remotePath = rel ? `${rel}/${name}` : name;
      if (entry.type === FileType.Directory) {
        if (SENSITIVE_DIRS.has(name.toLowerCase())) {
          skipped.push(remotePath + "/");
          continue;
        }
        dirs.push(remotePath + "/");
        try {
          await client.cd(name);
          try { await walk(remotePath); }
          finally { await client.cd(".."); }
        } catch (error) {
          warnings.push(`Adresář ${remotePath} nelze projít (${error?.name || "FTPError"}).`);
        }
      } else if (entry.type === FileType.File && !sensitiveFile(name)) {
        files[remotePath] = {
          size: Number.isFinite(entry.size) ? entry.size : null,
          modified: entry.modifiedAt instanceof Date ? entry.modifiedAt.toISOString() : null
        };
      }
      // Symlinks and unknown types are ignored and never followed.
    }
  }
  await walk();
  return { files, dirs, skipped, warnings };
}
function buildReport(expected, remote, root) {
  const expectedSet = new Set(expected.keys()), remoteSet = new Set(Object.keys(remote.files));
  const missing = [...expectedSet].filter(p => !remoteSet.has(p)).sort();
  const onlyFtp = [...remoteSet].filter(p => !expectedSet.has(p)).sort();
  const mismatch = [], warnings = [...remote.warnings];
  let matched = 0;
  for (const p of [...expectedSet].filter(p => remoteSet.has(p)).sort()) {
    const size = remote.files[p].size;
    if (size === null) warnings.push(`FTP neposkytlo velikost: ${p}`);
    else if (size !== expected.get(p)) mismatch.push({ path: p, github_size: expected.get(p), ftp_size: size, ftp_modified: remote.files[p].modified });
    else matched++;
  }
  const summary = {
    github_deploy_files: expected.size, ftp_files_scanned: remoteSet.size, matching_size: matched,
    missing_on_ftp: missing.length, ftp_only: onlyFtp.length, size_mismatch: mismatch.length,
    directories_scanned: remote.dirs.length, sensitive_directories_skipped: remote.skipped.length, warnings: warnings.length
  };
  const report = {
    created_utc: new Date().toISOString(),
    mode: "read-only metadata inventory; no remote contents downloaded",
    remote_root: root, status: "completed", summary,
    missing_on_ftp: missing,
    ftp_only: onlyFtp.map(p => ({ path: p, ...remote.files[p] })),
    size_mismatch: mismatch,
    ftp_files: [...remoteSet].sort().map(p => ({ path: p, ...remote.files[p] })),
    directories: remote.dirs.sort(),
    skipped_sensitive_paths: remote.skipped.sort(),
    warnings
  };
  return report;
}
function writeReport(report) {
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT, "ftp-audit.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  const labels = [
    ["github_deploy_files", "Soubory očekávané podle GitHubu"], ["ftp_files_scanned", "Soubory nalezené na FTP"],
    ["matching_size", "Shodná velikost"], ["missing_on_ftp", "Chybí na FTP"], ["ftp_only", "Pouze na FTP"],
    ["size_mismatch", "Odlišná velikost"], ["directories_scanned", "Prohledané adresáře"],
    ["sensitive_directories_skipped", "Citlivé adresáře přeskočeny"], ["warnings", "Upozornění"]
  ];
  const sections = [
    ["Chybí na FTP", report.missing_on_ftp],
    ["Pouze na FTP – kandidáti ke kontrole, ne automaticky ke smazání", report.ftp_only.map(x => x.path)],
    ["Odlišná velikost", report.size_mismatch.map(x => `${x.path} (GitHub ${x.github_size} B / FTP ${x.ftp_size} B)`)],
    ["Přeskočené citlivé cesty", report.skipped_sensitive_paths],
    ["Upozornění", report.warnings]
  ];
  const lines = ["# FTP audit Člověče, nezlob se!", "", `- Čas UTC: ${report.created_utc}`, `- Kořen: ${report.remote_root}`,
    "- Režim: pouze metadata; žádný vzdálený soubor nebyl stažen, změněn ani smazán.", "", "## Souhrn", "",
    ...labels.map(([key, label]) => `- ${label}: **${report.summary[key]}**`)];
  for (const [title, values] of sections) lines.push("", `## ${title}` , "", ...(values.length ? values.map(v => `- ${v}`) : ["- Žádné"]));
  fs.writeFileSync(path.join(OUTPUT, "ftp-audit.md"), lines.join("\n") + "\n", "utf8");
}
async function main() {
  fs.mkdirSync(OUTPUT, { recursive: true });
  if (process.argv.includes("--self-test")) {
    if (!deployable("index.php") || !deployable(".env.dist") || deployable(".env") || deployable("docs/README.md") ||
        deployable("storage/private.json") || deployable("scripts/ftp-audit.mjs")) throw new Error("Self-test deployable() failed");
    if (!safeName("index.php") || safeName("../secret") || safeName("bad\\name")) throw new Error("Self-test safeName() failed");
    console.log("PASS: FTP audit self-test");
    return;
  }
  for (const key of ["FTP_SERVER", "FTP_USERNAME", "FTP_PASSWORD"]) {
    if (!process.env[key]) throw new Error(`Chybí GitHub Actions secret ${key}.`);
  }
  const root = path.resolve(process.env.GITHUB_WORKSPACE || process.cwd());
  const expected = localManifest(root);
  const client = new Client(30000);
  client.ftp.verbose = false;
  try {
    // These are the same connection settings and library as FTP-Deploy-Action v4.3.5:
    // @samkirkland/ftp-deploy 1.2.4 -> basic-ftp ^5.0.5; protocol defaults to plain FTP.
    await client.access({
      host: process.env.FTP_SERVER,
      user: process.env.FTP_USERNAME,
      password: process.env.FTP_PASSWORD,
      port: 21,
      secure: false
    });
    const remote = await inventory(client, ROOT);
    const report = buildReport(expected, remote, ROOT);
    writeReport(report);
    console.log(JSON.stringify(report.summary));
    console.log("Audit dokončen.");
  } finally {
    client.close();
  }
}
main().catch(error => {
  writeError(error);
  console.error(`::error::FTP audit selhal: ${error?.name || "Error"}: ${String(error?.message || error).slice(0, 500)}`);
  process.exitCode = 1;
});
