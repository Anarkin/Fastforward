import { strings } from '../../../shared/strings';
import type { TransferProgress, TransferView } from '../shared/transfers';

export function whatOf(items: number, name: string | undefined): string {
  const { commander } = strings;
  return items === 1 && name !== undefined
    ? commander.oneItem(name)
    : commander.items(items);
}

export function transferQuestion(
  names: readonly string[],
  move: boolean,
  target: string,
  existing = 0,
): { title: string; message: string; confirm: string } {
  const { commander } = strings;
  const what = whatOf(names.length, names[0]);
  const title = move ? commander.moveTitle : commander.copyTitle;
  const question = (move ? commander.moveQuestion : commander.copyQuestion)(
    what,
    target,
  );
  return existing > 0
    ? {
        title,
        message: `${question} ${commander.thereAlready(existing, names.length)}`,
        confirm: commander.replace,
      }
    : { title, message: question, confirm: title };
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
  readonly current: string | undefined;
  readonly files: string | undefined;
} {
  const { commander } = strings;
  if (progress === undefined) {
    return { current: commander.counting, files: undefined };
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
