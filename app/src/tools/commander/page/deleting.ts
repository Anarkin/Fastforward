import { strings, type Line } from '../../../shared/strings';

export function deleteQuestion(
  names: readonly string[],
  permanently: boolean,
  platform: string | undefined,
  binOff = false,
  archive?: string,
): { title: string; message: string; lines: Line[]; confirm: string } {
  const { commander } = strings;
  const [name] = names;
  const one = names.length === 1 && name !== undefined;
  const what = commander.items(names.length);
  const lines = [
    ...(one ? commander.itemLines(name) : []),
    ...(archive === undefined
      ? []
      : commander.archiveLines(archive.split(/[\\/]/).at(-1) ?? archive)),
  ];
  if (permanently) {
    const [item, items] =
      archive !== undefined
        ? [commander.deleteFromArchiveItem, commander.deleteFromArchiveItems]
        : binOff
          ? [commander.binOffItem, commander.binOffItems]
          : [commander.deleteItem, commander.deleteItems];
    return {
      title: commander.deletePermanentlyTitle,
      message: one ? item : items(what),
      lines,
      confirm: commander.deletePermanentlyTitle,
    };
  }
  const bin = commander.bin(platform);
  return {
    title: commander.deleteTitle,
    message: one ? commander.trashItem(bin) : commander.trashItems(what, bin),
    lines,
    confirm: commander.moveToBin(bin),
  };
}
