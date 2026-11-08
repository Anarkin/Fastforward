import { strings } from '../../../shared/strings';
import type { TransferProgress } from '../shared/transfers';

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
): { title: string; message: string; confirm: string } {
  const { commander } = strings;
  const what = whatOf(names.length, names[0]);
  return move
    ? {
        title: commander.moveTitle,
        message: commander.moveQuestion(what, target),
        confirm: commander.moveTitle,
      }
    : {
        title: commander.copyTitle,
        message: commander.copyQuestion(what, target),
        confirm: commander.copyTitle,
      };
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
