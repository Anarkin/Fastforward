import { imageType, vectorType } from '../shared/images';
import { strings } from '../shared/strings';
import type { FolderCommand } from '../shared/folderCommands';
import type { ContextMenuItem } from './contextMenuItem';

export type Copied = 'paths' | 'names';

export type MenuTarget =
  | {
      readonly kind: 'folder';
      readonly name?: string;
      readonly inRepository: boolean;
    }
  | { readonly kind: 'file'; readonly name: string; readonly image: boolean }
  | { readonly kind: 'items'; readonly names: readonly string[] };

export interface FileMenuActions {
  readonly onFolder: (command: FolderCommand, name: string | undefined) => void;
  readonly onEnterArchive: (name: string) => void;
  readonly onView: (name: string) => void;
  readonly onCompare?: () => void;
  readonly onEdit: (name: string) => void;
  readonly onCopy: (copied: Copied, names: readonly string[]) => void;
  readonly onSystemMenu: ((names: readonly string[]) => void) | undefined;
}

export function editsImage(name: string): boolean {
  const type = imageType(name);
  return type !== undefined && type !== vectorType;
}

function namesOf(target: MenuTarget): readonly string[] {
  switch (target.kind) {
    case 'folder':
      return target.name === undefined ? [] : [target.name];
    case 'file':
      return [target.name];
    case 'items':
      return target.names;
    default:
      return target satisfies never;
  }
}

export interface FileMenuPlace {
  readonly inArchive?: boolean;
  readonly gitMissing?: boolean;
  readonly onDisk?: boolean;
  readonly entersArchives?: boolean;
  readonly ofVersion?: boolean;
}

function offered(
  label: string,
  offers: boolean,
  more: Omit<Extract<ContextMenuItem, { label: string }>, 'label'> = {},
): ContextMenuItem {
  if (offers) {
    return { label, ...more };
  }
  const { onClick: _onClick, ...shown } = more;
  return { label, ...shown, disabled: true };
}

function toolItems(
  target: MenuTarget,
  { onFolder, onEnterArchive, onView, onCompare, onEdit }: FileMenuActions,
  {
    inArchive = false,
    gitMissing = false,
    onDisk = true,
    entersArchives = true,
    ofVersion = false,
  }: FileMenuPlace,
): ContextMenuItem[] {
  const folder = target.kind === 'folder' ? target : undefined;
  const file = target.kind === 'file' ? target : undefined;
  const onFolders = folder !== undefined && onDisk && !inArchive;
  const git = onFolders && !gitMissing;
  const inRepository = folder?.inRepository === true;
  const run = (command: FolderCommand) => () => onFolder(command, folder?.name);
  const name = file?.name ?? '';
  const opens = file !== undefined && onDisk && entersArchives;
  return [
    offered(strings.commander.openWithTerminal, onFolders, {
      icon: 'terminal',
      onClick: run('newTerminal'),
    }),
    offered(strings.commander.openWithCommander, onFolders, {
      icon: 'commander',
      onClick: run('openInCommander'),
    }),
    offered(strings.commander.openWithSevenZip, opens, {
      icon: 'sevenZip',
      onClick: () => onEnterArchive(name),
    }),
    offered(strings.commander.openWithGit, git && inRepository, {
      icon: 'git',
      onClick: run('openInGit'),
    }),
    offered(strings.commander.cloneWithGit, git && !inRepository, {
      icon: 'git',
      onClick: run('cloneHere'),
    }),
    offered(strings.commander.initWithGit, git && !inRepository, {
      icon: 'git',
      onClick: run('initHere'),
    }),
    offered(
      strings.commander.openWithViewer,
      opens || (ofVersion && file !== undefined),
      {
        icon: 'viewer',
        onClick: () => onView(name),
      },
    ),
    offered(
      strings.commander.openWithDiff,
      target.kind !== 'folder' && onCompare !== undefined,
      {
        icon: 'diff',
        ...(onCompare !== undefined && { onClick: onCompare }),
      },
    ),
    offered(strings.commander.openWithEditor, opens, {
      icon: 'editor',
      onClick: () => onEdit(name),
    }),
    offered(
      strings.commander.openWithPaint,
      file?.image === true && onDisk && !inArchive,
      { icon: 'image' },
    ),
  ];
}

function copyItems(
  target: MenuTarget,
  { onCopy }: FileMenuActions,
): ContextMenuItem[] {
  const names = namesOf(target);
  const many = target.kind === 'items';
  return [
    {
      label: many ? strings.commander.copyPaths : strings.commander.copyPath,
      onClick: () => onCopy('paths', names),
    },
  ];
}

export function fileMenuItems(
  target: MenuTarget,
  actions: FileMenuActions,
  place: FileMenuPlace = {},
): ContextMenuItem[] {
  const { onSystemMenu } = actions;
  const groups: ContextMenuItem[][] = [
    toolItems(target, actions, place),
    copyItems(target, actions),
    [
      offered(strings.commander.showMoreOptions, onSystemMenu !== undefined, {
        title: strings.commander.showMoreOptionsTitle,
        ...(onSystemMenu !== undefined && {
          onClick: () => onSystemMenu(namesOf(target)),
        }),
      }),
    ],
  ];
  return groups.flatMap((group, index) =>
    index === 0 ? group : [{ separator: true } as const, ...group],
  );
}
