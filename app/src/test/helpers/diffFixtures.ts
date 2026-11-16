import type { DiffLook } from '../../tools/git/page/diffLook';
import type { DiffMeasuring } from '../../tools/git/page/diffMeasures';
import { defaultScrolling } from '../../lib/page/scrollSettings';
import { noop } from './fixtures';

export function diffLookOf(look: Partial<DiffLook> = {}): DiffLook {
  return {
    sideBySide: false,
    wordWrap: false,
    showWhitespace: false,
    highlightSyntax: false,
    scrolling: defaultScrolling,
    root: undefined,
    language: undefined,
    ...look,
  };
}

export const diffMeasuring: DiffMeasuring = {
  measureText: noop,
  snapCode: noop,
  keepWrapColumns: noop,
};
