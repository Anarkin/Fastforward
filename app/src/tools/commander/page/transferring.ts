import {
  strings,
  type Line,
  type Sentence,
  type Value,
} from '../../../lib/shared/strings';
import type { TransferProgress, TransferView } from '../shared/transfers';

export function whatOf(items: number, name: string | undefined): Value {
  return items === 1 && name !== undefined
    ? { name }
    : { text: strings.commander.items(items) };
}

export function transferQuestion(
  names: readonly string[],
  move: boolean,
  target: string,
  existing = 0,
): { title: string; lines: Line[]; note?: string; confirm: string } {
  const { commander } = strings;
  const title = move ? commander.moveTitle : commander.copyTitle;
  const lines = commander.transferLines(
    move,
    whatOf(names.length, names[0]),
    target,
  );
  return existing > 0
    ? {
        title,
        lines,
        note: commander.thereAlready(existing, names.length),
        confirm: commander.replace,
      }
    : { title, lines, confirm: title };
}

const archiveJobLines = {
  pack: strings.commander.packingInto,
  delete: strings.commander.deletingFrom,
  rename: strings.commander.renamingIn,
  folder: strings.commander.makingFolderIn,
  copyIn: strings.commander.copying,
  moveIn: strings.commander.moving,
  test: strings.commander.testingArchives,
  update: strings.commander.puttingBack,
};

export function runningLines(transfer: TransferView): Line[] {
  const { commander } = strings;
  const what = whatOf(transfer.items, transfer.name);
  if (transfer.archiveJob !== undefined) {
    return archiveJobLines[transfer.archiveJob](what, transfer.target);
  }
  return (transfer.move ? commander.moving : commander.copying)(
    what,
    transfer.target,
  );
}

export function shareDone(progress: TransferProgress | undefined): number {
  if (progress === undefined) {
    return 0;
  }
  const { files, totalFiles, bytes, totalBytes } = progress;
  const share =
    totalBytes > 0
      ? bytes / totalBytes
      : totalFiles > 0
        ? files / totalFiles
        : 1;
  return Math.round(Math.min(1, share) * 100);
}

export function progressLines({
  archiveJob,
  progress,
}: Pick<TransferView, 'archiveJob' | 'progress'>): {
  readonly current: Sentence | undefined;
  readonly files: string | undefined;
} {
  const { commander } = strings;
  if (progress === undefined) {
    return { current: commander.counting, files: undefined };
  }
  if (progress.deleting === true) {
    return {
      current: commander.deletingMovedFrom(progress.current ?? ''),
      files: undefined,
    };
  }
  if (progress.testing === true) {
    return {
      current: commander.testingArchive,
      files: commander.filesTested(progress.files, progress.totalFiles),
    };
  }
  if (archiveJob === undefined) {
    return {
      current: progress.current,
      files: commander.transferredFiles(progress.files, progress.totalFiles),
    };
  }
  return {
    current:
      progress.files < progress.totalFiles
        ? progress.current
        : commander.packingRest,
    files: commander.filesRead(progress.files, progress.totalFiles),
  };
}
