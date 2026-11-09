import { imageType, vectorType } from '../../../shared/images';
import { strings } from '../../../shared/strings';
import type { ContextMenuItem } from '../../../ui/contextMenu';
import { ImageIcon, ToolIcon } from '../../../ui/icons';
import { parentFolder, type FolderCommand } from '../shared/protocol';
import { pointedKeys, type Row } from './listing';

export type MenuTarget =
  | {
      readonly kind: 'folder';
      readonly name?: string;
      readonly inRepository: boolean;
    }
  | { readonly kind: 'image'; readonly name: string }
  | { readonly kind: 'items'; readonly names: readonly string[] };

export interface FileMenuActions {
  readonly onFolder: (command: FolderCommand, name: string | undefined) => void;
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
  if (row !== undefined && editsImage(only)) {
    return { kind: 'image', name: only };
  }
  return { kind: 'items', names };
}

function namesOf(target: MenuTarget): readonly string[] {
  switch (target.kind) {
    case 'folder':
      return target.name === undefined ? [] : [target.name];
    case 'image':
      return [target.name];
    case 'items':
      return target.names;
    default:
      return target satisfies never;
  }
}

function ownItems(
  target: MenuTarget,
  onFolder: FileMenuActions['onFolder'],
): ContextMenuItem[] {
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
    case 'image':
      return [{ label: strings.commander.editImage, icon: <ImageIcon /> }];
    case 'items':
      return [];
    default:
      return target satisfies never;
  }
}

export function fileMenuItems(
  target: MenuTarget,
  { onFolder, onSystemMenu }: FileMenuActions,
): ContextMenuItem[] {
  const own = ownItems(target, onFolder);
  if (onSystemMenu === undefined) {
    return own;
  }
  return [
    ...own,
    ...(own.length > 0 ? [{ separator: true } as const] : []),
    {
      label: strings.commander.showMoreOptions,
      title: strings.commander.showMoreOptionsTitle,
      onClick: () => onSystemMenu(namesOf(target)),
    },
  ];
}
