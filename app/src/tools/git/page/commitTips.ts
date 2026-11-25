import { labelTip, tip, type TipProps } from '../../../lib/page/tips';
import { strings } from '../../../lib/shared/strings';
import { workingTreeHash, type GraphRow } from '../shared/protocol';
import type { Box, Hit } from './commitHits';
import {
  commitBookmarkTarget,
  commitMenuTarget,
  refMenuTarget,
  type MenuTarget,
} from './menus';

function mergeTitle(row: GraphRow): string {
  if (row.merge === 'expanded') {
    return strings.commits.collapseMerge;
  }
  const hidden = row.hidden ?? 0;
  return hidden > 0
    ? strings.commits.merged(hidden)
    : strings.commits.expandMerge;
}

const isRef = (
  kind: string,
): kind is 'branch' | 'remote' | 'tag' | 'remote-tag' =>
  kind === 'branch' ||
  kind === 'remote' ||
  kind === 'tag' ||
  kind === 'remote-tag';

export function tipOf(
  hit: Hit | undefined,
  hash: string | undefined,
  graphRow: GraphRow | undefined,
  tagRemote: string | undefined,
): TipProps {
  if (hit === undefined || hit.kind === 'row') {
    return {};
  }
  if (hit.kind === 'merge') {
    return graphRow === undefined ? {} : tip(mergeTitle(graphRow));
  }
  const { look, checkedOut } = hit.bubble.bubble;
  if (hit.kind === 'action') {
    return labelTip(
      look.kind === 'tag'
        ? strings.commits.pushTag(look.text, tagRemote)
        : hit.action.key === 'pull'
          ? strings.navigation.pull
          : strings.navigation.push,
    );
  }
  if (look.kind === 'head') {
    return tip(strings.commits.detachedAt(hash ?? ''));
  }
  if (look.kind === 'hash') {
    return tip(strings.commits.commit(hash ?? ''));
  }
  if (!isRef(look.kind)) {
    return {};
  }
  return checkedOut
    ? tip(strings.commits.checkedOut(look.text))
    : hit.bubble.cut
      ? tip(look.text)
      : {};
}

export function boxOf(hit: Hit): Box {
  return hit.kind === 'merge'
    ? hit.box
    : hit.kind === 'action'
      ? hit.action
      : hit.kind === 'bubble'
        ? hit.bubble
        : { left: 0, top: hit.row.top, width: 0, height: hit.row.height };
}

export function menuOf(
  hit: Hit | undefined,
  hash: string | undefined,
  stashes: ReadonlySet<string>,
): MenuTarget | undefined {
  if (hit === undefined || hash === undefined || hash === workingTreeHash) {
    return undefined;
  }
  if (hit.kind === 'bubble' || hit.kind === 'action') {
    const { look } = hit.bubble.bubble;
    return isRef(look.kind)
      ? refMenuTarget({ kind: look.kind, name: look.text })
      : look.kind === 'head' || look.kind === 'hash'
        ? commitBookmarkTarget(hash)
        : undefined;
  }
  return stashes.has(hash) ? undefined : commitMenuTarget(hash);
}
