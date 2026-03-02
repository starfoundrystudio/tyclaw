#!/usr/bin/env node

/**
 * Release script for @starfoundrystudio/tyclaw
 *
 * Uses calendar versioning (calver): YYYY.M.D
 * Adapted from starfoundry-cli's release.mjs and upstream OpenClaw's release process.
 *
 * Usage:
 *   node scripts/release.mjs [YYYY.M.D] [--dry-run]
 *
 * If no version is given, defaults to today's date (e.g. 2026.3.2).
 * If today's version already exists as a tag, appends -N (e.g. 2026.3.2-1).
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const explicitVersion = args.find((a) => !a.startsWith("-"));

// ─── Helpers ───

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: rootDir, encoding: "utf-8", ...opts }).trim();
}

function dryLog(action) {
  console.log(`  ${dim("\u2192")} ${action}`);
}

// ─── Read current version ───

const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf-8"));
const currentVersion = pkg.version;

// ─── Calculate new version (calver) ───

function todayCalver() {
  const now = new Date();
  return `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
}

function existingTags() {
  try {
    return run("git tag -l").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function nextCalver() {
  const base = todayCalver();
  const tags = existingTags();

  if (!tags.includes(`v${base}`)) {
    return base;
  }

  // Today's version already tagged — find next suffix
  let n = 1;
  while (tags.includes(`v${base}-${n}`)) {
    n++;
  }
  return `${base}-${n}`;
}

const newVersion = explicitVersion || nextCalver();

if (newVersion === currentVersion) {
  console.error(red(`Version ${newVersion} is already the current version in package.json.`));
  process.exit(1);
}

// ─── Branch guard ───

try {
  const branch = run("git branch --show-current");
  if (branch !== "main") {
    console.warn(yellow(`Warning: releasing from "${branch}" instead of "main"`));
  }
} catch {
  // Detached HEAD — continue
}

// ─── Dirty working tree guard ───

try {
  const status = run("git status --porcelain");
  if (status) {
    if (dryRun) {
      console.warn(yellow("Warning: Working tree is dirty (ignored for dry run)."));
    } else {
      console.error(red("Working tree is dirty. Commit or stash changes before releasing."));
      process.exit(1);
    }
  }
} catch {
  // git unavailable
}

// ─── Dry-run mode ───

if (dryRun) {
  console.log(bold(`\nDry run: ${pkg.name} v${currentVersion} \u2192 v${newVersion}\n`));

  let dryRunFailed = false;

  // Build
  console.log(bold("Build:"));
  try {
    execSync("pnpm build", { cwd: rootDir, stdio: "inherit" });
    console.log(green("  \u2713 Build passed"));
  } catch {
    console.error(red("Build failed."));
    process.exit(1);
  }

  // Sync plugin versions, validate release check, then restore changes
  console.log(bold("\nPlugin sync + release check:"));
  try {
    execSync("pnpm plugins:sync", { cwd: rootDir, stdio: "inherit" });
    console.log(green("  \u2713 Plugin versions synced"));

    try {
      execSync("pnpm release:check", { cwd: rootDir, stdio: "inherit" });
      console.log(green("  \u2713 Release check passed"));
    } catch {
      console.error(red("Release check failed."));
      dryRunFailed = true;
    }
  } catch {
    console.error(red("Plugin sync failed."));
    dryRunFailed = true;
  } finally {
    // Restore plugin files so dry run is side-effect-free
    try {
      execSync("git checkout -- extensions/", { cwd: rootDir });
      console.log(dim("  (restored extensions/ to pre-sync state)"));
    } catch {
      console.warn(yellow("  Warning: could not restore extensions/ — check git status"));
    }
  }

  if (dryRunFailed) {
    process.exit(1);
  }

  // Tests
  console.log(bold("\nTests:"));
  try {
    execSync("pnpm test -- --run", { cwd: rootDir, stdio: "inherit" });
    console.log(green("  \u2713 Tests passed"));
  } catch {
    console.error(red("Tests failed."));
    process.exit(1);
  }

  // Summary
  console.log(bold("\nRelease steps (skipped in dry run):"));
  dryLog(`Update package.json version: ${currentVersion} \u2192 ${newVersion}`);
  dryLog("pnpm plugins:sync (align extension versions)");
  dryLog(`git add -A && git commit -m "${newVersion}"`);
  dryLog(`git tag v${newVersion}`);
  dryLog("git push && git push --tags");

  console.log(
    green(`\n\u2713 Dry run complete \u2014 all checks passed. Ready to release v${newVersion}.\n`),
  );
  process.exit(0);
}

// ─── Real release ───

const rl = createInterface({ input: process.stdin, output: process.stdout });

rl.question(`Release ${pkg.name} v${currentVersion} \u2192 v${newVersion}? (Y/n) `, (answer) => {
  rl.close();

  if (answer && answer.toLowerCase() !== "y") {
    console.log("Release cancelled.");
    process.exit(0);
  }

  // 1. Update package.json version
  try {
    pkg.version = newVersion;
    writeFileSync(join(rootDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n", "utf-8");
    console.log(`Updated package.json version: ${currentVersion} \u2192 ${newVersion}`);
  } catch (err) {
    console.error(red("Failed to update package.json:"), err.message);
    process.exit(1);
  }

  // 2. Sync plugin versions
  try {
    console.log("Syncing plugin versions...");
    execSync("pnpm plugins:sync", { cwd: rootDir, stdio: "inherit" });
    console.log(green("  \u2713 Plugin versions synced"));
  } catch (err) {
    console.error(red("Plugin sync failed:"), err.message);
    process.exit(1);
  }

  // 3. Commit and tag
  try {
    execSync("git add package.json extensions/", { cwd: rootDir });
    execSync(`git commit -m "${newVersion}"`, { cwd: rootDir, stdio: "inherit" });
    execSync(`git tag v${newVersion}`, { cwd: rootDir });
    console.log(green(`  \u2713 Tagged v${newVersion}`));
  } catch (err) {
    console.error(red("Commit/tag failed:"), err.message);
    process.exit(1);
  }

  // 4. Push
  try {
    execSync("git push && git push --tags", { cwd: rootDir, stdio: "inherit" });
  } catch (err) {
    console.error(red("Push failed:"), err.message);
    process.exit(1);
  }

  console.log(
    green(`\n\u2713 Released v${newVersion} \u2014 CI will publish to GitHub Packages.\n`),
  );
});
