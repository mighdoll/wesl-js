import type { WeslBundle } from "wesl";
import { findUnboundIdents, npmNameVariations, RecordResolver } from "wesl";
import type { WeslBundleFile } from "./BundleHydrator.ts";
import { bundleRegistry, hydrateBundleRegistry } from "./BundleHydrator.ts";
import {
  fetchBundleFilesFromNpm,
  fetchBundleFilesFromUrl,
  lygiaTgzUrl,
} from "./BundleLoader.ts";
import { getConfig, type WgslPlayConfig } from "./Config.ts";
import {
  fetchPackagesFromHttp,
  type SourcePackage,
} from "./HttpPackageLoader.ts";

/** Shader source with resolved dependency bundles or sources. */
export interface ShaderWithDeps {
  source: string;
  bundles: WeslBundle[];
  /** Additional sources for source mode (package sources merged with shader). */
  libSources?: Record<string, string>;
}

/** Result of fetching dependencies - bundles or sources depending on mode. */
export interface DependencyResult {
  bundles: WeslBundle[];
  libSources?: Record<string, string>;
}

/** Fetch dependencies for shader source. Returns bundles or sources depending on mode. */
export async function fetchDependenciesForSource(
  source: string,
  configOverrides?: Partial<WgslPlayConfig>,
): Promise<DependencyResult> {
  const config = getConfig(configOverrides);
  const packageNames = detectPackageDeps(source);

  if (config.packageBase !== "npm") {
    const result = await fetchPackagesFromHttp(
      packageNames,
      config.packageBase,
      config.mode,
    );
    if (config.mode === "source") {
      return { bundles: [], libSources: toLibSources(result as SourcePackage[]) };
    }
    return { bundles: result as WeslBundle[] };
  }

  const bundles = await fetchPackagesFromNpm(packageNames);
  return { bundles };
}

/** Load shader from URL with full config support. */
export async function loadShaderFromUrl(
  url: string,
  configOverrides?: Partial<WgslPlayConfig>,
): Promise<ShaderWithDeps> {
  const config = getConfig(configOverrides);
  const source = await fetchShaderSource(url);
  const packageNames = detectPackageDeps(source);

  if (config.packageBase !== "npm") {
    const result = await fetchPackagesFromHttp(
      packageNames,
      config.packageBase,
      config.mode,
    );
    if (config.mode === "source") {
      return { source, bundles: [], libSources: toLibSources(result as SourcePackage[]) };
    }
    return { source, bundles: result as WeslBundle[] };
  }

  const bundles = await fetchPackagesFromNpm(packageNames);
  return { source, bundles };
}

/** Convert source packages to libSources record with WESL module path keys. */
function toLibSources(sourcePackages: SourcePackage[]): Record<string, string> {
  const libSources: Record<string, string> = {};
  for (const pkg of sourcePackages) {
    for (const [filePath, src] of Object.entries(pkg.sources)) {
      const baseName = filePath.replace(/\.(wesl|wgsl)$/, "");
      // lib.wgsl -> package root, others -> package::path::to::module
      const modulePath =
        baseName === "lib"
          ? pkg.packageName
          : `${pkg.packageName}::${baseName.replace(/\//g, "::")}`;
      libSources[modulePath] = src;
    }
  }
  return libSources;
}

/** Detect external package dependencies from shader source. */
function detectPackageDeps(source: string): string[] {
  const resolver = new RecordResolver({ "./main.wesl": source });
  const unbound = findUnboundIdents(resolver);
  // Exclude virtual modules: "constants" for @const, "test" for test::Uniforms
  const pkgRefs = unbound.filter(p => p[0] !== "constants" && p[0] !== "test");
  const weslPackages = pkgRefs.map(p => p[0]);
  return [...new Set(weslPackages)];
}

/** Fetch WESL bundles from npm, auto-fetching dependencies recursively. */
async function fetchPackagesFromNpm(pkgIds: string[]): Promise<WeslBundle[]> {
  const loaded = new Set<string>();

  const promisedBundles = pkgIds.map(id => fetchOnePackage(id, loaded));
  const initialFiles = await Promise.all(promisedBundles);
  const registry = await bundleRegistry(initialFiles.flat());

  return hydrateBundleRegistry(registry, id => fetchOnePackage(id, loaded));
}

/** Fetch bundle files for a single package. */
async function fetchOnePackage(
  pkgId: string,
  loaded: Set<string>,
): Promise<WeslBundleFile[]> {
  if (loaded.has(pkgId)) return []; // already loaded
  loaded.add(pkgId);

  // Special case for lygia - use custom tgz URL (npm package is outdated)
  if (pkgId === "lygia") {
    return fetchBundleFilesFromUrl(lygiaTgzUrl);
  }

  for (const npmName of npmNameVariations(pkgId)) {
    try {
      return await fetchBundleFilesFromNpm(npmName);
    } catch {
      // Try next variation
    }
  }
  throw new Error(`Package not found: ${pkgId}`);
}

/** Fetch shader source from URL. */
async function fetchShaderSource(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.text();
}
