#!/usr/bin/env node
import { watch } from "chokidar";
import { loadConfig } from "./config.ts";
import { extractSnippets } from "./snippet-extractor.ts";
import { updateMarkdownFiles } from "./markdown-updater.ts";

async function sync() {
  try {
    const config = await loadConfig();
    console.log("📝 Extracting snippets...");

    const snippets = await extractSnippets(config.sources);
    console.log(`   Found ${snippets.size} snippets`);

    console.log("📄 Updating markdown files...");
    const results = await updateMarkdownFiles(config.destinations, snippets);

    const updated = results.filter((r) => r.updated);
    if (updated.length > 0) {
      console.log(`✅ Updated ${updated.length} files:`);
      for (const result of updated) {
        console.log(`   ${result.filePath}`);
        if (result.snippetsUpdated.length > 0) {
          console.log(
            `      - ${result.snippetsUpdated.join(", ")}`
          );
        }
      }
    } else {
      console.log("✅ All files up to date");
    }
  } catch (error) {
    console.error("❌ Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function watchMode() {
  const config = await loadConfig();

  console.log("👀 Watching for changes...");
  console.log(`   Sources: ${config.sources.join(", ")}`);
  console.log(`   Destinations: ${config.destinations.join(", ")}`);

  const watchPatterns = [...config.sources, ...config.destinations];

  const watcher = watch(watchPatterns, {
    persistent: true,
    ignoreInitial: true,
  });

  let timeoutId: NodeJS.Timeout | null = null;

  const scheduleSync = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(async () => {
      console.log("\n🔄 Changes detected, syncing...");
      await sync();
    }, 100);
  };

  watcher.on("change", (path) => {
    console.log(`📝 Changed: ${path}`);
    scheduleSync();
  });

  watcher.on("add", (path) => {
    console.log(`➕ Added: ${path}`);
    scheduleSync();
  });

  watcher.on("unlink", (path) => {
    console.log(`➖ Removed: ${path}`);
    scheduleSync();
  });

  // Initial sync
  await sync();

  // Keep process alive
  await new Promise(() => {});
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--watch") || args.includes("-w")) {
    await watchMode();
  } else if (args.includes("--help") || args.includes("-h")) {
    console.log(`
snip-sync - Sync code snippets from source files into markdown

Usage:
  snip-sync           Sync snippets once
  snip-sync --watch   Watch for changes and sync automatically
  snip-sync --help    Show this help

Configuration:
  Place a snip.config.ts file in your project root with:

  export default {
    sources: ["**/*.test.ts", "**/*.wesl"],
    destinations: ["**/*.md"]
  }

Snippet Syntax:
  In source files:
    // snippet-start: example-name
    const code = "example";
    // snippet-end

  In markdown files:
    <!-- snippet: example-name -->
    \`\`\`typescript
    // content will be replaced
    \`\`\`
    <!-- /snippet -->
`);
  } else {
    await sync();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
