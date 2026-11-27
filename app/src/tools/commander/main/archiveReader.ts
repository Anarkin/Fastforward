import type { Sentence } from '../../../lib/shared/sentences';
import type { PackFormat, PackLevel, ZipCipher } from '../shared/packing';

export interface ArchiveItem {
  readonly path: string;
  readonly folder: boolean;
  readonly size: number | undefined;
  readonly modified: number | undefined;
  readonly hiddenAttribute: boolean;
  readonly link: boolean;
  readonly encrypted: boolean;
}

export interface ArchiveRefusal {
  readonly reason: Sentence;
  readonly noArchive?: true;
  readonly needsPassword?: true;
}

export type Refused = {
  readonly kind: 'refused';
  readonly passwordOf?: string;
} & ArchiveRefusal;

export type ArchiveListing =
  { readonly kind: 'listed'; readonly items: readonly ArchiveItem[] } | Refused;

export interface ExtractProgress {
  readonly percent: number;
  readonly files: number;
  readonly current?: string;
}

export interface ExtractOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ExtractProgress) => void;
  readonly withoutFolders?: boolean;
  readonly password?: string;
}

export interface PackPlan {
  readonly folder: string;
  readonly items: readonly string[];
  readonly archive: string;
  readonly format: PackFormat;
  readonly level: PackLevel;
  readonly password?: string;
  readonly encryptNames?: boolean;
  readonly zipCipher?: ZipCipher;
  readonly volumeBytes?: number;
  readonly test?: boolean;
}

export interface PackOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ExtractProgress) => void;
  readonly onTotals?: (totals: {
    readonly files: number;
    readonly bytes: number;
  }) => void;
  readonly onTesting?: () => void;
}

export interface UpdateOptions extends PackOptions {
  readonly password?: string;
}

export interface ListedOptions extends UpdateOptions {
  readonly listIn: string;
}

export type Packing =
  | { readonly kind: 'packed'; readonly warning?: Sentence }
  | ({ readonly kind: 'refused' } & ArchiveRefusal);

export interface ArchiveReader {
  list(
    file: string,
    signal?: AbortSignal,
    password?: string,
  ): Promise<ArchiveListing>;
  extract(
    file: string,
    paths: readonly string[],
    into: string,
    options?: ExtractOptions,
  ): Promise<ArchiveRefusal | undefined>;
  pack(plan: PackPlan, into: string, options?: PackOptions): Promise<Packing>;
  remove(
    file: string,
    paths: readonly string[],
    options: ListedOptions,
  ): Promise<Packing>;
  rename(
    file: string,
    from: string,
    to: string,
    options: ListedOptions,
  ): Promise<Packing>;
  add(
    file: string,
    folder: string,
    items: readonly string[],
    options: ListedOptions,
  ): Promise<Packing>;
  test(file: string, options: UpdateOptions): Promise<Packing>;
}
