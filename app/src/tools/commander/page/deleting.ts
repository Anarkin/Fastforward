import { strings } from '../../../shared/strings';

export function deleteQuestion(
  names: readonly string[],
  permanently: boolean,
  platform: string | undefined,
  binOff = false,
): { title: string; message: string; confirm: string } {
  const { commander } = strings;
  const what =
    names.length === 1
      ? commander.oneItem(names[0])
      : commander.items(names.length);
  if (permanently) {
    return {
      title: commander.deletePermanentlyTitle,
      message: binOff
        ? commander.binOffQuestion(what)
        : commander.deleteQuestion(what),
      confirm: commander.deletePermanentlyTitle,
    };
  }
  const bin = commander.bin(platform);
  return {
    title: commander.deleteTitle,
    message: commander.trashQuestion(what, bin),
    confirm: commander.moveToBin(bin),
  };
}
