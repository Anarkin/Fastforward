import { bind } from '../../../shell/shared/keymap';
import { strings } from '../../../shared/strings';

export const terminalGroups = ['Clipboard', 'Kept'] as const;

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
  leftToApp: bind(
    'Kept',
    strings.actions.leftToApp,
    {
      'Ctrl+Tab': true,
      'Ctrl+Shift+Tab': true,
      'Mod+Shift+T': true,
      'Mod+Shift+W': true,
      'Mod+Shift+O': true,
    },
    { repeats: true },
  ),
};
