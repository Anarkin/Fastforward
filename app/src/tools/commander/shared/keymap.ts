import { bind } from '../../../shell/shared/keymap';
import { strings } from '../../../shared/strings';

export const commanderGroups = [
  'Moving',
  'Listing',
  'Filtering',
  'Marking',
  'Operations',
  'Viewing',
  'Archives',
] as const;

export const viewerGroups = [
  'Scrolling',
  'Showing',
  'Text',
  'Searching',
] as const;

export type ViewMode = 'text' | 'hex' | 'preview';

export const commanderKeymap = {
  openFolder: bind('Moving', strings.actions.openFolder, { Enter: true }),
  parentFolder: bind('Moving', strings.actions.parentFolder, {
    Backspace: true,
  }),
  history: bind(
    'Moving',
    strings.actions.folderHistory,
    {
      'Alt+ArrowLeft': -1,
      'Alt+ArrowRight': 1,
      BackButton: -1,
      ForwardButton: 1,
    },
    { repeats: true },
  ),
  bookmarks: bind('Moving', strings.actions.bookmarks, { 'Ctrl+D': true }),
  goTo: bind('Moving', strings.actions.goToPath, { 'Ctrl+Shift+F6': true }),
  moveAcross: bind(
    'Moving',
    strings.actions.moveAcross,
    { ArrowLeft: 'left', ArrowRight: 'right' } as const,
    { repeats: true },
  ),
  side: bind('Moving', strings.actions.side, {
    Tab: true,
    'Shift+Tab': true,
  }),
  drive: bind('Moving', strings.actions.drive, {
    'Alt+F1': 'left',
    'Alt+F2': 'right',
  }),
  openOnSide: bind('Moving', strings.actions.openOnSide, {
    'Mod+ArrowLeft': 'left',
    'Mod+ArrowRight': 'right',
  }),
  layout: bind('Listing', strings.actions.layout, {
    'Mod+1': 'details',
    'Mod+2': 'thumbnails',
  } as const),
  sort: bind('Listing', strings.actions.sort, { Click: true }),
  groupByColor: bind('Listing', strings.actions.groupByColor, {
    'Ctrl+G': true,
  }),
  duplicates: bind('Listing', strings.actions.duplicates, {
    'Ctrl+Shift+G': true,
  }),
  showHidden: bind('Listing', strings.actions.showHidden, {
    'Ctrl+H': true,
  }),
  flatView: bind('Listing', strings.actions.flatView, { 'Ctrl+B': true }),
  countSizes: bind('Listing', strings.actions.countSizes, {
    'Alt+Shift+Enter': true,
  }),
  stopReading: bind('Listing', strings.actions.stopReading, { Escape: true }),
  reread: bind('Listing', strings.actions.reread, {
    F2: true,
    'Ctrl+R': true,
  }),
  filter: bind(
    'Filtering',
    strings.actions.filterFolder,
    { 'Mod+F': true },
    { fields: true },
  ),
  filterLetter: bind(
    'Filtering',
    strings.actions.filterLetter,
    { 'Alt+Letter': true },
    { fields: true },
  ),
  stopFiltering: bind(
    'Filtering',
    strings.actions.stopFiltering,
    { Escape: true },
    { fields: true },
  ),
  leaveFilter: bind(
    undefined,
    strings.actions.leaveFilter,
    { Enter: true },
    { fields: true },
  ),
  filterMove: bind(
    undefined,
    strings.actions.filterMove,
    {
      ArrowUp: 'up',
      ArrowDown: 'down',
      PageUp: 'pageUp',
      PageDown: 'pageDown',
    } as const,
    { repeats: true, fields: true },
  ),
  toggleMark: bind('Marking', strings.actions.toggleMark, {
    Space: true,
    Insert: false,
  }),
  markMoving: bind(
    'Marking',
    strings.actions.markMoving,
    {
      'Shift+ArrowUp': 'up',
      'Shift+ArrowDown': 'down',
      'Shift+PageUp': 'pageUp',
      'Shift+PageDown': 'pageDown',
      'Shift+Home': 'first',
      'Shift+End': 'last',
      'Shift+ArrowLeft': 'left',
      'Shift+ArrowRight': 'right',
    } as const,
    { repeats: true },
  ),
  markAll: bind('Marking', strings.actions.markAll, { 'Mod+A': true }),
  markPattern: bind('Marking', strings.actions.markPattern, {
    Plus: true,
    Minus: false,
  }),
  markExtension: bind('Marking', strings.actions.markExtension, {
    'Alt+Plus': true,
    'Alt+Minus': false,
  }),
  invertMarks: bind('Marking', strings.actions.invertMarks, {
    Asterisk: true,
  }),
  markClick: bind('Marking', strings.actions.markClick, {
    'Mod+Click': 'toggle',
    'Shift+Click': 'range',
  } as const),
  transferItems: bind('Operations', strings.actions.transferItems, {
    F5: false,
    F6: true,
  }),
  renameItem: bind('Operations', strings.actions.renameItem, {
    'Shift+F6': true,
  }),
  newFolder: bind('Operations', strings.actions.newFolder, { F7: true }),
  deleteItems: bind('Operations', strings.actions.deleteItems, {
    Delete: false,
    F8: false,
    'Shift+Delete': true,
    'Shift+F8': true,
  }),
  copyToClipboard: bind('Operations', strings.actions.copyToClipboard, {
    'Mod+C': true,
  }),
  paste: bind('Operations', strings.actions.pasteFiles, { 'Mod+V': true }),
  copyPaths: bind('Operations', strings.actions.copyPaths, {
    'Mod+Shift+C': 'paths',
  } as const),
  copyNames: bind('Operations', strings.actions.copyNames, {
    'Alt+Shift+C': 'names',
  } as const),
  contextMenu: bind('Operations', strings.actions.contextMenu, {
    RightClick: true,
    'Shift+F10': true,
    ContextMenu: true,
  }),
  systemMenu: bind('Operations', strings.actions.systemMenu, {
    'Shift+RightClick': true,
  }),
  view: bind('Viewing', strings.actions.viewFile, { F3: true }),
  compare: bind('Viewing', strings.actions.compareFiles, {
    'Shift+F3': true,
  }),
  openWithSevenZip: bind('Archives', strings.actions.openWithSevenZip, {
    'Shift+Enter': true,
  }),
  packItems: bind('Archives', strings.actions.packItems, { 'Alt+F5': true }),
  testArchives: bind('Archives', strings.actions.testArchives, {
    'Alt+Shift+F9': true,
  }),
};

export const viewerKeymap = {
  scroll: bind(
    'Scrolling',
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
  scrollSideways: bind(
    'Scrolling',
    strings.actions.scrollSideways,
    { ArrowLeft: -1, ArrowRight: 1 } as const,
    { repeats: true },
  ),
  wheelSideways: bind('Scrolling', strings.actions.wheelSideways, {
    'Shift+Wheel': true,
  }),
  viewAs: bind<ViewMode>('Showing', strings.actions.viewAs, {
    '1': 'hex',
    '2': 'text',
    '3': 'preview',
  }),
  encoding: bind('Text', strings.actions.chooseEncoding, { E: true }),
  language: bind('Text', strings.actions.chooseLanguage, { L: true }),
  wrap: bind('Text', strings.actions.wrap, { W: true }),
  showWhitespace: bind('Text', strings.actions.showWhitespace, { '.': true }),
  find: bind(
    'Searching',
    strings.actions.findInFile,
    { 'Mod+F': true },
    { fields: true },
  ),
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
  zoomPdf: bind('Showing', strings.actions.zoomPdf, { 'Mod+Wheel': true }),
  realSize: bind('Showing', strings.actions.realSize, { F: true }),
  closeViewer: bind('Showing', strings.actions.closeViewer, { Escape: true }),
};
