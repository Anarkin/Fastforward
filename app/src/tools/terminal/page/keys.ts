import { pressed, type KeyPress } from '../../../lib/shared/keymap';
import { terminalKeymap } from './keymap';

export type TerminalKey = 'copy' | 'paste' | 'find' | 'app' | 'shell';

export function terminalKey(press: KeyPress, selection: boolean): TerminalKey {
  if (pressed(terminalKeymap.leftToApp, press, false) !== undefined) {
    return 'app';
  }
  if (pressed(terminalKeymap.find, press, false) !== undefined) {
    return 'find';
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
