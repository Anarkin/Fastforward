import type { TabMessage } from '../shared/protocol';
import { hiddenSides, type TabState } from './tabState';

export function needsNoWholeHistory(
  tab: TabState,
  message: TabMessage,
): boolean {
  switch (message.type) {
    case 'loadCommits':
    case 'viewFile':
    case 'fetch':
    case 'pull':
    case 'push':
    case 'pushTag':
    case 'pullBranch':
    case 'pushBranch':
    case 'prefetchDiff':
    case 'prefetchTexts':
      return true;
    case 'checkout':
      return (
        message.target.kind !== 'commit' ||
        tab.fullHistory.has(message.target.hash)
      );
    case 'selectCommit':
      return (
        message.hash === undefined ||
        hiddenSides(tab, message.hash).length === 0
      );
    case 'selectFile':
    case 'loadTree':
    case 'loadTexts':
    case 'loadFileDiff':
      return hiddenSides(tab, message.hash).length === 0;
    default:
      return false;
  }
}
