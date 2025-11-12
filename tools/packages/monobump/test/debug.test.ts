import { describe, it, expect } from 'vitest';
import { createTestMonorepo, createReleaseCommit, writeFileAndCommit } from './test-helpers.js';
import { getWorkspacePackages } from '../src/pnpm.js';
import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execCallback);

describe('debug pnpm integration', () => {
  it('should find packages in test monorepo', async () => {
    const repo = await createTestMonorepo([
      { name: 'pkg-a', version: '1.0.0' },
      { name: 'pkg-b', version: '1.0.0' },
    ]);

    try {
      // Check what pnpm sees
      const { stdout } = await exec('pnpm list --json --recursive --only-projects', { cwd: repo.root });
      console.log('pnpm output:', stdout);

      const packages = await getWorkspacePackages(repo.root);
      console.log('packages:', packages);

      expect(packages.length).toBeGreaterThan(0);
      expect(packages.some(p => p.name === 'pkg-a')).toBe(true);
    } finally {
      await repo.cleanup();
    }
  });

  it('should detect git changes', async () => {
    const repo = await createTestMonorepo([
      { name: 'pkg-a', version: '1.0.0' },
    ]);

    try {
      await createReleaseCommit(repo.root, '1.0.0');
      await writeFileAndCommit(repo.root, 'packages/pkg-a/index.ts', 'export const x = 1;', 'Add file');

      // Check git
      const { stdout: logOut } = await exec('git log --oneline', { cwd: repo.root });
      console.log('git log:', logOut);

      const { stdout: diffOut } = await exec('git diff --name-only HEAD~1..HEAD', { cwd: repo.root });
      console.log('changed files:', diffOut);

      expect(diffOut).toContain('packages/pkg-a/index.ts');
    } finally {
      await repo.cleanup();
    }
  });
});
