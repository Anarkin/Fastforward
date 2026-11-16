import { restoreWhen } from '../../../lib/page/restore';

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

const holdsAtMost = 10_000;

export function holdBlockAtTop(
  scroller: HTMLElement,
  place: PreviewPlace,
  done: () => void,
  watch: (element: Element, changed: () => void) => () => void,
  wait = settleWait,
): () => void {
  let settled = false;
  const content = scroller.querySelector('.markdown');
  const restoring = restoreWhen(
    place,
    () => true,
    (wanted) => {
      const top = topOfBlock(scroller, wanted);
      if (top !== undefined) {
        scroller.scrollTop = top;
      }
      return settled;
    },
    {
      within: holdsAtMost,
      on: scroller,
      watch: (check) => {
        let quiet: ReturnType<typeof setTimeout> | undefined;
        const settling = () => {
          clearTimeout(quiet);
          quiet = setTimeout(() => {
            settled = true;
            check();
          }, wait);
        };
        const unwatch =
          content === null
            ? undefined
            : watch(content, () => {
                check();
                settling();
              });
        settling();
        return () => {
          clearTimeout(quiet);
          unwatch?.();
        };
      },
      ended: done,
    },
  );
  return restoring.stop;
}
