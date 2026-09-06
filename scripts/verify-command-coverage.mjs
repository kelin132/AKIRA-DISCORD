import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDiscordSupported } from "../lib/discordSupport.mjs";
import { SUPPORT_FILE_RE } from "../lib/pluginManager.mjs";

const pluginsRoot = path.resolve("plugins");
const discovered = [];
const supported = [];
const unsupported = [];
const invalid = [];
const failures = [];

for (const category of readdirSync(pluginsRoot).sort()) {
  const categoryDir = path.join(pluginsRoot, category);
  if (!statSync(categoryDir).isDirectory()) continue;

  for (const file of readdirSync(categoryDir).filter((entry) => entry.endsWith(".js")).sort()) {
    if (SUPPORT_FILE_RE.test(file)) continue;

    const relativePath = `${category}/${file}`;
    discovered.push(relativePath);

    try {
      const imported = await import(`${pathToFileURL(path.join(categoryDir, file)).href}?coverage=${Date.now()}`);
      const plugin = imported.default;
      if (!plugin?.name || typeof plugin.run !== "function") {
        invalid.push(relativePath);
        continue;
      }
      if (!isDiscordSupported(plugin)) {
        unsupported.push({
          command: String(plugin.name).toLowerCase(),
          file: relativePath,
        });
        continue;
      }
      supported.push({
        aliases: (plugin.aliases ?? []).map((alias) => String(alias).toLowerCase()),
        command: String(plugin.name).toLowerCase(),
        file: relativePath,
      });
    } catch (error) {
      failures.push({
        error: error?.message || String(error),
        file: relativePath,
      });
    }
  }
}

const canonicalOwners = new Map();
const aliasOwners = new Map();
const collisions = [];

for (const plugin of supported) {
  if (canonicalOwners.has(plugin.command)) {
    collisions.push({
      command: plugin.command,
      kind: "duplicate command",
      files: [canonicalOwners.get(plugin.command), plugin.file],
    });
  } else {
    canonicalOwners.set(plugin.command, plugin.file);
  }

  for (const alias of plugin.aliases) {
    const owner = aliasOwners.get(alias) || canonicalOwners.get(alias);
    if (owner) {
      collisions.push({
        command: alias,
        kind: "duplicate alias",
        files: [owner, plugin.file],
      });
    } else {
      aliasOwners.set(alias, plugin.file);
    }
  }
}

console.log(`Discovered plugin files: ${discovered.length}`);
console.log(`Discord-supported plugins: ${supported.length}`);
console.log(`Unsupported on Discord: ${unsupported.length}`);
console.log(`Invalid plugins: ${invalid.length}`);
console.log(`Import failures: ${failures.length}`);
console.log(`Command collisions: ${collisions.length}`);

if (unsupported.length) {
  console.log("\nUnsupported commands:");
  for (const entry of unsupported) console.log(`- ${entry.command} (${entry.file})`);
}

if (invalid.length) {
  console.log("\nInvalid plugins:");
  for (const file of invalid) console.log(`- ${file}`);
}

if (failures.length) {
  console.log("\nImport failures:");
  for (const entry of failures) console.log(`- ${entry.file}: ${entry.error}`);
}

if (collisions.length) {
  console.log("\nCommand collisions:");
  for (const entry of collisions) {
    console.log(`- ${entry.kind} ${entry.command}: ${entry.files.join(", ")}`);
  }
}

const hasBlockingIssues = invalid.length > 0 || failures.length > 0;
process.exitCode = hasBlockingIssues ? 1 : 0;
process.exit();