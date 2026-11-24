import type { TextSelection } from '../../../components/cells/page/cellView';

export function wholeFile(size: number): TextSelection {
  return { anchor: { start: 0, char: 0 }, focus: { start: size, char: 0 } };
}
