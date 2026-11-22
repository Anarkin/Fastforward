import { bind } from '../../../lib/shared/keymap';
import { strings } from '../../../lib/shared/strings';

export const diffKeymap = {
  find: bind('Searching', strings.actions.find, { 'Mod+F': true }),
  match: bind(
    'Searching',
    strings.actions.match,
    { Enter: 1, 'Shift+Enter': -1 },
    { repeats: true, fields: true },
  ),
  stopFinding: bind(
    'Searching',
    strings.actions.stopFinding,
    { Escape: true },
    { fields: true },
  ),
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
  wrap: bind('Diff', strings.actions.wrap, { W: true }),
  showWhitespace: bind('Diff', strings.actions.showWhitespace, { '.': true }),
  language: bind('Diff', strings.actions.chooseLanguage, { L: true }),
};
