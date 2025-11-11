import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execCallback);

/**
 * Create a git commit
 */
export async function createCommit(
  message: string,
  cwd: string = process.cwd()
): Promise<void> {
  await exec('git add .', { cwd });
  await exec(`git commit -m "${message}"`, { cwd });
}

/**
 * Create a git tag
 */
export async function createTag(
  tag: string,
  cwd: string = process.cwd()
): Promise<void> {
  await exec(`git tag "${tag}"`, { cwd });
}

/**
 * Push commits and tags to remote
 */
export async function push(
  includeTags: boolean = false,
  cwd: string = process.cwd()
): Promise<void> {
  const tagsFlag = includeTags ? '--follow-tags' : '';
  await exec(`git push ${tagsFlag}`.trim(), { cwd });
}
