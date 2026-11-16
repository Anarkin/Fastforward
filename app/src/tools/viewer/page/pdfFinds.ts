export interface PdfFound {
  readonly current: number;
  readonly total: number;
  readonly done: boolean;
  readonly settled: boolean;
}

interface FindEvents {
  on(name: string, listener: (event: FindEvent) => void): void;
}

interface FindEvent {
  readonly matchesCount?: { readonly current: number; readonly total: number };
  readonly state?: number;
}

interface FindMatches {
  readonly pageMatches: readonly unknown[] | undefined;
  readonly selected:
    { readonly pageIdx: number; readonly matchIdx: number } | undefined;
}

export function reportFinds(
  eventBus: FindEvents,
  matches: FindMatches,
  pages: () => number,
  pendingState: number,
  onFound: (found: PdfFound) => void,
): void {
  let pending = false;
  let told = { current: 0, total: 0 };
  const searched = () => {
    const found: (readonly unknown[])[] = [];
    for (let page = 0; page < pages(); page++) {
      const onPage = matches.pageMatches?.[page];
      if (!Array.isArray(onPage)) {
        return undefined;
      }
      found.push(onPage);
    }
    return found;
  };
  const tell = () => {
    const found = pending ? undefined : searched();
    if (found === undefined) {
      onFound({ ...told, done: !pending, settled: false });
      return;
    }
    const { pageIdx, matchIdx } = matches.selected ?? {
      pageIdx: -1,
      matchIdx: -1,
    };
    const total = found.reduce((sum, onPage) => sum + onPage.length, 0);
    const before = found
      .slice(0, Math.max(0, pageIdx))
      .reduce((sum, onPage) => sum + onPage.length, 0);
    const current = matchIdx < 0 ? 0 : before + matchIdx + 1;
    onFound({
      current: current > total ? 0 : current,
      total,
      done: true,
      settled: true,
    });
  };
  const counted = ({ matchesCount, state }: FindEvent) => {
    pending = state === pendingState;
    told = {
      current: matchesCount?.current ?? 0,
      total: matchesCount?.total ?? 0,
    };
    tell();
  };
  eventBus.on('updatefindmatchescount', counted);
  eventBus.on('updatefindcontrolstate', counted);
  eventBus.on('updatetextlayermatches', () => {
    if (!pending && searched() !== undefined) {
      tell();
    }
  });
}
