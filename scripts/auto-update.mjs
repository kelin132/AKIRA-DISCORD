import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const UPDATE_ENABLED = process.env.AUTO_UPDATE !== "false";
const UPDATE_BRANCH = process.env.AUTO_UPDATE_BRANCH || "";

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function log(message) {
  console.log(`[auto-update] ${message}`);
}

function warn(message) {
  console.warn(`[auto-update] ${message}`);
}

function hasGitRepository() {
  return existsSync(path.join(ROOT, ".git"));
}

function dependencyFilesChanged(from, to) {
  const files = git(["diff", "--name-only", from, to])
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);

  return files.some((file) => [
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
  ].includes(file));
}

function installDependencies() {
  log("Dependency manifests changed; installing production dependencies...");
  try {
    execFileSync("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
    });
  } catch (error) {
    error.fatalUpdate = true;
    throw error;
  }
}

function update() {
  if (!UPDATE_ENABLED) {
    log("Disabled with AUTO_UPDATE=false.");
    return;
  }

  if (!hasGitRepository()) {
    log("No .git directory found; starting without an update.");
    return;
  }

  const branch = UPDATE_BRANCH || git(["branch", "--show-current"]);
  if (!branch) {
    warn("Repository is detached; starting without an update.");
    return;
  }

  const dirtyFiles = git(["status", "--porcelain"]);
  if (dirtyFiles) {
    warn("Local changes detected; skipping update to avoid overwriting them.");
    return;
  }

  const remote = git(["remote", "get-url", "origin"]);
  if (!remote) {
    warn("No origin remote configured; starting without an update.");
    return;
  }

  const before = git(["rev-parse", "HEAD"]);
  log(`Checking origin/${branch}...`);

  try {
    git(["fetch", "--quiet", "origin", branch]);
  } catch (error) {
    warn(`Could not fetch origin/${branch}: ${error.stderr?.trim() || error.message}`);
    return;
  }

  const remoteRef = `origin/${branch}`;
  const counts = git(["rev-list", "--left-right", "--count", `HEAD...${remoteRef}`])
    .split(/\s+/)
    .map(Number);
  const ahead = counts[0] || 0;
  const behind = counts[1] || 0;

  if (behind === 0) {
    log(ahead > 0 ? `Local branch is ahead of origin/${branch}; leaving it unchanged.` : "Already up to date.");
    return;
  }

  if (ahead > 0) {
    warn(`Branches diverged (${ahead} local, ${behind} remote); skipping automatic update.`);
    return;
  }

  try {
    git(["merge", "--ff-only", remoteRef]);
  } catch (error) {
    warn(`Fast-forward failed; starting the current version: ${error.stderr?.trim() || error.message}`);
    return;
  }

  const after = git(["rev-parse", "HEAD"]);
  log(`Updated ${before.slice(0, 7)} → ${after.slice(0, 7)}.`);

  if (dependencyFilesChanged(before, after)) {
    installDependencies();
  }
}

try {
  update();
} catch (error) {
  if (error.fatalUpdate) {
    warn("Dependency installation failed; refusing to start with an incomplete update.");
    process.exit(1);
  }
  warn(`Update check failed; starting the current version: ${error.stderr?.trim() || error.message}`);
}