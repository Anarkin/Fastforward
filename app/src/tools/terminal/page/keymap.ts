import { findBindings } from '../../../lib/page/findKeys';
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
  match: findBindings.match,
  stopFinding: findBindings.stopFinding,
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
