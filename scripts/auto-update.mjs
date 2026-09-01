import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function setting(name) {
  if (process.env[name] !== undefined) return process.env[name];

  try {
    const line = readFileSync(path.join(ROOT, ".env"), "utf8")
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith(`${name}=`));
    return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "") : "";
  } catch {
    return "";
  }
}

const UPDATE_ENABLED = setting("AUTO_UPDATE") !== "false";
const UPDATE_BRANCH = setting("AUTO_UPDATE_BRANCH");
const INSTALL_ENABLED = setting("AUTO_INSTALL_DEPENDENCIES") !== "false";

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

function dependenciesAvailable() {
  try {
    const packageJson = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const dependencies = Object.keys(packageJson.dependencies || {});
    return dependencies.every((name) =>
      existsSync(path.join(ROOT, "node_modules", name, "package.json"))
    );
  } catch {
    return false;
  }
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

function installDependencies(reason) {
  log(`${reason} Installing production dependencies...`);
  try {
    const command = existsSync(path.join(ROOT, "package-lock.json")) ? "ci" : "install";
    execFileSync("npm", [command, "--omit=dev", "--no-audit", "--no-fund"], {
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
    return false;
  }

  if (!hasGitRepository()) {
    log("No .git directory found; starting without an update.");
    return false;
  }

  const branch = UPDATE_BRANCH || git(["branch", "--show-current"]);
  if (!branch) {
    warn("Repository is detached; starting without an update.");
    return false;
  }

  const dirtyFiles = git(["status", "--porcelain"]);
  if (dirtyFiles) {
    warn("Local changes detected; skipping update to avoid overwriting them.");
    return false;
  }

  const remote = git(["remote", "get-url", "origin"]);
  if (!remote) {
    warn("No origin remote configured; starting without an update.");
    return false;
  }

  const before = git(["rev-parse", "HEAD"]);
  log(`Checking origin/${branch}...`);

  try {
    git(["fetch", "--quiet", "origin", branch]);
  } catch (error) {
    warn(`Could not fetch origin/${branch}: ${error.stderr?.trim() || error.message}`);
    return false;
  }

  const remoteRef = `origin/${branch}`;
  const counts = git(["rev-list", "--left-right", "--count", `HEAD...${remoteRef}`])
    .split(/\s+/)
    .map(Number);
  const ahead = counts[0] || 0;
  const behind = counts[1] || 0;

  if (behind === 0) {
    log(ahead > 0 ? `Local branch is ahead of origin/${branch}; leaving it unchanged.` : "Already up to date.");
    return false;
  }

  if (ahead > 0) {
    warn(`Branches diverged (${ahead} local, ${behind} remote); skipping automatic update.`);
    return false;
  }

  try {
    git(["merge", "--ff-only", remoteRef]);
  } catch (error) {
    warn(`Fast-forward failed; starting the current version: ${error.stderr?.trim() || error.message}`);
    return false;
  }

  const after = git(["rev-parse", "HEAD"]);
  log(`Updated ${before.slice(0, 7)} → ${after.slice(0, 7)}.`);

  return dependencyFilesChanged(before, after);
}

function run() {
  const manifestsChanged = update();
  if (!INSTALL_ENABLED) {
    log("Dependency installation disabled with AUTO_INSTALL_DEPENDENCIES=false.");
    return;
  }

  if (manifestsChanged) {
    installDependencies("Dependency manifests changed.");
  } else if (!dependenciesAvailable()) {
    installDependencies("Required dependencies are missing.");
  }
}

try {
  run();
} catch (error) {
  if (error.fatalUpdate) {
    warn("Dependency installation failed; refusing to start with an incomplete update.");
    process.exit(1);
  }
  warn(`Update check failed; starting the current version: ${error.stderr?.trim() || error.message}`);
}