import type { ContextMenuItem } from '../../lib/page/contextMenuItem';
import {
  editsImage,
  fileMenuItems,
  type MenuTarget,
} from '../../lib/page/fileMenu';
import type { PathMenuAsk } from '../../lib/page/pathMenu';
import type { PathFacts } from '../../lib/shared/pathFacts';
import type { PathCommand } from '../shared/protocol';

export interface PathMenuActs {
  readonly command: (command: PathCommand) => void;
  readonly copy: (text: string) => void;
}

export function pathMenuItems(
  { path, file, onGoTo }: PathMenuAsk,
  facts: PathFacts,
  platform: string | undefined,
  acts: PathMenuActs,
): ContextMenuItem[] {
  const onDisk = facts.kind === 'folder' || facts.kind === 'file';
  const target: MenuTarget =
    facts.kind === 'folder' || (!onDisk && !file)
      ? {
          kind: 'folder',
          ...(onGoTo === undefined && { name: path }),
          inRepository: facts.inRepository,
        }
      : { kind: 'file', name: path, image: editsImage(path) };
  return fileMenuItems(
    target,
    {
      onFolder: (command) => acts.command(command),
      onEnterArchive: () => acts.command('enterArchive'),
      onCopy: () => acts.copy(path),
      ...(onGoTo !== undefined && { onGoTo }),
      onSystemMenu:
        platform === 'win32' && onDisk
          ? () => acts.command('systemMenu')
          : undefined,
    },
    {
      inArchive: facts.kind === 'inArchive',
      gitMissing: facts.gitMissing,
      onDisk: facts.kind !== 'missing',
      entersArchives: facts.kind !== 'inArchive',
    },
  );
}
