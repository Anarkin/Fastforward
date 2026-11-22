import {
  groundBehind,
  lookWithin,
  probedRow,
} from '../../../components/cells/page/cellLook';
import type { CellLooks } from '../../../components/cells/page/cellView';
import type { TextLook } from '../../../components/cells/page/textCells';
import { clicked } from '../../../lib/shared/keymap';
import { offsetKind } from './hex';
import { viewerKeymap } from './keymap';

const rowClass = 'viewer-row';

function lookOf(host: Element): TextLook {
  const row = probedRow(host, rowClass);
  const look = lookWithin(row, groundBehind(host.parentElement), [
    [offsetKind, 'hex-offset'],
  ]);
  row.remove();
  return look;
}

export const rowLooks: CellLooks = {
  rowClass,
  lookOf,
  pressedAs: (press) => clicked(viewerKeymap.selectText, press),
};
