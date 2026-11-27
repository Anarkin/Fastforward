import { findBindings } from '../../../lib/page/findKeys';
import { bind } from '../../../lib/shared/keymap';
import { strings } from '../../../lib/shared/strings';

export const editorGroups = [
  'Editing',
  'Moving',
  'Cursors',
  'Searching',
] as const;

const typing = { repeats: true, fields: true } as const;

export const editorKeymap = {
  save: bind(
    'Editing',
    strings.actions.saveFile,
    { 'Mod+S': true },
    { fields: true },
  ),
  undo: bind('Editing', strings.actions.undo, { 'Mod+Z': true }, typing),
  redo: bind(
    'Editing',
    strings.actions.redo,
    { 'Mod+Y': true, 'Mod+Shift+Z': true },
    typing,
  ),
  newLine: bind('Editing', strings.actions.newLine, { Enter: true }, typing),
  deleteCharacter: bind(
    'Editing',
    strings.actions.deleteCharacter,
    { Backspace: -1, 'Shift+Backspace': -1, Delete: 1 } as const,
    typing,
  ),
  deleteWord: bind(
    'Editing',
    strings.actions.deleteWord,
    { 'Ctrl+Backspace': -1, 'Ctrl+Delete': 1 } as const,
    typing,
  ),
  indent: bind(
    'Editing',
    strings.actions.indent,
    { Tab: 1, 'Shift+Tab': -1 } as const,
    typing,
  ),
  tabLeaves: bind(
    'Editing',
    strings.actions.tabLeaves,
    { 'Ctrl+M': true },
    { fields: true },
  ),
  closeEditor: bind(
    'Editing',
    strings.actions.closeEditor,
    { Escape: true },
    { fields: true },
  ),
  viewEdited: bind('Editing', strings.actions.viewEdited, { F3: true }),
  compareVersions: bind('Editing', strings.actions.compareEditedVersions, {
    'Shift+F3': true,
  }),
  comment: bind(
    'Editing',
    strings.actions.toggleComment,
    { 'Mod+K': true },
    typing,
  ),
  moveLines: bind(
    'Editing',
    strings.actions.moveLines,
    { 'Alt+ArrowUp': -1, 'Alt+ArrowDown': 1 } as const,
    typing,
  ),
  cursorCharacter: bind(
    'Moving',
    strings.actions.cursorCharacter,
    {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      'Shift+ArrowLeft': 'selectLeft',
      'Shift+ArrowRight': 'selectRight',
    } as const,
    typing,
  ),
  cursorWord: bind(
    'Moving',
    strings.actions.cursorWord,
    {
      'Ctrl+ArrowLeft': 'left',
      'Ctrl+ArrowRight': 'right',
      'Ctrl+Shift+ArrowLeft': 'selectLeft',
      'Ctrl+Shift+ArrowRight': 'selectRight',
    } as const,
    typing,
  ),
  cursorRow: bind(
    'Moving',
    strings.actions.cursorRow,
    {
      ArrowUp: 'up',
      ArrowDown: 'down',
      'Shift+ArrowUp': 'selectUp',
      'Shift+ArrowDown': 'selectDown',
    } as const,
    typing,
  ),
  cursorPage: bind(
    'Moving',
    strings.actions.cursorPage,
    {
      PageUp: 'up',
      PageDown: 'down',
      'Shift+PageUp': 'selectUp',
      'Shift+PageDown': 'selectDown',
    } as const,
    typing,
  ),
  cursorFileEnd: bind(
    'Moving',
    strings.actions.cursorFileEnd,
    {
      'Mod+Home': 'up',
      'Mod+End': 'down',
      'Mod+Shift+Home': 'selectUp',
      'Mod+Shift+End': 'selectDown',
    } as const,
    typing,
  ),
  rowStart: bind(
    'Moving',
    strings.actions.rowStart,
    { Home: 'move', 'Shift+Home': 'select' } as const,
    typing,
  ),
  rowEnd: bind(
    'Moving',
    strings.actions.rowEnd,
    { End: 'move', 'Shift+End': 'select' } as const,
    typing,
  ),
  goToLine: bind(
    'Moving',
    strings.actions.goToLine,
    { 'Ctrl+G': true },
    { fields: true },
  ),
  wheelSideways: bind('Moving', strings.actions.wheelSideways, {
    'Shift+Wheel': true,
  }),
  selectAll: bind(
    'Cursors',
    strings.actions.selectAllText,
    { 'Mod+A': true },
    typing,
  ),
  selectText: bind('Cursors', strings.actions.selectText, {
    Click: 'start',
    'Shift+Click': 'extend',
  } as const),
  addCursor: bind('Cursors', strings.actions.addCursor, {
    'Alt+Click': true,
  }),
  columnSelection: bind('Cursors', strings.actions.columnSelection, {
    'Shift+Alt+Drag': true,
  }),
  nextOccurrence: bind(
    'Cursors',
    strings.actions.nextOccurrence,
    { 'Mod+D': true },
    typing,
  ),
  cursorRows: bind(
    'Cursors',
    strings.actions.cursorRows,
    { 'Ctrl+Alt+ArrowUp': -1, 'Ctrl+Alt+ArrowDown': 1 } as const,
    typing,
  ),
  singleCursor: bind(
    'Cursors',
    strings.actions.singleCursor,
    { Escape: true },
    { fields: true },
  ),
  find: bind(
    'Searching',
    strings.actions.findInFile,
    { 'Mod+F': true },
    { fields: true },
  ),
  replace: bind(
    'Searching',
    strings.actions.replaceInFile,
    { 'Ctrl+H': true },
    { fields: true },
  ),
  match: findBindings.match,
  stopFinding: findBindings.stopFinding,
};
