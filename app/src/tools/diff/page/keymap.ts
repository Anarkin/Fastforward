import { bind } from '../../../lib/shared/keymap';
import { strings } from '../../../lib/shared/strings';
import { diffKeymap } from '../../../components/diff/page/keymap';

export const diffGroups = ['Diff', 'Searching'] as const;

export const compareKeymap = {
  change: diffKeymap.change,
  sideways: diffKeymap.sideways,
  wheelSideways: diffKeymap.wheelSideways,
  wrap: diffKeymap.wrap,
  showWhitespace: diffKeymap.showWhitespace,
  language: diffKeymap.language,
  find: diffKeymap.find,
  match: diffKeymap.match,
  stopFinding: diffKeymap.stopFinding,
  closeCompare: bind('Diff', strings.actions.closeCompare, { Escape: true }),
  refresh: bind('Diff', strings.actions.compareAgain, {
    F2: true,
    'Ctrl+R': true,
  }),
};
