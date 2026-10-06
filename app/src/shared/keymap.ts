export type Group = 'Tabs' | 'History' | 'Columns' | 'Files' | 'Diff' | 'App';

export const groups: readonly Group[] = [
  'Tabs',
  'History',
  'Columns',
  'Files',
  'Diff',
  'App',
];

// Keys are written as Mod, Ctrl and Shift before the key KeyboardEvent names,
// a letter in capitals; Mod is Cmd on macOS, while Ctrl stays Ctrl there
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
  openRepository: bind('Tabs', 'Open a repository', { 'Mod+T': true }),
  repository: bind(
    'Tabs',
    'Next or previous repository',
    { 'Ctrl+Tab': 1, 'Ctrl+Shift+Tab': -1 },
    { repeats: true },
  ),
  worktree: bind(
    'Tabs',
    'Next or previous worktree',
    { 'Ctrl+PageDown': 1, 'Ctrl+PageUp': -1 },
    { repeats: true },
  ),
  closeRepository: bind('Tabs', 'Close a repository', { MiddleClick: true }),
  head: bind('History', 'Select the checked-out commit', { H: true }),
  upstream: bind('History', 'Select the upstream of its branch', { U: true }),
  search: bind('History', 'Search branches, remotes, tags and commits', {
    S: true,
  }),
  commits: bind('History', 'Show or hide the commit list', { C: true }),
  move: bind(
    'History',
    'Move in a list',
    { ArrowUp: 'up', ArrowDown: 'down' },
    { repeats: true },
  ),
  page: bind(
    'History',
    'Move a page, or to either end',
    { PageUp: 'pageUp', PageDown: 'pageDown', Home: 'first', End: 'last' },
    { repeats: true },
  ),
  compare: bind('History', 'Compare with the commit selected', {
    'Mod+Click': true,
  }),
  navigate: bind('History', 'Back or forward', {
    BackButton: 'back',
    ForwardButton: 'forward',
  }),
  column: bind(
    'Columns',
    'Next or previous column',
    {
      Tab: 'next',
      'Shift+Tab': 'previous',
      ArrowRight: 'right',
      ArrowLeft: 'left',
    },
    { repeats: true },
  ),
  folder: bind('Files', 'Open or close a folder', { Space: true }),
  change: bind(
    'Diff',
    'Next or previous change',
    { J: 1, K: -1 },
    { repeats: true },
  ),
  sideways: bind(
    'Diff',
    'Scroll sideways',
    { ArrowRight: 1, ArrowLeft: -1 },
    { repeats: true },
  ),
  wheelSideways: bind('Diff', 'Scroll sideways with the wheel', {
    'Shift+Wheel': true,
  }),
  wrap: bind('Diff', 'Wrap long lines', { W: true }),
  find: bind('Diff', 'Find', { 'Mod+F': true }),
  match: bind(
    'Diff',
    'Next or previous match',
    { Enter: 1, 'Shift+Enter': -1 },
    { repeats: true, fields: true },
  ),
  stopFinding: bind('Diff', 'Stop finding', { Escape: true }, { fields: true }),
  shortcuts: bind('App', 'Show these shortcuts', { F1: true, '?': true }),
  devTools: bind('App', 'Developer tools', { 'Mod+Shift+I': true }),
  close: bind(
    undefined,
    'Close a menu or popup',
    { Escape: true },
    { fields: true },
  ),
  menuItem: bind(
    undefined,
    'Move in a menu',
    { ArrowDown: 'next', ArrowUp: 'previous', Home: 'first', End: 'last' },
    { repeats: true },
  ),
  submenu: bind(undefined, 'Open a submenu, or go back from it', {
    ArrowRight: 'open',
    ArrowLeft: 'back',
  }),
  result: bind(
    undefined,
    'Move in the search results',
    { ArrowDown: 1, ArrowUp: -1 },
    { repeats: true, fields: true },
  ),
  go: bind(
    undefined,
    'Go to the search result',
    { Enter: true },
    { fields: true },
  ),
  drag: bind(undefined, 'Drag a scrollbar or the minimap', { Click: true }),
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
  readonly shift: boolean;
}

function comboOf(keys: string): Combo {
  const parts = keys.split('+');
  const key = parts.pop() ?? '';
  return {
    key,
    mod: parts.includes('Mod'),
    ctrl: parts.includes('Ctrl'),
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
    !held.altKey &&
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

const labels: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Escape: 'Esc',
  MiddleClick: 'Middle-click',
  BackButton: 'Mouse Back',
  ForwardButton: 'Mouse Forward',
};

export function keyLabels(keys: string, mac: boolean): string[] {
  const combo = comboOf(keys);
  return [
    ...(combo.mod ? [mac ? '⌘' : 'Ctrl'] : []),
    ...(combo.ctrl ? ['Ctrl'] : []),
    ...(combo.shift ? ['Shift'] : []),
    labels[combo.key] ?? combo.key,
  ];
}
