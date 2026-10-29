import { pressed, type KeyPress } from '../../../shell/shared/keymap';
import { terminalKeymap } from '../shared/keymap';

export type TerminalKey = 'copy' | 'paste' | 'app' | 'shell';

export function terminalKey(press: KeyPress, selection: boolean): TerminalKey {
  if (pressed(terminalKeymap.leftToApp, press, false) !== undefined) {
    return 'app';
  }
  const copy = pressed(terminalKeymap.copy, press, false);
  if (copy === 'always' || (copy === 'selected' && selection)) {
    return 'copy';
  }
  if (pressed(terminalKeymap.paste, press, false) !== undefined) {
    return 'paste';
  }
  return 'shell';
}
