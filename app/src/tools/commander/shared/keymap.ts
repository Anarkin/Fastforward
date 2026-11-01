import { bind } from '../../../shell/shared/keymap';
import { strings } from '../../../shared/strings';

export const commanderGroups = ['Commander'] as const;

export const viewerGroups = ['Viewer'] as const;

export type ViewMode = 'text' | 'hex' | 'preview';

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
  view: bind('Commander', strings.actions.viewFile, { F3: true }),
  compare: bind('Commander', strings.actions.compareFiles, {
    'Shift+F3': true,
  }),
  markMoving: bind('Commander', strings.actions.markMoving, {
    'Shift+ArrowUp': 'up',
    'Shift+ArrowDown': 'down',
    'Shift+PageUp': 'pageUp',
    'Shift+PageDown': 'pageDown',
    'Shift+Home': 'first',
    'Shift+End': 'last',
  } as const),
  toggleMark: bind('Commander', strings.actions.toggleMark, {
    Space: true,
    Insert: true,
  }),
  markClick: bind('Commander', strings.actions.markClick, {
    'Mod+Click': 'toggle',
    'Shift+Click': 'range',
  } as const),
  reread: bind('Commander', strings.actions.reread, {
    F2: true,
    'Ctrl+R': true,
  }),
  openOnSide: bind('Commander', strings.actions.openOnSide, {
    'Mod+ArrowLeft': 'left',
    'Mod+ArrowRight': 'right',
  }),
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

export const viewerKeymap = {
  scroll: bind(
    'Viewer',
    strings.actions.scrollFile,
    {
      ArrowUp: 'up',
      ArrowDown: 'down',
      PageUp: 'pageUp',
      PageDown: 'pageDown',
      Home: 'first',
      End: 'last',
    } as const,
    { repeats: true },
  ),
  viewAs: bind<ViewMode>('Viewer', strings.actions.viewAs, {
    '1': 'text',
    '2': 'hex',
    '3': 'preview',
  }),
  encoding: bind('Viewer', strings.actions.chooseEncoding, { E: true }),
  find: bind(
    'Viewer',
    strings.actions.findInFile,
    { 'Mod+F': true },
    { fields: true },
  ),
  match: bind(
    'Viewer',
    strings.actions.match,
    { Enter: 1, 'Shift+Enter': -1 } as const,
    { repeats: true, fields: true },
  ),
  stopFinding: bind(
    'Viewer',
    strings.actions.stopFinding,
    { Escape: true },
    { fields: true },
  ),
  closeViewer: bind('Viewer', strings.actions.closeViewer, { Escape: true }),
};
