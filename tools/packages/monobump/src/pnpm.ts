import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';
import type { Package } from './types.js';

const exec = promisify(execCallback);

/**
 * Get all workspace packages using pnpm
 */
export async function getWorkspacePackages(cwd: string = process.cwd()): Promise<Package[]> {
  const { stdout } = await exec('pnpm list --json --recursive --only-projects', { cwd });
  const packages = JSON.parse(stdout) as Array<{
    name: string;
    version?: string;
    path: string;
    private: boolean;
  }>;

  return packages
    .filter(pkg => pkg.name) // Filter out packages without names
    .map(pkg => ({
      name: pkg.name,
      version: pkg.version || '0.0.0',
      path: pkg.path,
      private: pkg.private,
    }));
}
