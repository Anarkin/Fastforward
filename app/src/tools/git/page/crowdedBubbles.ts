import { useMemo, useState } from 'react';
import type { CrowdedCommit } from '../shared/protocol';
import {
  lookKey,
  looksOn,
  type BubbleLook,
  type CommitSurroundings,
} from './bubbleLooks';
import { bubbleRowsOf } from './bubbleLines';
import { noBubbleRoom, type BubbleRoom } from './bubbleRoom';
import type { CommitHistory } from './commitHistory';
import { rowLanes } from './graphLanes';
import { detachedHead } from './selectors';
import { useGit } from './store';

const noCrowded: readonly CrowdedCommit[] = [];

function useCommitSurroundings(): CommitSurroundings {
  const refsByCommit = useGit((state) => state.refsByCommit);
  const stashCommits = useGit((state) => state.stashCommits);
  const bookmarked = useGit((state) => state.bookmarked);
  const detached = useGit(detachedHead);
  const head = useGit((state) => state.tab.repository?.head);
  const hideDimmed = useGit((state) => state.hideDimmed);
  const elsewhere = useGit((state) => state.elsewhere);
  const tagRemote = useGit((state) => state.tab.repository?.tagRemote);
  const tagsOnRemote = useGit((state) => state.tagsOnRemote);
  return useMemo(
    () => ({
      refsByCommit,
      stashCommits,
      bookmarked,
      detached,
      head,
      hideDimmed,
      elsewhere,
      tagRemote,
      tagsOnRemote,
    }),
    [
      refsByCommit,
      stashCommits,
      bookmarked,
      detached,
      head,
      hideDimmed,
      elsewhere,
      tagRemote,
      tagsOnRemote,
    ],
  );
}

export function useCrowdedBubbles(
  history: CommitHistory | undefined,
  version: number,
): {
  readonly crowded: readonly CrowdedCommit[];
  readonly looks: readonly BubbleLook[];
  readonly rows: ReadonlyMap<number, readonly number[]>;
  readonly onRoom: (room: BubbleRoom) => void;
} {
  const around = useCommitSurroundings();
  const crowded = history?.crowded ?? noCrowded;
  const crowdedLooks = useMemo(
    () =>
      crowded.map((commit) => {
        const looks = looksOn(commit.hash, around);
        return { ...commit, looks, keys: looks.map(lookKey) };
      }),
    [crowded, around],
  );
  const looks = useMemo(() => {
    const distinct = new Map<string, BubbleLook>();
    for (const { looks: each, keys } of crowdedLooks) {
      each.forEach((look, at) => distinct.set(keys[at] ?? '', look));
    }
    return [...distinct.values()];
  }, [crowdedLooks]);
  const [room, setRoom] = useState(noBubbleRoom);
  const lanesLoaded = crowded.some((commit) => commit.lanes === 0)
    ? version
    : 0;
  const graphLoaded = useMemo(
    () => ({ history, version: lanesLoaded }),
    [history, lanesLoaded],
  );
  const rows = useMemo(
    () =>
      bubbleRowsOf(crowdedLooks, room.advances, room.width, (position) =>
        rowLanes(graphLoaded.history?.graphAt(position)),
      ),
    [crowdedLooks, room, graphLoaded],
  );
  return { crowded, looks, rows, onRoom: setRoom };
}
