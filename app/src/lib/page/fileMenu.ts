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
  readonly onCopy: (copied: Copied, names: readonly string[]) => void;
  readonly onGoTo?: () => void;
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
}

function ownItems(
  target: MenuTarget,
  { onFolder, onEnterArchive }: FileMenuActions,
  {
    inArchive = false,
    gitMissing = false,
    onDisk = true,
    entersArchives = true,
  }: FileMenuPlace,
): ContextMenuItem[] {
  const enterArchive = (name: string): ContextMenuItem[] =>
    entersArchives
      ? [
          {
            label: strings.commander.openWithSevenZip,
            icon: 'sevenZip',
            onClick: () => onEnterArchive(name),
          },
        ]
      : [];
  if (!onDisk) {
    return [];
  }
  if (inArchive) {
    return target.kind === 'file' ? enterArchive(target.name) : [];
  }
  switch (target.kind) {
    case 'folder': {
      const run = (command: FolderCommand) => () =>
        onFolder(command, target.name);
      return [
        {
          label: strings.commander.newTerminalHere,
          icon: 'terminal',
          onClick: run('newTerminal'),
        },
        ...(gitMissing
          ? []
          : target.inRepository
            ? [
                {
                  label: strings.commander.openInGit,
                  icon: 'git' as const,
                  onClick: run('openInGit'),
                },
              ]
            : [
                {
                  label: strings.commander.cloneHere,
                  icon: 'git' as const,
                  onClick: run('cloneHere'),
                },
                {
                  label: strings.commander.initHere,
                  icon: 'git' as const,
                  onClick: run('initHere'),
                },
              ]),
      ];
    }
    case 'file':
      return [
        ...(target.image
          ? [{ label: strings.commander.editImage, icon: 'image' as const }]
          : []),
        ...enterArchive(target.name),
      ];
    case 'items':
      return [];
    default:
      return target satisfies never;
  }
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
  const { onGoTo, onSystemMenu } = actions;
  const groups: ContextMenuItem[][] = [
    ownItems(target, actions, place),
    copyItems(target, actions),
    onGoTo !== undefined &&
    target.kind === 'folder' &&
    target.name === undefined
      ? [{ label: strings.commander.goToItem, onClick: onGoTo }]
      : [],
    onSystemMenu === undefined
      ? []
      : [
          {
            label: strings.commander.showMoreOptions,
            title: strings.commander.showMoreOptionsTitle,
            onClick: () => onSystemMenu(namesOf(target)),
          },
        ],
  ];
  return groups
    .filter((group) => group.length > 0)
    .flatMap((group, index) =>
      index === 0 ? group : [{ separator: true } as const, ...group],
    );
}
