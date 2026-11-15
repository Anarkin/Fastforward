import {
  setKeyPlatform,
  type KeyPress,
  type Modifiers,
} from '../../lib/shared/keymap';

export const noModifiers: Modifiers = {
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
};

type KeyEvent = KeyPress & { readonly target: EventTarget | null };

export const keyPress = (
  key = '',
  extra: Partial<KeyEvent> = {},
): KeyEvent => ({
  key,
  code: '',
  ...noModifiers,
  defaultPrevented: false,
  target: null,
  ...extra,
});

export function withMacKeys<T>(run: () => T): T {
  setKeyPlatform('darwin');
  try {
    return run();
  } finally {
    setKeyPlatform('linux');
  }
}
