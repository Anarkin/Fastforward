import { strings } from './strings';

export type Group = 'Tabs' | 'History' | 'Columns' | 'Files' | 'Diff' | 'App';

export const groups: readonly Group[] = [
  'Tabs',
  'History',
  'Columns',
  'Files',
  'Diff',
  'App',
];

// Keys are written as Mod, Ctrl, Alt and Shift before the key KeyboardEvent
// names, a letter in capitals; Mod is Cmd on macOS, while Ctrl stays Ctrl there
export interface Binding<Value> {
  readonly group: Group | undefined;
  readonly action: string;
  readonly keys: Readonly<Record<string, Value>>;
  readonly repeats: boolean;
  readonly fields: boolean;
}

function bind<const Value>(
  group: Group | undefined,
  action: string,
  keys: Readonly<Record<string, Value>>,
  { repeats = false, fields = false } = {},
): Binding<Value> {
  return { group, action, keys, repeats, fields };
}

// Without a group, the shortcuts screen leaves a binding out, as the keys
// menus and search fields take
export const keymap = {
  openRepository: bind('Tabs', strings.actions.openRepository, {
    'Mod+T': true,
  }),
  repository: bind(
    'Tabs',
    strings.actions.repository,
    { 'Ctrl+Tab': 1, 'Ctrl+Shift+Tab': -1 },
    { repeats: true },
  ),
  worktree: bind(
    'Tabs',
    strings.actions.worktree,
    { 'Ctrl+PageDown': 1, 'Ctrl+PageUp': -1 },
    { repeats: true },
  ),
  closeRepository: bind('Tabs', strings.actions.closeRepository, {
    MiddleClick: true,
  }),
  head: bind('History', strings.actions.head, { H: true }),
  upstream: bind('History', strings.actions.upstream, { U: true }),
  search: bind('History', strings.actions.search, {
    S: true,
  }),
  commits: bind('History', strings.actions.commits, { C: true }),
  move: bind(
    'History',
    strings.actions.move,
    { ArrowUp: 'up', ArrowDown: 'down' },
    { repeats: true },
  ),
  page: bind(
    'History',
    strings.actions.page,
    { PageUp: 'pageUp', PageDown: 'pageDown', Home: 'first', End: 'last' },
    { repeats: true },
  ),
  parent: bind('History', strings.actions.parent, { 'Alt+ArrowDown': true }),
  merge: bind('History', strings.actions.merge, { Space: true }),
  compare: bind('History', strings.actions.compare, {
    'Mod+Click': true,
  }),
  navigate: bind('History', strings.actions.navigate, {
    BackButton: 'back',
    ForwardButton: 'forward',
  }),
  column: bind(
    'Columns',
    strings.actions.column,
    {
      Tab: 'next',
      'Shift+Tab': 'previous',
      ArrowRight: 'right',
      ArrowLeft: 'left',
    },
    { repeats: true },
  ),
  folder: bind('Files', strings.actions.folder, { Space: true }),
  change: bind(
    'Diff',
    strings.actions.change,
    { J: 1, K: -1 },
    { repeats: true },
  ),
  sideways: bind(
    'Diff',
    strings.actions.sideways,
    { ArrowRight: 1, ArrowLeft: -1 },
    { repeats: true },
  ),
  wheelSideways: bind('Diff', strings.actions.wheelSideways, {
    'Shift+Wheel': true,
  }),
  wrap: bind('Diff', strings.actions.wrap, { W: true }),
  find: bind('Diff', strings.actions.find, { 'Mod+F': true }),
  match: bind(
    'Diff',
    strings.actions.match,
    { Enter: 1, 'Shift+Enter': -1 },
    { repeats: true, fields: true },
  ),
  stopFinding: bind(
    'Diff',
    strings.actions.stopFinding,
    { Escape: true },
    { fields: true },
  ),
  shortcuts: bind('App', strings.actions.shortcuts, { F1: true, '?': true }),
  devTools: bind('App', strings.actions.devTools, { 'Mod+Shift+I': true }),
  close: bind(
    undefined,
    strings.actions.close,
    { Escape: true },
    { fields: true },
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
  MiddleClick: 1,
  BackButton: 3,
  ForwardButton: 4,
};

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

// Typing a character may take Shift, so Shift tells such keys apart no more
function shiftMatters(key: string): boolean {
  return isLetter(key) || key.length > 1;
}

function modifiersMatch(combo: Combo, held: Modifiers): boolean {
  const ctrl = combo.mod
    ? held.ctrlKey || held.metaKey
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

// A key that would type or move the caret in a text field is the field's
function editsField(combo: Combo): boolean {
  return (
    !combo.mod &&
    !combo.ctrl &&
    (isLetter(combo.key) ||
      combo.key.length === 1 ||
      combo.key === 'Space' ||
      caretKeys.has(combo.key))
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
      combo.key !== 'Wheel' &&
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

export function wheeled<Value>(
  binding: Binding<Value>,
  wheel: Modifiers,
): Value | undefined {
  for (const [keys, value] of Object.entries(binding.keys)) {
    const combo = comboOf(keys);
    if (combo.key === 'Wheel' && modifiersMatch(combo, wheel)) {
      return value;
    }
  }
  return undefined;
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

export function keyLabels(keys: string, mac: boolean): string[] {
  const combo = comboOf(keys);
  const names: Readonly<Record<string, string>> = strings.keys;
  return [
    ...(combo.mod ? [mac ? strings.keys.Command : strings.keys.Ctrl] : []),
    ...(combo.ctrl ? [strings.keys.Ctrl] : []),
    ...(combo.alt ? [mac ? strings.keys.Option : strings.keys.Alt] : []),
    ...(combo.shift ? [strings.keys.Shift] : []),
    names[combo.key] ?? combo.key,
  ];
}
