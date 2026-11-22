export const views = {
  commander: {
    tab: 0,
    pane: '.commander-pane:not(.inactive) .virtual-rows',
    rows: '.virtual-row',
    vertical: '.commander-pane:not(.inactive) .virtual-rows',
    horizontal: undefined,
    across: undefined,
  },
  viewer: {
    tab: 1,
    pane: '.viewer-body',
    rows: '.viewer-rows .cell-rows',
    vertical: '.viewer-body .scroll-proxy.vertical',
    horizontal: '.viewer-sideways',
    across: '.viewer-sideways',
  },
  editor: {
    tab: 2,
    pane: '.editor .cm-scroller',
    rows: '.cm-line',
    vertical: '.editor .cm-scroller',
    horizontal: '.editor .cm-editor > .scroll-proxy-frame .scroll-proxy',
    across: '.editor .cm-scroller',
  },
  diff: {
    tab: 3,
    pane: '.diff-view .virtual-rows',
    rows: '.virtual-row',
    vertical: '.diff-view > .virtual-rows',
    horizontal: '.diff-view .scroll-proxy.horizontal',
    across: '.diff-row .split-code .code',
  },
  'commit list': {
    tab: 4,
    pane: '.virtual-rows.list',
    rows: '.virtual-row',
    vertical: '.virtual-rows.list',
    horizontal: undefined,
    across: undefined,
  },
  files: {
    tab: 5,
    pane: '.virtual-rows[role="tree"]',
    rows: '.virtual-row',
    vertical: '.virtual-rows[role="tree"]',
    horizontal: undefined,
    across: undefined,
  },
  thumbnails: {
    tab: 6,
    pane: '.commander-pane:not(.inactive) .virtual-rows',
    rows: '.virtual-row',
    vertical: '.commander-pane:not(.inactive) .virtual-rows',
    horizontal: undefined,
    across: undefined,
  },
} as const;

export type ViewName = keyof typeof views;

export interface Place {
  readonly state: string;
  readonly part: number;
  readonly onRow: boolean;
  readonly row: number;
}

export function placeDown(pane: Element, rows: string): Place {
  const top = pane.getBoundingClientRect().top;
  const header = pane.querySelector('.diff-stuck-header > *, .pinned-rows');
  const covered =
    (header?.getBoundingClientRect().bottom ?? top) -
    top +
    (parseFloat(getComputedStyle(pane).scrollPaddingTop) || 0);
  const boxes = [...pane.querySelectorAll(rows)]
    .flatMap((row) => {
      const seen = row instanceof HTMLElement ? row.seenRows?.() : undefined;
      const box = row.getBoundingClientRect();
      return seen === undefined
        ? [{ box, text: (row.textContent ?? '').slice(0, 24) }]
        : seen.map(({ text, left, top: at, height }) => ({
            box: new DOMRect(left, at, box.width, height),
            text: text.slice(0, 24),
          }));
    })
    .filter(({ box }) => box.height > 0 && box.bottom > top + covered + 0.5)
    .toSorted((one, other) => one.box.top - other.box.top);
  const [first] = boxes;
  const row = first?.box.height ?? 1;
  const lists = pane.querySelector('.viewer-rows');
  const turned = lists
    ? (pane.querySelector('.viewer-sideways')?.scrollTop ?? 0) / row
    : 0;
  const shifted = lists
    ? Math.abs(turned - Math.round(turned)) < 0.001
      ? 0
      : (turned - Math.floor(turned)) * row
    : pane.scrollTop % row;
  const offset = first ? first.box.top - top - covered : 0;
  return {
    state: `${Math.round(pane.scrollTop * 10)}|${first?.text ?? ''}|${Math.round(offset * 10)}`,
    part: shifted,
    onRow: boxes.some(({ box }) => Math.abs(box.top - top - covered) < 0.6),
    row,
  };
}

export function placeAcross(moved: Element): Place {
  const left =
    moved.scrollWidth > moved.clientWidth + 1
      ? moved.scrollLeft
      : -new DOMMatrix(getComputedStyle(moved).transform).m41;
  const probe = document.createElement('span');
  probe.style.cssText =
    'position: absolute; visibility: hidden; font-family: var(--monospace-font-family); font-size: var(--monospace-font-size); width: round(1ch, var(--device-pixel, 1px))';
  (moved.closest('.diff-view, .viewer, .cm-editor') ?? moved).append(probe);
  const column = probe.getBoundingClientRect().width || 1;
  probe.remove();
  const columns = left / column;
  return {
    state: String(Math.round(left * 10)),
    part: left % column,
    onRow: Math.abs(columns - Math.round(columns)) < 0.05,
    row: column,
  };
}

export function recordPainted(
  down: typeof placeDown,
  sideways: typeof placeAcross,
  pane: string,
  rows: string,
  moved: string | null,
): void {
  const seen: { readonly state: string; readonly at: number }[] = [];
  Reflect.set(window, 'placesPainted', seen);
  Reflect.set(window, 'placesWatched', true);
  const read = () => {
    const element = document.querySelector(moved ?? pane);
    if (element !== null) {
      seen.push({
        state:
          moved === null ? down(element, rows).state : sideways(element).state,
        at: performance.now(),
      });
    }
  };
  const frame = () => {
    if (Reflect.get(window, 'placesWatched') !== true) {
      return;
    }
    const painted = new MessageChannel();
    painted.port1.addEventListener('message', read, { once: true });
    painted.port1.start();
    painted.port2.postMessage(0);
    requestAnimationFrame(frame);
  };
  read();
  requestAnimationFrame(frame);
}

export function paintedPlaces(): { state: string; at: number }[] {
  Reflect.set(window, 'placesWatched', false);
  const seen: unknown = Reflect.get(window, 'placesPainted');
  return Array.isArray(seen)
    ? seen.map((each: unknown) => ({
        state: String(Reflect.get(Object(each), 'state')),
        at: Number(Reflect.get(Object(each), 'at')),
      }))
    : [];
}

export function thumbShownAt(bar: {
  readonly axis: string;
  readonly left: number;
  readonly top: number;
}): boolean | null {
  const cover = document.querySelector(`.scrollbar-cover.${bar.axis}.shown`);
  const thumb = cover?.querySelector<HTMLElement>('.scrollbar-thumb');
  const box = cover?.getBoundingClientRect();
  return !thumb ||
    !box ||
    Math.abs(box.left - bar.left) > 1 ||
    Math.abs(box.top - bar.top) > 1
    ? null
    : !thumb.hidden;
}

const longestFrame = 100;

export function stalled(
  painted: readonly { state: string; at: number }[],
): boolean {
  const first = painted.findIndex((each) => each.state !== painted[0]?.state);
  const last = painted.findLastIndex(
    (each, index) => index > 0 && each.state !== painted[index - 1]?.state,
  );
  return (
    first !== -1 &&
    painted
      .slice(first, last + 1)
      .some(
        (each, index) =>
          each.at - (painted[first + index - 1]?.at ?? each.at) > longestFrame,
      )
  );
}
