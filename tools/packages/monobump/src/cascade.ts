import fs from 'node:fs/promises';
import path from 'node:path';
import type { Package, PackageWithDeps } from './types.js';

/**
 * Build dependency graph by reading package.json files
 */
export async function buildDependencyGraph(packages: Package[]): Promise<Map<string, PackageWithDeps>> {
  const graph = new Map<string, PackageWithDeps>();

  for (const pkg of packages) {
    const packageJsonPath = path.join(pkg.path, 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content);

    const dependencies = new Set<string>();

    // Check all dependency sections for workspace: references
    const sections = ['dependencies', 'devDependencies', 'peerDependencies'];
    for (const section of sections) {
      if (packageJson[section]) {
        for (const [depName, depVersion] of Object.entries(packageJson[section])) {
          if (typeof depVersion === 'string' && depVersion.startsWith('workspace:')) {
            dependencies.add(depName);
          }
        }
      }
    }

    graph.set(pkg.name, {
      ...pkg,
      dependencies,
    });
  }

  return graph;
}

/**
 * Find all packages that depend on the given packages (recursively)
 */
export function findDependents(
  graph: Map<string, PackageWithDeps>,
  changedPackages: Set<string>
): Set<string> {
  const allAffected = new Set(changedPackages);
  let changed = true;

  // Keep iterating until no new packages are added
  while (changed) {
    changed = false;

    for (const [pkgName, pkg] of graph.entries()) {
      // Skip if already in affected set
      if (allAffected.has(pkgName)) continue;

      // Check if any of this package's dependencies are affected
      for (const dep of pkg.dependencies) {
        if (allAffected.has(dep)) {
          allAffected.add(pkgName);
          changed = true;
          break;
        }
      }
    }
  }

  return allAffected;
}

/**
 * Get packages to bump: changed packages + their dependents, excluding private packages
 */
export async function getPackagesToBump(
  packages: Package[],
  changedPackages: Set<string>
): Promise<{ toBump: Set<string>; reasons: Map<string, 'changed' | 'dependent'> }> {
  // Filter out private packages from the start
  const publicPackages = packages.filter(pkg => !pkg.private);

  // Build dependency graph only for public packages
  const graph = await buildDependencyGraph(publicPackages);

  // Find all affected packages (changed + dependents)
  const allAffected = findDependents(graph, changedPackages);

  // Determine reason for each package
  const reasons = new Map<string, 'changed' | 'dependent'>();
  for (const pkgName of allAffected) {
    reasons.set(pkgName, changedPackages.has(pkgName) ? 'changed' : 'dependent');
  }

  return { toBump: allAffected, reasons };
}
