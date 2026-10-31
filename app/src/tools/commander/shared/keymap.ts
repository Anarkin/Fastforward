import { bind } from '../../../shell/shared/keymap';
import { strings } from '../../../shared/strings';

export const commanderGroups = ['Commander'] as const;

export const commanderKeymap = {
  side: bind('Commander', strings.actions.side, {
    Tab: true,
    'Shift+Tab': true,
  }),
  openFolder: bind('Commander', strings.actions.openFolder, { Enter: true }),
  parentFolder: bind('Commander', strings.actions.parentFolder, {
    Backspace: true,
  }),
  showHidden: bind('Commander', strings.actions.showHidden, {
    'Ctrl+H': true,
  }),
  drive: bind('Commander', strings.actions.drive, {
    'Alt+F1': 'left',
    'Alt+F2': 'right',
  }),
  sort: bind('Commander', strings.actions.sort, { Click: true }),
  history: bind(
    'Commander',
    strings.actions.folderHistory,
    {
      'Alt+ArrowLeft': -1,
      'Alt+ArrowRight': 1,
      BackButton: -1,
      ForwardButton: 1,
    },
    { repeats: true },
  ),
};
