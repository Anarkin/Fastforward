import type { BookmarkRef, RefInfo, Tracking } from '../shared/protocol';
import { shortHash } from '../../../lib/shared/hashes';
import { strings } from '../../../lib/shared/strings';
import { inPairs } from './bubbleOrder';

export type ActionKey = 'pull' | 'push';

export interface ActionLook {
  readonly key: ActionKey;
  readonly count: number;
  readonly idle: boolean;
}

export interface BubbleLook {
  readonly kind: string;
  readonly text: string;
  readonly actions: readonly ActionLook[];
}

export interface RefSurroundings {
  readonly head: string | undefined;
  readonly hideDimmed: boolean;
  readonly elsewhere: ReadonlySet<string>;
  readonly tagRemote: string | undefined;
  readonly tagsOnRemote: ReadonlySet<string>;
}

export interface CommitSurroundings extends RefSurroundings {
  readonly refsByCommit: ReadonlyMap<string, readonly RefInfo[]>;
  readonly stashCommits: ReadonlySet<string>;
  readonly bookmarked: ReadonlySet<string>;
  readonly detached: string | undefined;
}

export type Bubble =
  | { readonly type: 'head' }
  | { readonly type: 'ref'; readonly ref: RefInfo }
  | { readonly type: 'bookmark' }
  | { readonly type: 'stash' };

const noRefs: readonly RefInfo[] = [];

export function isCheckedOut(
  ref: BookmarkRef,
  head: string | undefined,
): boolean {
  return ref.kind === 'branch' && ref.name === head;
}

function trackedActions(
  tracking: Tracking | undefined,
): [ActionLook, ActionLook] {
  const counted = tracking !== undefined && !('gone' in tracking);
  const behind = counted ? tracking.behind : 0;
  const ahead = counted ? tracking.ahead : 0;
  const diverged = ahead > 0 && behind > 0;
  return [
    { key: 'pull', count: behind, idle: behind === 0 || diverged },
    {
      key: 'push',
      count: ahead,
      idle: (tracking !== undefined && ahead === 0) || diverged,
    },
  ];
}

export function refActions(
  ref: BookmarkRef,
  tracking: Tracking | undefined,
  around: RefSurroundings,
): ActionLook[] {
  const [pull, push] = trackedActions(tracking);
  const all: ActionLook[] = isCheckedOut(ref, around.head)
    ? [pull, push]
    : ref.kind === 'branch'
      ? [{ ...pull, idle: pull.idle || around.elsewhere.has(ref.name) }, push]
      : ref.kind === 'tag'
        ? [
            {
              key: 'push',
              count: 0,
              idle:
                around.tagRemote === undefined ||
                around.tagsOnRemote.has(ref.name),
            },
          ]
        : [];
  return all.filter((action) => !around.hideDimmed || !action.idle);
}

export function bubblesOn(
  hash: string,
  around: Pick<
    CommitSurroundings,
    'refsByCommit' | 'stashCommits' | 'bookmarked' | 'detached'
  >,
): Bubble[] {
  const detached = around.detached === hash;
  return [
    ...(detached ? [{ type: 'head' } as const] : []),
    ...inPairs(around.refsByCommit.get(hash) ?? noRefs).map(
      (ref) => ({ type: 'ref', ref }) as const,
    ),
    ...(around.bookmarked.has(hash) && !detached
      ? [{ type: 'bookmark' } as const]
      : []),
    ...(around.stashCommits.has(hash) ? [{ type: 'stash' } as const] : []),
  ];
}

export function lookOf(
  bubble: Bubble,
  hash: string,
  around: RefSurroundings,
): BubbleLook {
  if (bubble.type === 'head') {
    return {
      kind: 'head',
      text: strings.commits.head(shortHash(hash)),
      actions: [],
    };
  }
  if (bubble.type === 'ref') {
    return {
      kind: bubble.ref.kind,
      text: bubble.ref.name,
      actions: refActions(bubble.ref, bubble.ref.tracking, around),
    };
  }
  return bubble.type === 'bookmark'
    ? { kind: 'hash', text: shortHash(hash), actions: [] }
    : { kind: 'stash', text: strings.commits.stash, actions: [] };
}

export function lookKey(look: BubbleLook): string {
  return [
    look.kind,
    look.text,
    ...look.actions.map((action) => `${action.key}${action.count}`),
  ].join('\n');
}

export function looksOn(
  hash: string,
  around: CommitSurroundings,
): BubbleLook[] {
  return bubblesOn(hash, around).map((bubble) => lookOf(bubble, hash, around));
}
