import { bind } from '../../../shell/shared/keymap';
import { strings } from '../../../shared/strings';

export const commanderGroups = [
  'Folders',
  'Sides',
  'Marking',
  'Viewing',
] as const;

export const viewerGroups = ['Viewer'] as const;

export type ViewMode = 'text' | 'hex' | 'preview';

export const commanderKeymap = {
  openFolder: bind('Folders', strings.actions.openFolder, { Enter: true }),
  parentFolder: bind('Folders', strings.actions.parentFolder, {
    Backspace: true,
  }),
  history: bind(
    'Folders',
    strings.actions.folderHistory,
    {
      'Alt+ArrowLeft': -1,
      'Alt+ArrowRight': 1,
      BackButton: -1,
      ForwardButton: 1,
    },
    { repeats: true },
  ),
  reread: bind('Folders', strings.actions.reread, {
    F2: true,
    'Ctrl+R': true,
  }),
  showHidden: bind('Folders', strings.actions.showHidden, {
    'Ctrl+H': true,
  }),
  sort: bind('Folders', strings.actions.sort, { Click: true }),
  side: bind('Sides', strings.actions.side, {
    Tab: true,
    'Shift+Tab': true,
  }),
  drive: bind('Sides', strings.actions.drive, {
    'Alt+F1': 'left',
    'Alt+F2': 'right',
  }),
  openOnSide: bind('Sides', strings.actions.openOnSide, {
    'Mod+ArrowLeft': 'left',
    'Mod+ArrowRight': 'right',
  }),
  markMoving: bind('Marking', strings.actions.markMoving, {
    'Shift+ArrowUp': 'up',
    'Shift+ArrowDown': 'down',
    'Shift+PageUp': 'pageUp',
    'Shift+PageDown': 'pageDown',
    'Shift+Home': 'first',
    'Shift+End': 'last',
  } as const),
  toggleMark: bind('Marking', strings.actions.toggleMark, {
    Space: true,
    Insert: true,
  }),
  markClick: bind('Marking', strings.actions.markClick, {
    'Mod+Click': 'toggle',
    'Shift+Click': 'range',
  } as const),
  view: bind('Viewing', strings.actions.viewFile, { F3: true }),
  compare: bind('Viewing', strings.actions.compareFiles, {
    'Shift+F3': true,
  }),
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
