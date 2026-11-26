import { bind } from '../../../lib/shared/keymap';
import { strings } from '../../../lib/shared/strings';

export const canvasGroups = ['Editing', 'Typing', 'Moving'] as const;

const typing = { repeats: true, fields: true } as const;

export const canvasKeymap = {
  placeText: bind('Editing', strings.actions.placeTextNode, { 'Mod+1': true }),
  placeGroup: bind('Editing', strings.actions.placeGroupNode, {
    'Mod+2': true,
  }),
  select: bind('Editing', strings.actions.selectNodes, {
    Click: 'one',
    'Mod+Click': 'toggle',
    'Shift+Click': 'add',
  } as const),
  selectArea: bind('Editing', strings.actions.selectArea, {
    Drag: 'one',
    'Shift+Drag': 'add',
    'Mod+Drag': 'add',
  } as const),
  move: bind('Editing', strings.actions.moveNodes, { Drag: true }),
  connect: bind('Editing', strings.actions.connectNodes, { Drag: true }),
  point: bind('Editing', strings.actions.pointEdges, { A: true }),
  resize: bind('Editing', strings.actions.resizeNode, { Drag: true }),
  delete: bind('Editing', strings.actions.deleteNodes, {
    Delete: true,
    Backspace: true,
  }),
  selectAll: bind('Editing', strings.actions.selectAllNodes, { 'Mod+A': true }),
  leave: bind('Editing', strings.actions.leaveNodes, { Escape: true }),
  undo: bind('Editing', strings.actions.undo, { 'Mod+Z': true }, typing),
  redo: bind(
    'Editing',
    strings.actions.redo,
    { 'Mod+Y': true, 'Mod+Shift+Z': true },
    typing,
  ),
  save: bind(
    'Editing',
    strings.actions.saveCanvas,
    { 'Mod+S': true },
    { fields: true },
  ),
  typeIn: bind('Typing', strings.actions.typeInNode, { Enter: true }),
  stopTyping: bind(
    'Typing',
    strings.actions.stopTyping,
    { Escape: true },
    { fields: true },
  ),
  placeCaret: bind('Typing', strings.actions.placeCaret, {
    Click: 'place',
    'Shift+Click': 'extend',
  } as const),
  newLine: bind(
    'Typing',
    strings.actions.newLineInNode,
    { Enter: true, 'Shift+Enter': true },
    typing,
  ),
  deleteCharacter: bind(
    'Typing',
    strings.actions.deleteCharacter,
    { Backspace: -1, 'Shift+Backspace': -1, Delete: 1 } as const,
    typing,
  ),
  deleteWord: bind(
    'Typing',
    strings.actions.deleteWord,
    { 'Ctrl+Backspace': -1, 'Ctrl+Delete': 1 } as const,
    typing,
  ),
  cursorCharacter: bind(
    'Typing',
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
    'Typing',
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
    'Typing',
    strings.actions.cursorRow,
    {
      ArrowUp: 'up',
      ArrowDown: 'down',
      'Shift+ArrowUp': 'selectUp',
      'Shift+ArrowDown': 'selectDown',
    } as const,
    typing,
  ),
  rowStart: bind(
    'Typing',
    strings.actions.rowStart,
    { Home: 'move', 'Shift+Home': 'select' } as const,
    typing,
  ),
  rowEnd: bind(
    'Typing',
    strings.actions.rowEnd,
    { End: 'move', 'Shift+End': 'select' } as const,
    typing,
  ),
  cursorTextEnd: bind(
    'Typing',
    strings.actions.cursorTextEnd,
    {
      'Mod+Home': 'up',
      'Mod+End': 'down',
      'Mod+Shift+Home': 'selectUp',
      'Mod+Shift+End': 'selectDown',
    } as const,
    typing,
  ),
  selectAllText: bind(
    'Typing',
    strings.actions.selectAllText,
    { 'Mod+A': true },
    typing,
  ),
  pan: bind('Moving', strings.actions.panCanvas, {
    Wheel: true,
    MiddleDrag: true,
  }),
  panAcross: bind('Moving', strings.actions.panCanvasAcross, {
    'Shift+Wheel': true,
  }),
  panHeld: bind('Moving', strings.actions.panCanvasHeld, { Space: true }),
  panHeldDrag: bind(undefined, strings.actions.panCanvasHeld, { Drag: true }),
};
