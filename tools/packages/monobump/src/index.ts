import { parseArgs } from 'node:util';
import { getWorkspacePackages } from './pnpm.js';
import { detectChangedPackages } from './detect.js';
import { getPackagesToBump } from './cascade.js';
import { bumpPackages } from './bump.js';
import { createCommit, createTag, push } from './git.js';
import { formatChangelog, formatResults } from './changelog.js';
import type { CliOptions, BumpType } from './types.js';

export async function main(): Promise<void> {
  const options = parseCliArgs();

  try {
    await runBump(options);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function runBump(options: CliOptions): Promise<void> {
  const cwd = process.cwd();

  if (options.verbose) {
    console.log('Options:', options);
    console.log('Working directory:', cwd);
  }

  // Get all packages
  console.log('🔍 Discovering packages...');
  const packages = await getWorkspacePackages(cwd);

  if (options.verbose) {
    console.log(`Found ${packages.length} packages (${packages.filter(p => !p.private).length} public)`);
  }

  // Detect changes
  console.log('🔍 Detecting changes since last release...');
  const { changed, commits } = await detectChangedPackages(packages, cwd);

  if (changed.size === 0) {
    console.log('✨ No changes detected. Nothing to bump!');
    return;
  }

  if (options.verbose) {
    console.log(`Changed packages: ${Array.from(changed).join(', ')}`);
  }

  // Find dependents and determine what to bump
  console.log('🔗 Computing dependency cascade...');
  const { toBump, reasons } = await getPackagesToBump(packages, changed);

  if (toBump.size === 0) {
    console.log('✨ No public packages affected. Nothing to bump!');
    return;
  }

  // Bump versions
  const results = await bumpPackages(packages, toBump, reasons, options.type, options.dryRun);

  // Display results
  console.log(formatResults(results));

  if (options.dryRun) {
    console.log('\n🔍 Dry run - no changes made.');
    return;
  }

  // Output changelog if requested
  if (options.changelog) {
    console.log('\n📝 Changelog:\n');
    console.log(formatChangelog(results, commits));
  }

  // Git operations
  if (!options.noCommit) {
    const newVersion = results[0]?.newVersion;
    if (newVersion) {
      console.log('\n📝 Creating commit...');
      await createCommit(`chore: release v${newVersion}`, cwd);

      if (options.tag) {
        console.log(`🏷️  Creating tag v${newVersion}...`);
        await createTag(`v${newVersion}`, cwd);
      }

      if (options.push) {
        console.log('🚀 Pushing to remote...');
        await push(options.tag, cwd);
      }
    }
  }

  console.log('\n✅ Done!');
}

function parseCliArgs(): CliOptions {
  const { values, positionals } = parseArgs({
    options: {
      type: {
        type: 'string',
        short: 't',
        default: 'patch',
      },
      'dry-run': {
        type: 'boolean',
        default: false,
      },
      changelog: {
        type: 'boolean',
        default: false,
      },
      'no-commit': {
        type: 'boolean',
        default: false,
      },
      tag: {
        type: 'boolean',
        default: true,
      },
      push: {
        type: 'boolean',
        default: false,
      },
      verbose: {
        type: 'boolean',
        short: 'v',
        default: false,
      },
      help: {
        type: 'boolean',
        short: 'h',
        default: false,
      },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const type = values.type as string;
  if (!['major', 'minor', 'patch'].includes(type)) {
    console.error(`Invalid bump type: ${type}. Must be major, minor, or patch.`);
    process.exit(1);
  }

  return {
    type: type as BumpType,
    dryRun: values['dry-run'] as boolean,
    changelog: values.changelog as boolean,
    noCommit: values['no-commit'] as boolean,
    tag: values.tag as boolean,
    push: values.push as boolean,
    verbose: values.verbose as boolean,
  };
}

function printHelp(): void {
  console.log(`
monobump - Smart version bumping for pnpm monorepos

Usage: monobump [options]

Options:
  -t, --type <type>      Bump type: major, minor, or patch (default: patch)
  --dry-run              Show what would be bumped without making changes
  --changelog            Output changelog markdown grouped by package
  --no-commit            Don't create a git commit
  --tag                  Create a git tag (default: true)
  --push                 Push commit and tags to remote
  -v, --verbose          Show verbose output
  -h, --help             Show this help message

Examples:
  monobump                          # Bump patch version
  monobump --type minor --dry-run   # Preview minor version bump
  monobump --changelog              # Bump and output changelog
  monobump --push                   # Bump, commit, tag, and push
`);
}
