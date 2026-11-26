import { bind } from '../../../lib/shared/keymap';
import { strings } from '../../../lib/shared/strings';

export const canvasGroups = ['Editing', 'Moving'] as const;

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
  resize: bind('Editing', strings.actions.resizeNode, { Drag: true }),
  delete: bind('Editing', strings.actions.deleteNodes, {
    Delete: true,
    Backspace: true,
  }),
  selectAll: bind('Editing', strings.actions.selectAllNodes, { 'Mod+A': true }),
  leave: bind('Editing', strings.actions.leaveNodes, { Escape: true }),
  undo: bind('Editing', strings.actions.undo, { 'Mod+Z': true }),
  redo: bind('Editing', strings.actions.redo, {
    'Mod+Y': true,
    'Mod+Shift+Z': true,
  }),
  save: bind('Editing', strings.actions.saveCanvas, { 'Mod+S': true }),
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
