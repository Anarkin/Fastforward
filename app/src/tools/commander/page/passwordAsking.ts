import { strings } from '../../../lib/shared/strings';
import { namedItem, type Line } from '../../../lib/shared/sentences';

export function passwordQuestion({
  name,
  wrong,
}: {
  readonly name: string;
  readonly wrong: boolean;
}): { title: string; message?: string; lines: Line[] } {
  return {
    title: strings.commander.passwordTitle,
    ...(wrong && { message: strings.commander.passwordWrong }),
    lines: [namedItem(name)],
  };
}
