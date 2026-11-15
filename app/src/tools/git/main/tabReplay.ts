import type { GitToWebview, GitToWebviewOf } from '../shared/protocol';
import type { TabState } from './tabState';
import { anchorOf, indexTarget, keysFrom } from './tabLayout';

export interface Shown {
  repository?: GitToWebviewOf<'repository'>;
  fetching?: GitToWebviewOf<'fetching'>;
  pulling?: GitToWebviewOf<'pulling'>;
  pushing?: GitToWebviewOf<'pushing'>;
  pushingTag?: GitToWebviewOf<'pushingTag'>;
  pullingBranch?: GitToWebviewOf<'pullingBranch'>;
  pushingBranch?: GitToWebviewOf<'pushingBranch'>;
  applyingSolo?: GitToWebviewOf<'applyingSolo'>;
  navigation?: GitToWebviewOf<'navigation'>;
  commits?: GitToWebviewOf<'commits'>;
  workingTree?: GitToWebviewOf<'workingTree'>;
  files?: GitToWebviewOf<'files'>;
  diff?: GitToWebviewOf<'diff'> | GitToWebviewOf<'fileContent'>;
  fileDiffs?: ReadonlyMap<string, GitToWebviewOf<'fileDiff'>>;
  tree?: GitToWebviewOf<'tree'>;
}

export function keep(shown: Shown, message: GitToWebview): void {
  switch (message.type) {
    case 'repository':
      shown.repository = message;
      break;
    case 'fetching':
      shown.fetching = message;
      break;
    case 'pulling':
      shown.pulling = message;
      break;
    case 'pushing':
      shown.pushing = message;
      break;
    case 'pushingTag':
      shown.pushingTag = message;
      break;
    case 'pullingBranch':
      shown.pullingBranch = message;
      break;
    case 'pushingBranch':
      shown.pushingBranch = message;
      break;
    case 'applyingSolo':
      shown.applyingSolo = message;
      break;
    case 'navigation':
      shown.navigation = message;
      break;
    case 'commits':
      shown.commits = message;
      break;
    case 'workingTree':
      shown.workingTree = message;
      break;
    case 'files':
      shown.files = message;
      break;
    case 'diff':
    case 'fileContent':
      shown.diff = message;
      shown.fileDiffs = undefined;
      break;
    case 'fileDiff':
      shown.fileDiffs = new Map(shown.fileDiffs).set(message.path, message);
      break;
    case 'tree':
      shown.tree = message;
      break;
  }
}

export function replayOf(tab: TabState): GitToWebview[] {
  const { shown } = tab;
  const selected = [shown.files, shown.diff, shown.tree].filter(
    (message) => message?.hash === tab.hash,
  );
  return [
    shown.repository,
    shown.fetching,
    shown.pulling,
    shown.pushing,
    shown.pushingTag,
    shown.pullingBranch,
    shown.pushingBranch,
    shown.applyingSolo,
    shown.navigation,
    shown.commits && {
      ...shown.commits,
      selectedIndex: tab.index,
      keysFrom: keysFrom(tab),
      scrollTarget: anchorOf(tab) ?? indexTarget(tab.index),
    },
    shown.workingTree,
    ...selected,
  ].filter((message) => message !== undefined);
}
