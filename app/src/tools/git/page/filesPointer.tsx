import { useContext, useEffect, useEffectEvent, useState } from 'react';
import { keymap } from '../../../lib/page/keymap';
import { PathMenuContext } from '../../../lib/page/pathMenu';
import { changeMeaning } from '../../../lib/page/fileStatus';
import { tip, type TipProps } from '../../../lib/page/tips';
import { clicked } from '../../../lib/shared/keymap';
import { fileHitAt, type FileHit } from './fileHits';
import type { FileRowLook } from './fileRowLooks';

interface FileTipped {
  readonly key: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly said: TipProps;
}

function useFilesPointer({
  list,
  hits,
  lookOf,
  onRow,
}: {
  list: React.RefObject<HTMLElement | null>;
  hits: { current: readonly FileHit[] };
  lookOf: (index: number) => FileRowLook | undefined;
  onRow: (index: number) => void;
}) {
  const openMenu = useContext(PathMenuContext);
  const [tipped, setTipped] = useState<FileTipped>();

  const hitOf = (event: { clientX: number; clientY: number }) => {
    const element = list.current;
    if (element === null) {
      return undefined;
    }
    const box = element.getBoundingClientRect();
    return fileHitAt(
      hits.current,
      event.clientX - box.left - element.clientLeft,
      event.clientY - box.top - element.clientTop,
    );
  };

  const moved = useEffectEvent((event: PointerEvent) => {
    const hit = hitOf(event);
    const look = hit && lookOf(hit.row.index);
    const change =
      hit?.kind === 'mark' && look?.kind === 'file' ? look.change : undefined;
    const element = list.current;
    if (
      hit === undefined ||
      change === undefined ||
      element === null ||
      hit.row.mark === undefined
    ) {
      setTipped(undefined);
      return;
    }
    const key = `${hit.row.index} ${hit.row.pinned}`;
    const top = element.scrollTop + hit.row.top;
    setTipped((shown) =>
      shown?.key === key && shown.top === top
        ? shown
        : {
            key,
            left: hit.row.mark?.left ?? 0,
            top,
            width: hit.row.mark?.width ?? 0,
            height: hit.row.height,
            said: tip(changeMeaning(change)),
          },
    );
  });

  useEffect(() => {
    const element = list.current;
    if (element === null) {
      return undefined;
    }
    const left = () => setTipped(undefined);
    element.addEventListener('pointermove', moved);
    element.addEventListener('pointerleave', left);
    element.addEventListener('scroll', left);
    return () => {
      element.removeEventListener('pointermove', moved);
      element.removeEventListener('pointerleave', left);
      element.removeEventListener('scroll', left);
    };
  }, [list]);

  const onClick = useEffectEvent((event: MouseEvent) => {
    const hit = hitOf(event);
    if (hit !== undefined) {
      onRow(hit.row.index);
    }
  });

  const onContextMenu = useEffectEvent((event: MouseEvent) => {
    const hit = hitOf(event);
    if (hit?.kind !== 'part') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openMenu({
      path: hit.part.whole,
      file: hit.part.file,
      at: { x: event.clientX, y: event.clientY },
      extended: clicked(keymap.systemMenu, event) !== undefined,
    });
  });

  useEffect(() => {
    const element = list.current;
    if (element === null) {
      return undefined;
    }
    const click = (event: MouseEvent) => onClick(event);
    const menu = (event: MouseEvent) => onContextMenu(event);
    element.addEventListener('click', click);
    element.addEventListener('contextmenu', menu);
    return () => {
      element.removeEventListener('click', click);
      element.removeEventListener('contextmenu', menu);
    };
  }, [list]);

  return tipped;
}

export function FilesPointer({
  list,
  hits,
  lookOf,
  onRow,
}: {
  list: React.RefObject<HTMLElement | null>;
  hits: { current: readonly FileHit[] };
  lookOf: (index: number) => FileRowLook | undefined;
  onRow: (index: number) => void;
}) {
  const tipped = useFilesPointer({ list, hits, lookOf, onRow });
  return (
    tipped && (
      <span
        className="files-tip"
        style={{
          left: tipped.left,
          top: tipped.top,
          width: tipped.width,
          height: tipped.height,
        }}
        {...tipped.said}
      />
    )
  );
}
