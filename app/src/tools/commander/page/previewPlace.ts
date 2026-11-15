interface PreviewPlace {
  readonly block: number | undefined;
  readonly offset: number;
}

const blocksOf = (scroller: Element) =>
  scroller.querySelector('.markdown')?.children ?? [];

export function blockAtTop(scroller: Element): PreviewPlace {
  const top = scroller.getBoundingClientRect().top;
  const blocks = [...blocksOf(scroller)];
  const block = blocks.findIndex(
    (each) => each.getBoundingClientRect().bottom > top,
  );
  const shown = blocks[block];
  return shown === undefined
    ? { block: undefined, offset: 0 }
    : { block, offset: top - shown.getBoundingClientRect().top };
}

export function topOfBlock(
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
