import { diffLayouts } from '../../../lib/shared/changes';
import { areTextRequests } from '../../../lib/main/textRequests';
import type { DiffToHost } from '../shared/protocol';

export function isWellFormed(message: DiffToHost): boolean {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  switch (message.type) {
    case 'loadTexts':
      return areTextRequests(message.requests);
    case 'setShowEntireFile':
      return typeof message.show === 'boolean';
    case 'setIgnoreWhitespace':
      return typeof message.ignore === 'boolean';
    case 'setDiffLayout':
      return diffLayouts.includes(message.layout);
    default:
      message satisfies never;
      return false;
  }
}
