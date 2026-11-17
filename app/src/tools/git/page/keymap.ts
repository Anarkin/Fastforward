import { bind } from '../../../lib/shared/keymap';
import { strings } from '../../../lib/shared/strings';
import { diffKeymap } from '../../../components/diff/page/keymap';

export const gitGroups = [
  'Moving',
  'Commits',
  'Messages',
  'Files',
  'Searching',
] as const;

export const gitKeymap = {
  worktree: bind(
    'Moving',
    strings.actions.worktree,
    { 'Ctrl+PageDown': 1, 'Ctrl+PageUp': -1 },
    { repeats: true },
  ),
  head: bind('Commits', strings.actions.head, { H: true }),
  upstream: bind('Commits', strings.actions.upstream, { U: true }),
  parent: bind('Commits', strings.actions.parent, { 'Mod+ArrowDown': true }),
  navigate: bind('Commits', strings.actions.navigate, {
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
    'Moving',
    strings.actions.column,
    {
      Tab: 'next',
      'Shift+Tab': 'previous',
      ArrowRight: 'right',
      ArrowLeft: 'left',
    },
    { repeats: true },
  ),
  commits: bind('Moving', strings.actions.commits, { C: true }),
  find: diffKeymap.find,
  match: diffKeymap.match,
  stopFinding: diffKeymap.stopFinding,
  folder: bind('Files', strings.actions.folder, { Space: true }),
  viewFile: bind('Files', strings.actions.viewDiffFile, { F3: true }),
  toFiles: bind(
    'Files',
    strings.actions.toFiles,
    { Enter: true, ArrowDown: true },
    { fields: true },
  ),
  change: diffKeymap.change,
  sideways: diffKeymap.sideways,
  wheelSideways: diffKeymap.wheelSideways,
  wrap: diffKeymap.wrap,
  showWhitespace: diffKeymap.showWhitespace,
  language: diffKeymap.language,
};
