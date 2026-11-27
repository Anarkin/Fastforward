import { findBindings } from '../../../lib/page/findKeys';
import { bind } from '../../../lib/shared/keymap';
import { strings } from '../../../lib/shared/strings';

export const diffKeymap = {
  find: bind('Searching', strings.actions.find, { 'Mod+F': true }),
  match: findBindings.match,
  stopFinding: findBindings.stopFinding,
  change: bind(
    'Diff',
    strings.actions.change,
    { J: 1, K: -1 },
    { repeats: true },
  ),
  sideways: bind(
    'Diff',
    strings.actions.sideways,
    { ArrowRight: 1, ArrowLeft: -1 },
    { repeats: true },
  ),
  wheelSideways: bind('Diff', strings.actions.wheelSideways, {
    'Shift+Wheel': true,
  }),
  selectText: bind('Diff', strings.actions.selectText, {
    Click: 'start',
    'Shift+Click': 'extend',
  } as const),
  selectAll: bind('Diff', strings.actions.selectWholeSide, { 'Mod+A': true }),
  wrap: bind('Diff', strings.actions.wrap, { W: true }),
  showWhitespace: bind('Diff', strings.actions.showWhitespace, { '.': true }),
  language: bind('Diff', strings.actions.chooseLanguage, { L: true }),
};
