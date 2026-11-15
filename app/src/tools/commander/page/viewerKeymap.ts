import { bind } from '../../../lib/shared/keymap';
import { strings } from '../../../lib/shared/strings';

export const viewerGroups = [
  'Scrolling',
  'Showing',
  'Text',
  'Searching',
] as const;

export type ViewMode = 'text' | 'hex' | 'preview';

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
  edit: bind('Showing', strings.actions.editViewed, { F4: true }),
  closeViewer: bind('Showing', strings.actions.closeViewer, { Escape: true }),
};
