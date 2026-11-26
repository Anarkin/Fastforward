import type { FileRowLook } from './fileRowLooks';

interface PartHit {
  readonly text: string;
  readonly left: number;
  readonly width: number;
  readonly whole: string;
  readonly file: boolean;
}

export interface FileHit {
  readonly index: number;
  readonly top: number;
  readonly height: number;
  readonly width: number;
  readonly pinned: boolean;
  readonly nameLeft: number;
  readonly mark: { readonly left: number; readonly width: number } | undefined;
  readonly parts: readonly PartHit[];
}

export type FileHitAt =
  | { readonly kind: 'row'; readonly row: FileHit }
  | { readonly kind: 'mark'; readonly row: FileHit }
  | { readonly kind: 'part'; readonly row: FileHit; readonly part: PartHit };

export function fileHitAt(
  hits: readonly FileHit[],
  x: number,
  y: number,
): FileHitAt | undefined {
  const pinned = hits.filter((hit) => hit.pinned);
  const row =
    pinned.find((hit) => y >= hit.top && y < hit.top + hit.height) ??
    (pinned.some((hit) => y < hit.top + hit.height)
      ? undefined
      : hits.find(
          (hit) => !hit.pinned && y >= hit.top && y < hit.top + hit.height,
        ));
  if (row === undefined || x < 0 || x >= row.width) {
    return undefined;
  }
  if (
    row.mark !== undefined &&
    x >= row.mark.left &&
    x < row.mark.left + row.mark.width
  ) {
    return { kind: 'mark', row };
  }
  const part = row.parts.find(
    (shown) => x >= shown.left && x < shown.left + shown.width,
  );
  return part === undefined
    ? { kind: 'row', row }
    : { kind: 'part', row, part };
}

export interface SeenFile {
  readonly index: number;
  readonly key: string;
  readonly kind: FileRowLook['kind'];
  readonly name: string;
  readonly path: string | undefined;
  readonly mark: string | undefined;
  readonly selected: boolean;
  readonly dimmed: boolean;
  readonly found: readonly string[];
  readonly open: boolean | undefined;
  readonly pinned: boolean;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly nameLeft: number;
  readonly parts: readonly {
    readonly text: string;
    readonly left: number;
    readonly width: number;
    readonly path: string;
  }[];
}
