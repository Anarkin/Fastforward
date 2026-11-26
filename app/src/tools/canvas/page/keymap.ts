import { bind } from '../../../lib/shared/keymap';
import { strings } from '../../../lib/shared/strings';

export const canvasGroups = ['Moving'] as const;

export const canvasKeymap = {
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
