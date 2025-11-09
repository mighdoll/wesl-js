import { cosmiconfig } from "cosmiconfig";

export interface SnipSyncConfig {
  sources: string[];
  destinations: string[];
}

const DEFAULT_CONFIG: SnipSyncConfig = {
  sources: ["tools/**/*.test.ts", "**/*.wesl"],
  destinations: ["**/*.md"],
};

export async function loadConfig(
  searchFrom?: string
): Promise<SnipSyncConfig> {
  const explorer = cosmiconfig("snip", {
    searchPlaces: [
      "snip.config.ts",
      "snip.config.js",
      "snip.config.json",
      ".sniprc",
      ".sniprc.json",
      ".sniprc.js",
      "package.json",
    ],
  });

  const result = await explorer.search(searchFrom);

  if (!result || !result.config) {
    console.log("No config found, using defaults");
    return DEFAULT_CONFIG;
  }

  return {
    sources: result.config.sources || DEFAULT_CONFIG.sources,
    destinations: result.config.destinations || DEFAULT_CONFIG.destinations,
  };
}
