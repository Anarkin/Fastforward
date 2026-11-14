export interface Binding<Value> {
  readonly group: string | undefined;
  readonly action: string;
  readonly keys: Readonly<Record<string, Value>>;
  readonly repeats: boolean;
  readonly fields: boolean;
  readonly dialogs: boolean;
}

export function bind<const Value>(
  group: string | undefined,
  action: string,
  keys: Readonly<Record<string, Value>>,
  { repeats = false, fields = false, dialogs = false } = {},
): Binding<Value> {
  return { group, action, keys, repeats, fields, dialogs };
}

export interface Modifiers {
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

export interface KeyPress extends Modifiers {
  readonly key: string;
  readonly code?: string;
  readonly repeat?: boolean;
  readonly defaultPrevented?: boolean;
  readonly isComposing?: boolean;
  readonly keyCode?: number;
}

export interface Click extends Modifiers {
  readonly button: number;
}

interface Combo {
  readonly key: string;
  readonly mod: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
}

export function comboOf(keys: string): Combo {
  const parts = keys.split('+');
  const key = parts.pop() ?? '';
  return {
    key,
    mod: parts.includes('Mod'),
    ctrl: parts.includes('Ctrl'),
    alt: parts.includes('Alt'),
    shift: parts.includes('Shift'),
  };
}

const buttons: Readonly<Record<string, number>> = {
  Click: 0,
  Drag: 0,
  MiddleClick: 1,
  RightClick: 2,
  BackButton: 3,
  ForwardButton: 4,
};

const pointerKeys = new Set(['Wheel', 'Hover']);

const modifierKeys = new Set(['Alt', 'AltGraph', 'Control', 'Shift', 'Meta']);

const signs: Readonly<Record<string, string>> = {
  Plus: '+',
  Minus: '-',
  Asterisk: '*',
};

const named: Readonly<Record<string, string>> = { Space: ' ', ...signs };

const caretKeys = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Backspace',
  'Delete',
]);

function isLetter(key: string): boolean {
  return /^[A-Z]$/.test(key);
}

function letterOf(press: KeyPress): string {
  return /^[a-z]$/i.test(press.key) || !/^Key[A-Z]$/.test(press.code ?? '')
    ? press.key.toUpperCase()
    : (press.code ?? '').slice(3);
}

function shiftMatters(key: string): boolean {
  return isLetter(key) || (key.length > 1 && !(key in signs));
}

let macKeys = false;

export function setKeyPlatform(platform: string): void {
  macKeys = platform === 'darwin';
}

export function usesMacKeys(): boolean {
  return macKeys;
}

function modifiersMatch(combo: Combo, held: Modifiers): boolean {
  const ctrl = combo.mod
    ? macKeys
      ? held.metaKey && !held.ctrlKey
      : held.ctrlKey && !held.metaKey
    : combo.ctrl
      ? held.ctrlKey && !held.metaKey
      : !held.ctrlKey && !held.metaKey;
  return (
    ctrl &&
    held.altKey === combo.alt &&
    (!shiftMatters(combo.key) || held.shiftKey === combo.shift)
  );
}

const anyLetter = 'Letter';

export function letterTyped(press: KeyPress): string | undefined {
  const letter = letterOf(press);
  return isLetter(letter) ? letter.toLowerCase() : undefined;
}

function keyMatches(combo: Combo, press: KeyPress): boolean {
  if (combo.key === anyLetter) {
    return letterTyped(press) !== undefined;
  }
  return isLetter(combo.key)
    ? letterOf(press) === combo.key
    : press.key === (named[combo.key] ?? combo.key);
}

function editsField(combo: Combo): boolean {
  return (
    !combo.ctrl &&
    (caretKeys.has(combo.key) ||
      (!combo.mod &&
        (isLetter(combo.key) ||
          combo.key === anyLetter ||
          combo.key.length === 1 ||
          combo.key === 'Space')))
  );
}

export function pressed<Value>(
  binding: Binding<Value>,
  press: KeyPress,
  inField: boolean,
): Value | undefined {
  if (
    press.defaultPrevented === true ||
    press.isComposing === true ||
    press.keyCode === 229 ||
    (press.repeat === true && !binding.repeats)
  ) {
    return undefined;
  }
  for (const [keys, value] of Object.entries(binding.keys)) {
    const combo = comboOf(keys);
    if (
      !(combo.key in buttons) &&
      !pointerKeys.has(combo.key) &&
      keyMatches(combo, press) &&
      modifiersMatch(combo, press) &&
      !(inField && !binding.fields && editsField(combo))
    ) {
      return value;
    }
  }
  return undefined;
}

export function clicked<Value>(
  binding: Binding<Value>,
  click: Click,
): Value | undefined {
  for (const [keys, value] of Object.entries(binding.keys)) {
    const combo = comboOf(keys);
    if (buttons[combo.key] === click.button && modifiersMatch(combo, click)) {
      return value;
    }
  }
  return undefined;
}

function pointed<Value>(
  binding: Binding<Value>,
  key: string,
  held: Modifiers,
): Value | undefined {
  for (const [keys, value] of Object.entries(binding.keys)) {
    const combo = comboOf(keys);
    if (combo.key === key && modifiersMatch(combo, held)) {
      return value;
    }
  }
  return undefined;
}

export function wheeled<Value>(
  binding: Binding<Value>,
  wheel: Modifiers,
): Value | undefined {
  return pointed(binding, 'Wheel', wheel);
}

export function hovered<Value>(
  binding: Binding<Value>,
  pointer: Modifiers,
): Value | undefined {
  return pointed(binding, 'Hover', pointer);
}

export function shortcutOf(
  binding: Binding<unknown>,
  by: 'pointer' | 'keyboard',
): string | undefined {
  return Object.keys(binding.keys).find((keys) => {
    const { key } = comboOf(keys);
    return (key in buttons || pointerKeys.has(key)) === (by === 'pointer');
  });
}

export function isPointerKey(key: string): boolean {
  return key in buttons || pointerKeys.has(key);
}

export function modifierKey(press: KeyPress): boolean {
  return modifierKeys.has(press.key);
}

const rightButton = 2;

export function menuFromKeyboard(event: { readonly button: number }): boolean {
  return event.button !== rightButton;
}

export function pressedAlone(press: Modifiers): boolean {
  return !press.ctrlKey && !press.metaKey && !press.altKey;
}

export function released(pointer: { readonly buttons: number }): boolean {
  return pointer.buttons === 0;
}

export function pressOfInput(input: {
  readonly key: string;
  readonly code: string;
  readonly control: boolean;
  readonly meta: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly isAutoRepeat: boolean;
}): KeyPress {
  return {
    key: input.key,
    code: input.code,
    ctrlKey: input.control,
    metaKey: input.meta,
    altKey: input.alt,
    shiftKey: input.shift,
    repeat: input.isAutoRepeat,
  };
}
