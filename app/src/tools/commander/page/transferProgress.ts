import { strings } from '../../../lib/shared/strings';
import type { Line, Sentence } from '../../../lib/shared/sentences';
import type { TransferProgress, TransferView } from '../shared/transfers';
import { whatOf } from './items';

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

const fileOf = (
  file: string | undefined,
): { readonly current: undefined; readonly file?: string } =>
  file === undefined ? { current: undefined } : { current: undefined, file };

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
  readonly file?: string;
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
      ...fileOf(progress.current),
      files: commander.transferredFiles(progress.files, progress.totalFiles),
    };
  }
  return {
    ...(progress.files < progress.totalFiles
      ? fileOf(progress.current)
      : { current: commander.packingRest }),
    files: commander.filesRead(progress.files, progress.totalFiles),
  };
}
