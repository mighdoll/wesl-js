/** Resolution mode for package loading. */
export type PackageMode = "source" | "bundle";

/** Configuration for wgsl-play package resolution. */
export interface WgslPlayConfig {
  /** Base URL for package resolution. 'npm' fetches from registry, URL fetches from server. */
  packageBase: string;

  /** Resolution mode: 'source' for raw .wesl files, 'bundle' for weslBundle.js files. */
  mode: PackageMode;
}

const defaultConfig: WgslPlayConfig = {
  packageBase: "npm",
  mode: "bundle",
};

let globalConfig: WgslPlayConfig = { ...defaultConfig };

/** Set global defaults for all wgsl-play instances. */
export function defaults(config: Partial<WgslPlayConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

/** Get resolved config, merging element overrides with global defaults. */
export function getConfig(overrides?: Partial<WgslPlayConfig>): WgslPlayConfig {
  return { ...globalConfig, ...overrides };
}

/** Reset config to defaults (useful for testing). */
export function resetConfig(): void {
  globalConfig = { ...defaultConfig };
}
