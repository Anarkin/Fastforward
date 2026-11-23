import { useMemo, useState } from 'react';
import type { CrowdedCommit } from '../shared/protocol';
import {
  lookKey,
  looksOn,
  type BubbleLook,
  type CommitSurroundings,
} from './bubbleLooks';
import { measuredCrowds, type MeasuredCrowd } from './bubbleLines';
import type { CommitHistory } from './commitHistory';
import { CrowdLayout } from './crowdLayout';
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
      elsewhere,
      tagRemote,
      tagsOnRemote,
    ],
  );
}

const noAdvances: ReadonlyMap<string, number> = new Map();

export function useCrowdedBubbles(
  history: CommitHistory | undefined,
  version: number,
): {
  readonly looks: ReadonlyMap<string, BubbleLook>;
  readonly crowds: readonly MeasuredCrowd[];
  readonly layout: CrowdLayout;
  readonly onAdvances: (advances: ReadonlyMap<string, number>) => void;
} {
  const around = useCommitSurroundings();
  const crowded = history?.crowded ?? noCrowded;
  const spots = history?.crowdedSpots ?? noCrowded;
  const crowdedLooks = useMemo(
    () =>
      spots.map(({ position, hash }) => {
        const looks = looksOn(hash, around);
        return { position, looks, keys: looks.map(lookKey) };
      }),
    [spots, around],
  );
  const looks = useMemo(() => {
    const distinct = new Map<string, BubbleLook>();
    for (const { looks: each, keys } of crowdedLooks) {
      each.forEach((look, at) => distinct.set(keys[at] ?? '', look));
    }
    return distinct;
  }, [crowdedLooks]);
  const [advances, setAdvances] = useState(noAdvances);
  const [layout] = useState(() => new CrowdLayout());
  const lanesLoaded = crowded.some((commit) => commit.lanes === 0)
    ? version
    : 0;
  const graphLoaded = useMemo(
    () => ({ history, crowded, version: lanesLoaded }),
    [history, crowded, lanesLoaded],
  );
  const crowds = useMemo(
    () =>
      measuredCrowds(
        crowdedLooks,
        advances,
        (position) =>
          graphLoaded.history?.crowdedLanesAt(position) ||
          rowLanes(graphLoaded.history?.graphAt(position)),
      ),
    [crowdedLooks, advances, graphLoaded],
  );
  return { looks, crowds, layout, onAdvances: setAdvances };
}
