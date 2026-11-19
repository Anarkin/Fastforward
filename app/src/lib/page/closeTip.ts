import { keyOf } from '../shared/keymap';
import { strings } from '../shared/strings';
import { keymap } from './keymap';
import { labelTip } from './tips';

export const closeTip = labelTip(strings.common.close, {
  keys: keyOf(keymap.close),
});
