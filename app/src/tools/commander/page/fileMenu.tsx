import { imageType, vectorType } from '../../../shared/images';
import { strings } from '../../../shared/strings';
import type { ContextMenuItem } from '../../../ui/contextMenu';
import { ImageIcon, SevenZipIcon, ToolIcon } from '../../../ui/icons';
import { parentFolder, type FolderCommand } from '../shared/protocol';
import { pointedKeys, type Row } from './listing';
import type { Copied } from './naming';

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
  readonly onGoTo: () => void;
  readonly onSystemMenu: ((names: readonly string[]) => void) | undefined;
}

function editsImage(name: string): boolean {
  const type = imageType(name);
  return type !== undefined && type !== vectorType;
}

export function menuTargetOf(
  rows: readonly Row[],
  key: string | undefined,
  marked: ReadonlySet<string> | undefined,
  inRepository: boolean,
): MenuTarget | undefined {
  if (key === undefined || key === parentFolder) {
    return { kind: 'folder', inRepository };
  }
  const names = pointedKeys(rows, key, marked);
  const [only] = names;
  if (only === undefined) {
    return undefined;
  }
  const row =
    names.length === 1 ? rows.find((each) => each.key === only) : undefined;
  if (row?.entry?.folder === true) {
    return {
      kind: 'folder',
      name: only,
      inRepository: row.repository || inRepository,
    };
  }
  if (row !== undefined) {
    return { kind: 'file', name: only, image: editsImage(only) };
  }
  return { kind: 'items', names };
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

function ownItems(
  target: MenuTarget,
  { onFolder, onEnterArchive }: FileMenuActions,
  inArchive: boolean,
): ContextMenuItem[] {
  const enterArchive = (name: string): ContextMenuItem => ({
    label: strings.commander.openWithSevenZip,
    icon: <SevenZipIcon />,
    onClick: () => onEnterArchive(name),
  });
  if (inArchive) {
    return target.kind === 'file' ? [enterArchive(target.name)] : [];
  }
  switch (target.kind) {
    case 'folder': {
      const git = <ToolIcon tool="git" />;
      const run = (command: FolderCommand) => () =>
        onFolder(command, target.name);
      return [
        {
          label: strings.commander.newTerminalHere,
          icon: <ToolIcon tool="terminal" />,
          onClick: run('newTerminal'),
        },
        ...(target.inRepository
          ? [
              {
                label: strings.commander.openInGit,
                icon: git,
                onClick: run('openInGit'),
              },
            ]
          : [
              {
                label: strings.commander.cloneHere,
                icon: git,
                onClick: run('cloneHere'),
              },
              {
                label: strings.commander.initHere,
                icon: git,
                onClick: run('initHere'),
              },
            ]),
      ];
    }
    case 'file':
      return [
        ...(target.image
          ? [{ label: strings.commander.editImage, icon: <ImageIcon /> }]
          : []),
        enterArchive(target.name),
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
    {
      label: many ? strings.commander.copyNames : strings.commander.copyName,
      onClick: () => onCopy('names', names),
    },
  ];
}

export function fileMenuItems(
  target: MenuTarget,
  actions: FileMenuActions,
  inArchive = false,
): ContextMenuItem[] {
  const { onGoTo, onSystemMenu } = actions;
  const groups: ContextMenuItem[][] = [
    ownItems(target, actions, inArchive),
    copyItems(target, actions),
    target.kind === 'folder' && target.name === undefined
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
