import { bind } from '../../../shell/shared/keymap';
import { strings } from '../../../shared/strings';

export const gitGroups = [
  'Worktrees',
  'Moving',
  'Commits',
  'Messages',
  'Columns',
  'Files',
  'Diff',
] as const;

export const gitKeymap = {
  worktree: bind(
    'Worktrees',
    strings.actions.worktree,
    { 'Ctrl+PageDown': 1, 'Ctrl+PageUp': -1 },
    { repeats: true },
  ),
  head: bind('Moving', strings.actions.head, { H: true }),
  upstream: bind('Moving', strings.actions.upstream, { U: true }),
  parent: bind('Moving', strings.actions.parent, { 'Mod+ArrowDown': true }),
  navigate: bind('Moving', strings.actions.navigate, {
    BackButton: 'back',
    ForwardButton: 'forward',
    'Alt+ArrowLeft': 'back',
    'Alt+ArrowRight': 'forward',
  }),
  merge: bind('Commits', strings.actions.merge, { Space: true }),
  compare: bind('Commits', strings.actions.compare, { 'Mod+Click': true }),
  message: bind('Messages', strings.actions.message, {
    'Alt+Hover': true,
    Alt: true,
  }),
  pin: bind('Messages', strings.actions.pin, {
    'Alt+Click': true,
    'Alt+Enter': true,
  }),
  peekStep: bind(
    'Messages',
    strings.actions.peekStep,
    { 'Alt+ArrowUp': 'up', 'Alt+ArrowDown': 'down' },
    { repeats: true },
  ),
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
  commits: bind('Columns', strings.actions.commits, { C: true }),
  find: bind('Columns', strings.actions.find, { 'Mod+F': true }),
  stopFinding: bind(
    'Columns',
    strings.actions.stopFinding,
    { Escape: true },
    { fields: true },
  ),
  folder: bind('Files', strings.actions.folder, { Space: true }),
  toFiles: bind(
    'Files',
    strings.actions.toFiles,
    { Enter: true, ArrowDown: true },
    { fields: true },
  ),
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
  showWhitespace: bind('Diff', strings.actions.showWhitespace, { '.': true }),
  match: bind(
    'Diff',
    strings.actions.match,
    { Enter: 1, 'Shift+Enter': -1 },
    { repeats: true, fields: true },
  ),
};
