import { diffLayouts } from '../../../components/diff/shared/protocol';
import { areTextRequests } from '../../../components/diff/main/textRequests';
import type { DiffToHost } from '../shared/protocol';

export function isWellFormed(message: DiffToHost): boolean {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  switch (message.type) {
    case 'loadTexts':
      return areTextRequests(message.requests);
    case 'refresh':
      return true;
    case 'setShowEntireFile':
      return typeof message.show === 'boolean';
    case 'setIgnoreWhitespace':
      return typeof message.ignore === 'boolean';
    case 'setDiffLayout':
      return diffLayouts.includes(message.layout);
    case 'chooseVersion':
      return (
        (message.side === 'old' || message.side === 'new') &&
        (message.rev === undefined || typeof message.rev === 'string')
      );
    default:
      message satisfies never;
      return false;
  }
}
