import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import type { PartLook } from '../shared/partLooks';
import { pathParts } from '../shared/pathParts';
import { fileColorOf, noFileColors, type FileColors } from './fileColors';

export type PartLooks = readonly (PartLook | null | undefined)[];

export type KnownLooks = ReadonlyMap<string, PartLook | null>;

export interface PathLooksSource {
  readonly subscribe: (changed: () => void) => () => void;
  readonly fileColors: () => FileColors;
  readonly known: () => KnownLooks;
  readonly ask: (path: string) => void;
  readonly know: (path: string, looks: PartLooks) => void;
  readonly dotHides: () => boolean;
}

const unchanging = () => () => {};

const nothingKnown: KnownLooks = new Map();

export const PathLooksContext = createContext<PathLooksSource>({
  subscribe: unchanging,
  fileColors: () => noFileColors,
  known: () => nothingKnown,
  ask: () => {},
  know: () => {},
  dotHides: () => false,
});

export function knownWith(
  known: KnownLooks,
  answers: readonly { readonly path: string; readonly parts: PartLooks }[],
): KnownLooks {
  const next = new Map(known);
  for (const { path, parts } of answers) {
    pathParts(path).forEach((part, index) => {
      const look = parts[index];
      if (look !== undefined) {
        next.set(part.path, look);
      }
    });
  }
  return next;
}

export function newlyKnown(
  known: KnownLooks,
  path: string,
  looks: PartLooks,
): boolean {
  return pathParts(path).some((part, index) => {
    const look = looks[index];
    const was = known.get(part.path);
    return (
      look !== undefined &&
      (was === undefined ||
        was?.hidden !== look?.hidden ||
        was?.file !== look?.file)
    );
  });
}

export interface ShownPart {
  readonly key: string;
  readonly name: string;
  readonly separator: string;
  readonly at: number;
  readonly className: string;
  readonly style:
    (CSSProperties & { readonly '--file-color'?: string }) | undefined;
}

export function shownParts(
  path: string,
  file: boolean,
  looks: PartLooks | undefined,
  fileColors: FileColors,
  dotHides = false,
): readonly ShownPart[] {
  const parts = pathParts(path);
  const last = parts.length - 1;
  let at = 0;
  return parts.map((part, index) => {
    const look = looks?.[index] ?? undefined;
    const folder = look === undefined ? !(file && index === last) : !look.file;
    const color = fileColorOf(
      {
        name: part.name,
        folder,
        ...(look?.executable === true && { executable: true }),
      },
      fileColors,
    );
    const hidden =
      look === undefined ? dotHides && part.name.startsWith('.') : look.hidden;
    const shown = {
      key: part.path,
      name: part.name,
      separator: part.separator,
      at,
      className: [
        'path-part',
        ...(color === undefined ? [] : ['colored']),
        ...(hidden ? ['hidden'] : []),
      ].join(' '),
      style: color === undefined ? undefined : { '--file-color': color },
    };
    at += part.name.length + part.separator.length;
    return shown;
  });
}

export function joinedPath(root: string | undefined, path: string): string {
  if (root === undefined || root === '') {
    return path;
  }
  const separator = root.includes('\\') ? '\\' : '/';
  return /[\\/]$/.test(root) ? `${root}${path}` : `${root}${separator}${path}`;
}

function lastOf(
  looks: PartLooks | undefined,
  count: number,
): PartLooks | undefined {
  return looks === undefined ? undefined : looks.slice(looks.length - count);
}

export function usePathParts(
  path: string,
  {
    file = false,
    looks,
    root,
  }: {
    readonly file?: boolean;
    readonly looks?: PartLooks;
    readonly root?: string;
  },
): readonly ShownPart[] {
  const source = useContext(PathLooksContext);
  const fileColors = useSyncExternalStore(
    source.subscribe,
    source.fileColors,
    source.fileColors,
  );
  const whole = joinedPath(root, path);
  const wanted =
    looks === undefined && /^(?:[a-zA-Z]:|[\\/])/.test(whole)
      ? whole
      : undefined;
  const known = useSyncExternalStore(
    source.subscribe,
    source.known,
    source.known,
  );
  const asked =
    wanted === undefined
      ? undefined
      : pathParts(wanted).map((part) => known.get(part.path));
  const unknown = asked?.includes(undefined) === true;
  useEffect(() => {
    if (wanted !== undefined && unknown) {
      source.ask(wanted);
    }
  }, [source, wanted, unknown]);
  const shared = file ? looks?.slice(0, -1) : looks;
  useEffect(() => {
    if (shared !== undefined && shared.length > 0) {
      source.know(path, shared);
    }
  }, [source, path, shared]);
  return shownParts(
    path,
    file,
    looks ?? lastOf(asked, pathParts(path).length),
    fileColors,
    source.dotHides(),
  );
}
