import { bind } from '../../../shell/shared/keymap';
import { strings } from '../../../shared/strings';

export const terminalGroups = ['Terminal'] as const;

export const terminalKeymap = {
  copy: bind('Terminal', strings.actions.copySelection, {
    'Mod+C': 'selected',
    'Mod+Shift+C': 'always',
  }),
  paste: bind('Terminal', strings.actions.paste, {
    'Mod+V': true,
    'Mod+Shift+V': true,
  }),
  leftToApp: bind(
    undefined,
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
