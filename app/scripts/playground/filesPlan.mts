import type { Content } from './planContents.mts';
import { planViewing } from './planViewing.mts';
import { planNames } from './planNames.mts';
import { planArchives } from './planArchives.mts';

export { limits } from './planContents.mts';

export type Platform = 'win32' | 'darwin' | 'linux';

interface Placed {
  readonly path: string;
  readonly modified?: Date;
}

export interface FileItem extends Placed {
  readonly kind: 'file';
  readonly content: () => Content;
  readonly mode?: number;
  readonly hidden?: true;
  readonly system?: true;
  readonly readOnly?: true;
  readonly flaggedHidden?: true;
}

export interface ChunksItem extends Placed {
  readonly kind: 'chunks';
  readonly size?: number;
  readonly chunks: () => Iterable<Content>;
}

export interface SparseItem extends Placed {
  readonly kind: 'sparse';
  readonly size: number;
}

export interface FolderItem extends Placed {
  readonly kind: 'folder';
  readonly hidden?: true;
  readonly unreadable?: true;
}

export interface LinkItem extends Placed {
  readonly kind: 'link';
  readonly target: string;
  readonly folder: boolean;
}

export interface JunctionItem extends Placed {
  readonly kind: 'junction';
  readonly target: string;
}

export interface CopyItem extends Placed {
  readonly kind: 'copy';
  readonly from: string;
}

export interface HardLinkItem extends Placed {
  readonly kind: 'hardLink';
  readonly target: string;
}

export interface RepositoryItem extends Placed {
  readonly kind: 'repository';
  readonly config?: Readonly<Record<string, string>>;
}

export type Item =
  | FileItem
  | ChunksItem
  | SparseItem
  | FolderItem
  | LinkItem
  | JunctionItem
  | CopyItem
  | HardLinkItem
  | RepositoryItem;

export interface EncodedSample {
  readonly path: string;
  readonly encoding: string;
  readonly text: string;
}

export interface Plan {
  readonly items: readonly Item[];
  readonly pairs: readonly (readonly [string, string])[];
  readonly encodings: readonly EncodedSample[];
  readonly guide: readonly (readonly [string, string])[];
}

export const playgroundName = 'Fastforward-playground-files';

export const markerName = '.fastforward-playground.json';

export interface PlanOptions {
  readonly platform: Platform;
  readonly large: boolean;
}

export function planBuilder() {
  const items: Item[] = [];
  const guide: [string, string][] = [];
  const pairs: [string, string][] = [];
  const encodings: EncodedSample[] = [];
  const file = (
    where: string,
    content: Content | (() => Content),
    extra: Partial<Omit<FileItem, 'kind' | 'path' | 'content'>> = {},
  ) => {
    items.push({
      kind: 'file',
      path: where,
      content: typeof content === 'function' ? content : () => content,
      ...extra,
    });
  };
  const chunks = (
    where: string,
    size: number,
    made: () => Iterable<Content>,
  ) => {
    items.push({ kind: 'chunks', path: where, size, chunks: made });
  };
  const folder = (
    where: string,
    extra: Partial<Omit<FolderItem, 'kind' | 'path'>> = {},
  ) => {
    items.push({ kind: 'folder', path: where, ...extra });
  };
  const section = (where: string, description: string) => {
    guide.push([where, description]);
    folder(where);
  };
  return { items, guide, pairs, encodings, file, chunks, folder, section };
}

export type PlanBuilder = ReturnType<typeof planBuilder>;

export function plan({
  platform,
  large = false,
}: {
  readonly platform: Platform;
  readonly large?: boolean;
}): Plan {
  const builder = planBuilder();
  const options = { platform, large };
  planViewing(builder);
  planNames(builder, options);
  planArchives(builder, options);
  const { items, pairs, encodings, guide } = builder;
  return { items, pairs, encodings, guide };
}

export function readme(made: Plan, skipped: readonly string[]): string {
  return `# Playground of files

Made by \`npm run playground:files\` to try the commander and the viewer of **Fastforward** by hand, anew each time it runs. \`--large\` adds the huge files, and \`--churn\` keeps changing the churn folder.

| Folder | What it is for |
|---|---|
${made.guide.map(([where, description]) => `| \`${where}\` | ${description} |`).join('\n')}
${skipped.length === 0 ? '' : `\n## Left out on this computer\n\n${skipped.map((reason) => `- ${reason}`).join('\n')}\n`}`;
}
