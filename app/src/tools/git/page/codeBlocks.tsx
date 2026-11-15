import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FindRange } from './find';
import { blocksNear, blocksOf, drawnRuns, rowBlocks } from './rowBlocks';

const sameBlocks = (one: ReadonlySet<number>, other: ReadonlySet<number>) =>
  one.size === other.size && [...one].every((block) => other.has(block));

const noBlocks: ReadonlySet<number> = new Set();

export function CodeBlocks({
  starts,
  length,
  lineHeight,
  current,
  draw,
}: {
  readonly starts: readonly number[];
  readonly length: number;
  readonly lineHeight: number;
  readonly current: FindRange | undefined;
  readonly draw: (from: number, to: number) => React.ReactNode;
}) {
  const blocks = useMemo(() => rowBlocks(starts, length), [starts, length]);
  const element = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState({ blocks, shown: noBlocks });
  useLayoutEffect(() => {
    const own = element.current;
    if (!own) {
      return undefined;
    }
    const root = own.closest('.virtual-rows');
    const view =
      root?.getBoundingClientRect() ??
      new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const { top } = own.getBoundingClientRect();
    const shown = blocksNear(
      blocks,
      lineHeight,
      view.top - view.height - top,
      view.bottom + view.height - top,
    );
    const show = () =>
      setNear((last) =>
        last.blocks === blocks && sameBlocks(last.shown, shown)
          ? last
          : { blocks, shown: new Set(shown) },
      );
    show();
    const indexes = new Map<Element, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const { target, isIntersecting } of entries) {
          const index = indexes.get(target);
          if (index === undefined) {
            continue;
          }
          if (isIntersecting) {
            shown.add(index);
          } else {
            shown.delete(index);
          }
        }
        show();
      },
      { root, rootMargin: '100% 0px' },
    );
    for (const [index, block] of [
      ...own.querySelectorAll(':scope > .code-block'),
    ].entries()) {
      indexes.set(block, index);
      observer.observe(block);
    }
    return () => observer.disconnect();
  }, [blocks, lineHeight]);
  const shown = near.blocks === blocks ? near.shown : noBlocks;
  const runs = drawnRuns(
    blocks,
    new Set([...shown, ...blocksOf(blocks, current)]),
  );
  return (
    <span
      ref={element}
      className="code-blocks"
      style={{ height: starts.length * lineHeight }}
    >
      {blocks.map(({ row, rows }, index) => (
        <span
          key={index}
          className="code-block"
          style={{ top: row * lineHeight, height: rows * lineHeight }}
        />
      ))}
      {runs.map(({ from, to, row }, index) => (
        <span
          key={index}
          className="code-run"
          style={{ top: row * lineHeight, ...(row > 0 && { textIndent: 0 }) }}
        >
          {draw(from, to)}
        </span>
      ))}
    </span>
  );
}
