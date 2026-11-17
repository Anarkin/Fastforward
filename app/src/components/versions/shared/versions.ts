export interface ListedVersion {
  readonly rev: string;
  readonly path: string;
  readonly date: number;
  readonly subject: string;
  readonly gone: boolean;
}

export interface FileHistoryListed {
  readonly versions: readonly ListedVersion[];
  readonly staged: boolean;
  readonly changed: boolean;
}

export interface ListedVersions extends FileHistoryListed {
  readonly onDisk: boolean;
}
