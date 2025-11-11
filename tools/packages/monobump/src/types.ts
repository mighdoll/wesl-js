export interface Package {
  name: string;
  version: string;
  path: string;
  private: boolean;
}

export interface PackageWithDeps extends Package {
  dependencies: Set<string>; // workspace dependency names
}

export interface BumpResult {
  package: string;
  oldVersion: string;
  newVersion: string;
  reason: 'changed' | 'dependent';
}

export type BumpType = 'major' | 'minor' | 'patch';

export interface CliOptions {
  type: BumpType;
  dryRun: boolean;
  changelog: boolean;
  noCommit: boolean;
  tag: boolean;
  push: boolean;
  verbose: boolean;
}

export interface CommitInfo {
  hash: string;
  message: string;
}
