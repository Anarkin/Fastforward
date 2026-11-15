import { bind } from '../../../lib/shared/keymap';
import { strings } from '../../../lib/shared/strings';
import { gitKeymap } from './keymap';

export const diffGroups = ['Diff', 'Searching'] as const;

export const compareKeymap = {
  change: gitKeymap.change,
  sideways: gitKeymap.sideways,
  wheelSideways: gitKeymap.wheelSideways,
  wrap: gitKeymap.wrap,
  showWhitespace: gitKeymap.showWhitespace,
  language: gitKeymap.language,
  find: gitKeymap.find,
  match: gitKeymap.match,
  stopFinding: gitKeymap.stopFinding,
  closeCompare: bind('Diff', strings.actions.closeCompare, { Escape: true }),
};
