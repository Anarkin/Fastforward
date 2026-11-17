import { bind } from '../shared/keymap';
import { strings } from '../shared/strings';

export const keymap = {
  removeItem: bind('Tabs', strings.actions.removeItem, {
    Delete: true,
  }),
  move: bind(
    'Lists',
    strings.actions.move,
    { ArrowUp: 'up', ArrowDown: 'down' },
    { repeats: true },
  ),
  page: bind(
    'Lists',
    strings.actions.page,
    { PageUp: 'pageUp', PageDown: 'pageDown', Home: 'first', End: 'last' },
    { repeats: true },
  ),
  close: bind(
    'Lists',
    strings.actions.close,
    { Escape: true },
    { fields: true },
  ),
  dialogFocus: bind(
    'Lists',
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
  dialogButton: bind(
    undefined,
    strings.actions.dialogButton,
    {
      ArrowLeft: 'previous',
      ArrowUp: 'previous',
      ArrowRight: 'next',
      ArrowDown: 'next',
      Home: 'first',
      End: 'last',
    },
    { repeats: true, dialogs: true },
  ),
  menuFilter: bind(
    undefined,
    strings.actions.menuFilter,
    { ArrowDown: 'items', Enter: 'first' } as const,
    { fields: true },
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
  systemMenu: bind(undefined, strings.actions.systemMenu, {
    'Shift+RightClick': true,
  }),
};
