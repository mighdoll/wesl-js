import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { Package, CommitInfo } from './types.js';

const exec = promisify(execCallback);

/**
 * Find the last release commit (matching "chore: release")
 */
export async function findLastReleaseCommit(cwd: string = process.cwd()): Promise<string | null> {
  try {
    const { stdout } = await exec('git log --oneline --grep="chore: release" -1', { cwd });
    const match = stdout.trim().match(/^([a-f0-9]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Get all files changed since a specific commit
 */
export async function getChangedFiles(since: string | null, cwd: string = process.cwd()): Promise<string[]> {
  const range = since ? `${since}..HEAD` : 'HEAD';
  const { stdout } = await exec(`git diff --name-only ${range}`, { cwd });
  return stdout.trim().split('\n').filter(Boolean);
}

/**
 * Get commit history for changed files since last release
 */
export async function getCommitHistory(since: string | null, cwd: string = process.cwd()): Promise<CommitInfo[]> {
  const range = since ? `${since}..HEAD` : 'HEAD';
  const { stdout } = await exec(`git log --oneline ${range}`, { cwd });

  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^([a-f0-9]+)\s+(.+)$/);
      if (!match) return null;
      return { hash: match[1], message: match[2] };
    })
    .filter((commit): commit is CommitInfo => commit !== null);
}

/**
 * Map changed files to packages
 */
export function mapFilesToPackages(
  changedFiles: string[],
  packages: Package[],
  cwd: string = process.cwd()
): Set<string> {
  const changedPackages = new Set<string>();

  for (const file of changedFiles) {
    const absoluteFile = path.resolve(cwd, file);

    for (const pkg of packages) {
      // Check if file is within package directory
      if (absoluteFile.startsWith(pkg.path + path.sep) || absoluteFile === pkg.path) {
        changedPackages.add(pkg.name);
        break;
      }
    }
  }

  return changedPackages;
}

/**
 * Detect which packages have changes since last release
 */
export async function detectChangedPackages(
  packages: Package[],
  cwd: string = process.cwd()
): Promise<{ changed: Set<string>; commits: CommitInfo[] }> {
  const lastRelease = await findLastReleaseCommit(cwd);
  const changedFiles = await getChangedFiles(lastRelease, cwd);
  const commits = await getCommitHistory(lastRelease, cwd);
  const changed = mapFilesToPackages(changedFiles, packages, cwd);

  return { changed, commits };
}
