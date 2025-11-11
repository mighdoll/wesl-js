import type { CommitInfo, BumpResult } from './types.js';

/**
 * Group commits by package that was affected
 */
export function formatChangelog(
  results: BumpResult[],
  commits: CommitInfo[]
): string {
  if (results.length === 0) {
    return 'No packages to bump.\n';
  }

  let output = '';

  for (const result of results) {
    output += `## ${result.package}\n`;

    // Add all commits (we don't track per-package commits yet, so show all)
    // In a more sophisticated version, we could track which commits touched which packages
    for (const commit of commits) {
      output += `- ${commit.hash} ${commit.message}\n`;
    }

    output += '\n';
  }

  return output;
}

/**
 * Format bump results for display
 */
export function formatResults(results: BumpResult[]): string {
  if (results.length === 0) {
    return 'No packages to bump.';
  }

  let output = '\nPackages to bump:\n\n';

  for (const result of results) {
    const icon = result.reason === 'changed' ? '📝' : '⬆️';
    const reason = result.reason === 'changed' ? 'changed' : 'dependent';
    output += `  ${icon} ${result.package}: ${result.oldVersion} → ${result.newVersion} (${reason})\n`;
  }

  return output;
}
