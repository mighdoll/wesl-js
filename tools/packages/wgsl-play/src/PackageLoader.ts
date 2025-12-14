import type { WeslBundle } from "wesl";
import {
  findUnboundIdents,
  modulePartsToRelativePath,
  npmNameVariations,
  RecordResolver,
} from "wesl";
import type { WeslBundleFile } from "./BundleHydrator.ts";
import { bundleRegistry, hydrateBundleRegistry } from "./BundleHydrator.ts";
import {
  fetchBundleFilesFromNpm,
  fetchBundleFilesFromUrl,
  lygiaTgzUrl,
} from "./BundleLoader.ts";
import { getConfig, type WgslPlayConfig } from "./Config.ts";

/** Shader source with resolved dependency bundles and internal sources. */
export interface ShaderWithDeps {
  source: string;
  bundles: WeslBundle[];
  /** Internal sources from shaderRoot (package::, super:: imports). */
  libSources?: Record<string, string>;
}

/** Result of fetching dependencies. */
export interface DependencyResult {
  bundles: WeslBundle[];
  libSources?: Record<string, string>;
}

type ImportCategory = "external" | "package" | "super";

interface CategorizedImports {
  external: string[][]; // full paths for external packages
  internal: string[][]; // package:: and super:: paths
}

/** Fetch dependencies for shader source. Fetches external from npm, internal from shaderRoot. */
export async function fetchDependenciesForSource(
  source: string,
  configOverrides?: Partial<WgslPlayConfig>,
  currentPath?: string,
): Promise<DependencyResult> {
  const config = getConfig(configOverrides);
  const categorized = categorizeImports(source);

  const [bundles, libSources] = await Promise.all([
    fetchExternalPackages(categorized.external),
    fetchInternalImports(categorized.internal, config.shaderRoot, currentPath),
  ]);

  return {
    bundles,
    libSources: Object.keys(libSources).length ? libSources : undefined,
  };
}

/** Load shader from URL, resolving all dependencies. */
export async function loadShaderFromUrl(
  url: string,
  configOverrides?: Partial<WgslPlayConfig>,
): Promise<ShaderWithDeps> {
  const source = await fetchShaderSource(url);
  const currentPath = new URL(url, window.location.href).pathname;
  const deps = await fetchDependenciesForSource(
    source,
    configOverrides,
    currentPath,
  );
  return { source, ...deps };
}

/** Categorize import path as external, package, or super. */
function categorizeImport(path: string[]): ImportCategory {
  if (path[0] === "package") return "package";
  if (path[0] === "super") return "super";
  return "external";
}

/** Parse source and categorize all imports. */
function categorizeImports(source: string): CategorizedImports {
  const resolver = new RecordResolver({ "./main.wesl": source });
  const unbound = findUnboundIdents(resolver);
  // Exclude virtual modules
  const imports = unbound.filter(p => p[0] !== "constants" && p[0] !== "test");

  const external: string[][] = [];
  const internal: string[][] = [];

  for (const path of imports) {
    const category = categorizeImport(path);
    if (category === "external") {
      external.push(path);
    } else {
      internal.push(path);
    }
  }

  return { external, internal };
}

/** Convert URL path to module path parts for super:: resolution context. */
function urlToModuleParts(urlPath: string, root: string): string[] {
  const relativePath = urlPath
    .replace(root, "")
    .replace(/^\//, "")
    .replace(/\.w[eg]sl$/, "");
  return ["package", ...relativePath.split("/").filter(Boolean)];
}

/** Fetch internal imports from shaderRoot. */
async function fetchInternalImports(
  imports: string[][],
  shaderRoot: string,
  currentPath?: string,
): Promise<Record<string, string>> {
  if (imports.length === 0) return {};

  const libSources: Record<string, string> = {};
  const fetched = new Set<string>();
  const queue = [...imports];

  // Normalize shaderRoot (remove trailing slash)
  const root = shaderRoot.replace(/\/$/, "");
  // Convert currentPath to module parts for super:: resolution
  const srcModuleParts = currentPath
    ? urlToModuleParts(currentPath, root)
    : undefined;

  while (queue.length > 0) {
    const path = queue.shift()!;

    // Unified resolution for package:: and super::
    const filePath = modulePartsToRelativePath(path, "package", srcModuleParts);
    if (!filePath) {
      if (path[0] === "super" && !srcModuleParts) {
        throw new Error(
          `Cannot resolve super:: without file context: ${path.join("::")}`,
        );
      }
      continue; // external import
    }

    const url = `${root}/${filePath}`;
    const modulePath = path.join("::");

    if (fetched.has(modulePath)) continue;
    fetched.add(modulePath);

    // Try .wesl then .wgsl
    const source = await fetchWithExtensions(url);
    if (source === null) {
      throw new Error(`Failed to fetch internal import: ${modulePath}`);
    }

    libSources[modulePath] = source;

    // Recursively find imports in fetched source
    const nested = categorizeImports(source);
    for (const nestedPath of nested.internal) {
      const nestedModule = nestedPath.join("::");
      if (!fetched.has(nestedModule)) {
        queue.push(nestedPath);
      }
    }
  }

  return libSources;
}

/** Try fetching URL with .wesl then .wgsl extension. */
async function fetchWithExtensions(baseUrl: string): Promise<string | null> {
  for (const ext of [".wesl", ".wgsl"]) {
    try {
      const response = await fetch(baseUrl + ext);
      if (response.ok) return response.text();
    } catch {
      // Try next extension
    }
  }
  return null;
}

/** Fetch external packages from npm. */
async function fetchExternalPackages(
  imports: string[][],
): Promise<WeslBundle[]> {
  const packageNames = [...new Set(imports.map(p => p[0]))];
  if (packageNames.length === 0) return [];
  return fetchPackagesFromNpm(packageNames);
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
