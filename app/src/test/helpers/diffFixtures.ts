import type { DiffLook } from '../../components/diff/page/look';
import type { DiffMeasuring } from '../../components/diff/page/measures';
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
