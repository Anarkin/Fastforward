import { strings } from '../../shared/strings';

export const tabGroups = ['Tabs'] as const;

export const appGroups = ['App'] as const;

export interface Binding<Value> {
  readonly group: string | undefined;
  readonly action: string;
  readonly keys: Readonly<Record<string, Value>>;
  readonly repeats: boolean;
  readonly fields: boolean;
  readonly dialogs: boolean;
}

export interface ShortcutGroup {
  readonly title: string;
  readonly bindings: readonly Binding<unknown>[];
  readonly pinned?: boolean;
}

export function shortcutGroupsOf<const Group extends string>(
  groups: readonly Group[],
  titles: Readonly<Record<Group, string>>,
  bindings: Readonly<Record<string, Binding<unknown>>>,
): ShortcutGroup[] {
  return groups.map((group) => ({
    title: titles[group],
    bindings: Object.values(bindings).filter(
      (binding) => binding.group === group,
    ),
  }));
}

export function bind<const Value>(
  group: string | undefined,
  action: string,
  keys: Readonly<Record<string, Value>>,
  { repeats = false, fields = false, dialogs = false } = {},
): Binding<Value> {
  return { group, action, keys, repeats, fields, dialogs };
}

export const keymap = {
  newTab: bind('Tabs', strings.actions.newTab, {
    'Mod+T': true,
  }),
  tab: bind(
    'Tabs',
    strings.actions.tab,
    { 'Ctrl+Tab': 1, 'Ctrl+Shift+Tab': -1 },
    { repeats: true },
  ),
  closeTab: bind('Tabs', strings.actions.closeTab, {
    MiddleClick: true,
    'Mod+W': true,
  }),
  moveTab: bind('Tabs', strings.actions.moveTab, {
    Drag: true,
  }),
  removeItem: bind('Tabs', strings.actions.removeItem, {
    Delete: true,
  }),
  mainMenu: bind('App', strings.actions.mainMenu, { 'Alt+F': true }),
  shortcuts: bind(
    'App',
    strings.actions.shortcuts,
    { F1: true, '?': true },
    { dialogs: true },
  ),
  about: bind(
    'App',
    strings.actions.about,
    { 'Shift+F1': true },
    { dialogs: true },
  ),
  devTools: bind(undefined, strings.actions.devTools, { 'Mod+Shift+I': true }),
  move: bind(
    undefined,
    strings.actions.move,
    { ArrowUp: 'up', ArrowDown: 'down' },
    { repeats: true },
  ),
  page: bind(
    undefined,
    strings.actions.page,
    { PageUp: 'pageUp', PageDown: 'pageDown', Home: 'first', End: 'last' },
    { repeats: true },
  ),
  close: bind(
    undefined,
    strings.actions.close,
    { Escape: true },
    { fields: true },
  ),
  dialogFocus: bind(
    undefined,
    strings.actions.dialogFocus,
    { Tab: 1, 'Shift+Tab': -1 },
    { repeats: true, fields: true },
  ),
  menuItem: bind(
    undefined,
    strings.actions.menuItem,
    { ArrowDown: 'next', ArrowUp: 'previous', Home: 'first', End: 'last' },
    { repeats: true },
  ),
  submenu: bind(undefined, strings.actions.submenu, {
    ArrowRight: 'open',
    ArrowLeft: 'back',
  }),
  result: bind(
    undefined,
    strings.actions.result,
    { ArrowDown: 1, ArrowUp: -1 },
    { repeats: true, fields: true },
  ),
  go: bind(undefined, strings.actions.go, { Enter: true }, { fields: true }),
  drag: bind(undefined, strings.actions.drag, { Click: true }),
};

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

function comboOf(keys: string): Combo {
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
  BackButton: 3,
  ForwardButton: 4,
};

const pointerKeys = new Set(['Wheel', 'Hover']);

const modifierKeys = new Set(['Alt', 'AltGraph', 'Control', 'Shift', 'Meta']);

const named: Readonly<Record<string, string>> = { Space: ' ' };

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
  return isLetter(key) || key.length > 1;
}

let macKeys = false;

export function setKeyPlatform(platform: string): void {
  macKeys = platform === 'darwin';
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

function keyMatches(combo: Combo, press: KeyPress): boolean {
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

export function keyLabels(keys: string, mac = macKeys): string[] {
  const combo = comboOf(keys);
  const names: Readonly<Record<string, string>> = strings.keys;
  return [
    ...(combo.mod ? [mac ? strings.keys.Command : strings.keys.Ctrl] : []),
    ...(combo.ctrl ? [strings.keys.Ctrl] : []),
    ...(combo.alt ? [mac ? strings.keys.Option : strings.keys.Alt] : []),
    ...(combo.shift ? [strings.keys.Shift] : []),
    names[mac && combo.key === 'Alt' ? 'Option' : combo.key] ?? combo.key,
  ];
}
