import { strings } from '../../../lib/shared/strings';
import type { Line } from '../../../lib/shared/sentences';
import { whatOf } from './items';

export function transferQuestion(
  names: readonly string[],
  folder: string,
  move: boolean,
  target: string,
  existing = 0,
): { title: string; lines: Line[]; note?: string; confirm: string } {
  const { commander } = strings;
  const title = move ? commander.moveTitle : commander.copyTitle;
  const lines = commander.transferLines(
    whatOf(names.length, names[0], folder),
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
