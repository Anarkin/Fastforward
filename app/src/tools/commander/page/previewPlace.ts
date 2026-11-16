interface PreviewPlace {
  readonly block: number | undefined;
  readonly offset: number;
}

const blocksOf = (scroller: Element) =>
  scroller.querySelector('.markdown')?.children ?? [];

export function blockAtTop(scroller: Element): PreviewPlace {
  const top = scroller.getBoundingClientRect().top;
  const blocks = blocksOf(scroller);
  let low = 0;
  let high = blocks.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const bottom = blocks[middle]?.getBoundingClientRect().bottom ?? top;
    if (bottom > top) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  const shown = blocks[low];
  return shown === undefined
    ? { block: undefined, offset: 0 }
    : { block: low, offset: top - shown.getBoundingClientRect().top };
}

function topOfBlock(
  scroller: Element,
  { block, offset }: PreviewPlace,
): number | undefined {
  const blocks = blocksOf(scroller);
  const shown =
    block === undefined
      ? undefined
      : blocks[Math.min(block, blocks.length - 1)];
  return shown === undefined
    ? undefined
    : shown.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop +
        offset;
}

export const settleWait = 1500;

const handsOn = ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const;

export function holdBlockAtTop(
  scroller: HTMLElement,
  place: PreviewPlace,
  done: () => void,
  watch: (element: Element, changed: () => void) => () => void,
  wait = settleWait,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopWatching: (() => void) | undefined;
  let held = true;
  const stop = () => {
    if (!held) {
      return;
    }
    held = false;
    clearTimeout(timer);
    stopWatching?.();
    for (const kind of handsOn) {
      scroller.removeEventListener(kind, stop);
    }
    done();
  };
  const settledSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(stop, wait);
  };
  const hold = () => {
    const top = topOfBlock(scroller, place);
    if (top !== undefined) {
      scroller.scrollTop = top;
    }
    settledSoon();
  };
  const content = scroller.querySelector('.markdown');
  if (content !== null) {
    stopWatching = watch(content, hold);
  }
  for (const kind of handsOn) {
    scroller.addEventListener(kind, stop, { passive: true });
  }
  hold();
  return stop;
}
