import { joinedPath } from '../../../lib/page/pathLooks';
import { strings } from '../../../lib/shared/strings';
import { namedItem, type Line } from '../../../lib/shared/sentences';

export function deleteQuestion(
  names: readonly string[],
  permanently: boolean,
  platform: string | undefined,
  binOff = false,
  archive?: string,
  folder?: string,
): { title: string; message?: string; lines: Line[]; confirm: string } {
  const { commander } = strings;
  const [name] = names;
  const lines = [
    names.length === 1 && name !== undefined
      ? namedItem(joinedPath(folder, name))
      : { text: commander.items(names.length) },
    ...(archive === undefined ? [] : commander.archiveLines(archive)),
  ];
  if (permanently) {
    return {
      title: commander.deletePermanentlyTitle,
      ...(binOff && archive === undefined && { message: commander.binOff }),
      lines,
      confirm: commander.deletePermanentlyTitle,
    };
  }
  return {
    title: commander.deleteTitle,
    lines,
    confirm: commander.moveToBin(commander.bin(platform)),
  };
}
