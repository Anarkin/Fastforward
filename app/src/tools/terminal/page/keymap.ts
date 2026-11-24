import { bind } from '../../../lib/shared/keymap';
import { strings } from '../../../lib/shared/strings';

export const terminalGroups = ['Clipboard', 'Searching', 'Kept'] as const;

export const terminalKeymap = {
  copy: bind(
    'Clipboard',
    strings.actions.copySelection,
    { 'Mod+C': 'selected', 'Mod+Shift+C': 'always' },
    { repeats: true },
  ),
  paste: bind(
    'Clipboard',
    strings.actions.paste,
    { 'Mod+V': true, 'Mod+Shift+V': true },
    { repeats: true },
  ),
  find: bind('Searching', strings.actions.findInTerminal, {
    'Mod+Shift+F': true,
  }),
  match: bind(
    'Searching',
    strings.actions.match,
    { Enter: 1, 'Shift+Enter': -1 } as const,
    { repeats: true, fields: true },
  ),
  stopFinding: bind(
    'Searching',
    strings.actions.stopFinding,
    { Escape: true },
    { fields: true },
  ),
  leftToApp: bind(
    'Kept',
    strings.actions.leftToApp,
    {
      'Ctrl+Tab': true,
      'Ctrl+Shift+Tab': true,
      'Mod+Shift+T': true,
      'Mod+Shift+N': true,
      'Mod+Shift+W': true,
      'Mod+Shift+O': true,
    },
    { repeats: true },
  ),
};
